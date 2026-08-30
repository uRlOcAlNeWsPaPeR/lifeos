"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

let externalPush: ((kind: ToastKind, message: string) => void) | null = null;

export function toast(message: string, kind: ToastKind = "info") {
  externalPush?.(kind, message);
}

export function Toaster() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    externalPush = (kind, message) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
    };
    return () => {
      externalPush = null;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? AlertCircle : Info;
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-popover p-3.5 text-sm shadow-lg animate-scale-in",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                t.kind === "success" && "text-success",
                t.kind === "error" && "text-destructive",
                t.kind === "info" && "text-primary",
              )}
            />
            <p className="flex-1 text-popover-foreground">{t.message}</p>
            <button
              onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
