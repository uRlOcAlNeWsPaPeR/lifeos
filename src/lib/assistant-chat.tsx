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

// The assistant chat lives here — ABOVE the /assistant page — so an in-flight
// "thinking" request keeps going even if the student navigates away mid-reply.
// Every conversation with at least one real message is saved to a local
// history list (mirrored to localStorage) and kept for 30 days; a chat that
// was never sent a message is never written there at all. The active view
// always opens fresh — resuming an old chat is an explicit click in the
// history panel, never automatic.

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

export interface Conversation {
  id: string;
  title: string;
  turns: AssistantTurn[];
  actionStatus: Record<string, ActionStatus>;
  createdAt: number;
  updatedAt: number;
}

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
  /** Every conversation that's had a real message, newest first, 30-day retention. */
  conversations: Conversation[];
  /** The saved conversation currently open, or null for a fresh unsaved chat. */
  activeId: string | null;
  /** Blank the view for a new chat. Doesn't touch history — a chat only saves once sent. */
  startNew: () => void;
  openConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
}

const CONV_KEY = "lifeos:assistant-conversations:v1";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const rid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function titleFrom(question: string | undefined): string {
  const t = (question ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONV_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Conversation[];
    if (!Array.isArray(list)) return [];
    const cutoff = Date.now() - RETENTION_MS;
    return list
      .filter(
        (c) =>
          c &&
          typeof c.id === "string" &&
          typeof c.updatedAt === "number" &&
          c.updatedAt >= cutoff &&
          Array.isArray(c.turns) &&
          c.turns.length > 0,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writeConversations(list: Conversation[]) {
  try {
    localStorage.setItem(CONV_KEY, JSON.stringify(list));
  } catch {
    /* private mode / quota — history just won't survive a reload */
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

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
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

  // Load history once. The active view starts blank regardless — resuming a
  // past chat is always an explicit click, never automatic.
  useEffect(() => {
    setConversations(loadConversations());
    setHydrated(true);
  }, []);

  // Every change to the active chat's turns/actions upserts it into the
  // history list under its id — creating the entry the first time (i.e. on
  // the first real message) and updating it after. A chat with no id (never
  // sent) never touches this list at all.
  useEffect(() => {
    if (!hydrated || !activeId) return;
    setConversations((list) => {
      const now = Date.now();
      const exists = list.some((c) => c.id === activeId);
      const next = exists
        ? list.map((c) => (c.id === activeId ? { ...c, turns, actionStatus, updatedAt: now } : c))
        : [
            {
              id: activeId,
              title: titleFrom(turns[0]?.content),
              turns,
              actionStatus,
              createdAt: now,
              updatedAt: now,
            },
            ...list,
          ];
      writeConversations(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns, actionStatus, activeId, hydrated]);

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

  const startNew = useCallback(() => {
    setActiveId(null);
    setTurns([]);
    setInput("");
    setActionStatusMap({});
  }, []);

  const openConversation = useCallback(
    (id: string) => {
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;
      setActiveId(id);
      setTurns(conv.turns);
      setActionStatusMap(conv.actionStatus ?? {});
      setInput("");
    },
    [conversations],
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((list) => {
        const next = list.filter((c) => c.id !== id);
        writeConversations(next);
        return next;
      });
      if (id === activeId) {
        setActiveId(null);
        setTurns([]);
        setActionStatusMap({});
      }
    },
    [activeId],
  );

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || loading) return;
      if (perDay !== null && used >= perDay) return;

      const history: AssistantTurn[] = [...turns, { role: "user", content: q }];
      setTurns(history);
      setInput("");
      setLoading(true);
      // Lazily claim an id the first time a chat is actually sent — this is
      // what makes it a real, saved conversation.
      setActiveId((id) => id ?? rid());
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
        conversations,
        activeId,
        startNew,
        openConversation,
        deleteConversation,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
