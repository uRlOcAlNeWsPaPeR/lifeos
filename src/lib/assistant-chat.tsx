"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { authedApi } from "@/lib/client";
import { useAppData } from "@/lib/store/app-data";
import type { AssistantAction } from "@/lib/ai/types";

// The assistant chat lives here — ABOVE the /assistant page — so it survives
// moving between pages in the app: an in-flight "thinking" request keeps going,
// the transcript stays, and an unsent draft in the input bar is kept. It's also
// mirrored to localStorage so a full reload restores it, UNLESS the last activity
// was more than TTL_MS ago, in which case the conversation is considered stale
// and cleared.

export interface AssistantReference {
  type: "task" | "goal" | "assignment" | "course" | "event";
  id: string;
  title: string;
}

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
  references?: AssistantReference[];
  actions?: AssistantAction[];
  engine?: string;
}

export type ActionStatus = "idle" | "working" | "done" | "error" | "dismissed";

interface AssistantChat {
  turns: AssistantTurn[];
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  hydrated: boolean;
  /** questions used today (server count + this session's optimistic sends) */
  used: number;
  perDay: number | null;
  actionStatus: Record<string, ActionStatus>;
  setActionStatus: (key: string, status: ActionStatus) => void;
  ask: (question: string) => Promise<void>;
  clear: () => void;
  /** Drop the conversation if it's gone stale (called when returning to the page). */
  pruneIfStale: () => void;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes of inactivity clears the chat
const STORAGE_KEY = "lifeos:assistant-chat:v1";

interface Persisted {
  turns: AssistantTurn[];
  input: string;
  actionStatus: Record<string, ActionStatus>;
  updatedAt: number;
}

function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    if (!p || typeof p.updatedAt !== "number" || !Array.isArray(p.turns)) return null;
    if (Date.now() - p.updatedAt > TTL_MS) return null;
    return p;
  } catch {
    return null;
  }
}

function writePersisted(p: Omit<Persisted, "updatedAt">) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...p, updatedAt: Date.now() }));
  } catch {
    /* private mode / quota — the chat still works in memory */
  }
}

function clearPersisted() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const Ctx = createContext<AssistantChat | null>(null);

export function useAssistantChat(): AssistantChat {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAssistantChat must be used inside <AssistantChatProvider>");
  return v;
}

export function AssistantChatProvider({ children }: { children: React.ReactNode }) {
  const { data } = useAppData();
  const perDay = data.limits.assistantPerDay;
  const serverUsed = data.limits.assistantUsedToday;

  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [input, setInput] = useState("");
  const [actionStatus, setActionStatusMap] = useState<Record<string, ActionStatus>>({});
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Optimistic "used today": bump on send, snap back to 0 once the server count
  // (via Firestore snapshot) has caught up, so the "N left" badge never lies.
  const [optimistic, setOptimistic] = useState(0);
  const lastServerUsed = useRef(serverUsed);
  useEffect(() => {
    if (lastServerUsed.current !== serverUsed) {
      lastServerUsed.current = serverUsed;
      setOptimistic(0);
    }
  }, [serverUsed]);
  const used = serverUsed + optimistic;

  // hydrate once
  useEffect(() => {
    const p = loadPersisted();
    if (p) {
      setTurns(p.turns);
      setInput(p.input ?? "");
      setActionStatusMap(p.actionStatus ?? {});
    } else {
      clearPersisted();
    }
    setHydrated(true);
  }, []);

  // persist on every change (bumps updatedAt → the TTL clock)
  useEffect(() => {
    if (!hydrated) return;
    if (turns.length === 0 && input.trim() === "") {
      clearPersisted();
      return;
    }
    writePersisted({ turns, input, actionStatus });
  }, [hydrated, turns, input, actionStatus]);

  const pruneIfStale = useCallback(() => {
    if (loading) return;
    if (loadPersisted() === null) {
      setTurns([]);
      setInput("");
      setActionStatusMap({});
      clearPersisted();
    }
  }, [loading]);

  // Also check when the tab regains focus / visibility (came back after a while).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") pruneIfStale();
    };
    window.addEventListener("focus", pruneIfStale);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", pruneIfStale);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pruneIfStale]);

  // Warn on tab close / reload while a reply is in flight or a draft is unsent —
  // this must be the native browser prompt (beforeunload), the only thing that
  // can interrupt an actual navigation away.
  useEffect(() => {
    const dirty = loading || input.trim() !== "";
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [loading, input]);

  const setActionStatus = useCallback((key: string, status: ActionStatus) => {
    setActionStatusMap((s) => ({ ...s, [key]: status }));
  }, []);

  const clear = useCallback(() => {
    setTurns([]);
    setInput("");
    setActionStatusMap({});
    clearPersisted();
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || loading) return;
      if (perDay !== null && used >= perDay) return;

      const history: AssistantTurn[] = [...turns, { role: "user", content: q }];
      setTurns(history);
      setInput("");
      setLoading(true);
      try {
        const res = await authedApi<{
          answer: string;
          references: AssistantReference[];
          actions: AssistantAction[];
          engine: string;
        }>("/api/assistant", {
          method: "POST",
          body: {
            messages: history.slice(-24).map((t) => ({ role: t.role, content: t.content })),
          },
        });
        setOptimistic((o) => o + 1);
        setTurns((t) => [
          ...t,
          {
            role: "assistant",
            content: res.answer,
            references: res.references,
            actions: res.actions,
            engine: res.engine,
          },
        ]);
      } catch (e) {
        setTurns((t) => [
          ...t,
          {
            role: "assistant",
            content: e instanceof Error ? e.message : "Something went wrong. Try again.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, perDay, used, turns],
  );

  return (
    <Ctx.Provider
      value={{
        turns,
        input,
        setInput,
        loading,
        hydrated,
        used,
        perDay,
        actionStatus,
        setActionStatus,
        ask,
        clear,
        pruneIfStale,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
