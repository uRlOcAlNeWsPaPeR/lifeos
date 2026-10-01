"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Next.js renders this in place of the Dashboard whenever anything in it
 * throws during render — the 3D Core, the console, any of it. Without this
 * file, that same crash shows Next's generic full-page "Application error"
 * with no way back except typing in the URL bar again, and the real error
 * only ever reaches the browser console, which most people never open.
 *
 * This logs the error (so it at least shows up if anyone's watching) and
 * offers Retry, which re-renders the Dashboard without a full reload —
 * exactly what you want when the cause was a one-off (a bad frame from the
 * 3D Core, a stale chunk after a deploy) rather than something that'll
 * happen again every time.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] crashed:", error);
  }, [error]);

  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-medium">Something went wrong opening your Dashboard.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        This usually clears up on its own. Try again, or reload the page if it keeps happening.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
        <Button variant="ghost" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>
      {/* Shown in the page itself, not just the console — so whoever hits this
          can screenshot or copy it straight off the screen without opening
          DevTools. A client-thrown error's message is never redacted (that
          only happens to server-rendering errors), so this is always the real
          text. */}
      <div className="mt-2 max-w-lg rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left">
        <p className="font-mono text-xs text-destructive">
          {error.name}: {error.message}
        </p>
        {error.stack && (
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-muted-foreground/70">
            {error.stack}
          </pre>
        )}
        {error.digest && (
          <p className="mt-1 text-[10px] text-muted-foreground/50">Error ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
