"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { Undo2, X } from "lucide-react";

/**
 * Bottom-left "Undo" bar for actions that Firestore can't cheaply reverse —
 * deletes and task completion. The store captures the pre-change document,
 * runs the mutation, then calls `pushUndo` with a closure that writes it back.
 */

const DURATION = 9000;

type UndoEntry = {
  id: number;
  label: string;
  onUndo: () => void | Promise<void>;
  undoneMessage?: string;
};

let externalPush: ((e: Omit<UndoEntry, "id">) => void) | null = null;

export function pushUndo(entry: {
  label: string;
  onUndo: () => void | Promise<void>;
  /** Toast shown after a successful undo. Defaults to "Restored". */
  undoneMessage?: string;
}) {
  externalPush?.(entry);
}

export function UndoBar({ className }: { className?: string }) {
  const [items, setItems] = React.useState<UndoEntry[]>([]);

  React.useEffect(() => {
    externalPush = (e) => {
      const id = Date.now() + Math.random();
      setItems((cur) => [{ ...e, id }, ...cur].slice(0, 3));
    };
    return () => {
      externalPush = null;
    };
  }, []);

  const remove = React.useCallback(
    (id: number) => setItems((cur) => cur.filter((x) => x.id !== id)),
    [],
  );

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-4 left-4 z-[100] flex w-full max-w-xs flex-col gap-2",
        className,
      )}
    >
      {items.map((it) => (
        <UndoItem key={it.id} item={it} onClose={remove} />
      ))}
    </div>
  );
}

function UndoItem({
  item,
  onClose,
}: {
  item: UndoEntry;
  onClose: (id: number) => void;
}) {
  const [progress, setProgress] = React.useState(100);
  const [busy, setBusy] = React.useState(false);
  const settled = React.useRef(false);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setProgress(0));
    const t = setTimeout(() => closeRef.current(item.id), DURATION);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [item.id]);

  const handleUndo = async () => {
    if (settled.current) return;
    settled.current = true;
    setBusy(true);
    try {
      await item.onUndo();
      toast(item.undoneMessage ?? "Restored", "success");
    } catch {
      toast("Couldn't undo that", "error");
    }
    closeRef.current(item.id);
  };

  return (
    <div className="pointer-events-auto overflow-hidden rounded-xl border border-border bg-popover shadow-lg animate-slide-up">
      <div className="flex items-center gap-3 p-3">
        <Undo2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="flex-1 truncate text-sm text-popover-foreground">{item.label}</p>
        <button
          onClick={handleUndo}
          disabled={busy}
          className="shrink-0 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
        >
          {busy ? "Undoing…" : "Undo"}
        </button>
        <button
          onClick={() => closeRef.current(item.id)}
          aria-label="Dismiss"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        className="h-0.5 bg-primary/70"
        style={{ width: `${progress}%`, transition: `width ${DURATION}ms linear` }}
      />
    </div>
  );
}
