"use client";

import { useEffect } from "react";

/**
 * Catches a crash in the root layout itself — the one place a normal
 * error.tsx can't reach, since the root layout wraps error.tsx too. The
 * ambient 3D backdrop (AmbientScene) and the auth provider both live there,
 * so a throw from either lands here instead of Next's bare, unstyled
 * "Application error" page. Next requires this file to render its own
 * <html>/<body> — the root layout that crashed is gone.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] crashed at the root:", error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body
        style={{
          background: "#0a0f0d",
          color: "#e8efec",
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ fontSize: "1.125rem", fontWeight: 500 }}>Something went wrong loading LifeOS.</p>
        <p style={{ maxWidth: 360, fontSize: "0.875rem", color: "#9ca8a3" }}>
          This usually clears up on its own. Try again, or reload the page if it keeps happening.
        </p>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={reset}
            style={{
              borderRadius: 9999,
              padding: "0.625rem 1.25rem",
              background: "#22d67e",
              color: "#06110c",
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              borderRadius: 9999,
              padding: "0.625rem 1.25rem",
              background: "transparent",
              color: "#e8efec",
              border: "1px solid rgba(255,255,255,0.15)",
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
        {error.digest && (
          <p style={{ fontSize: "0.75rem", color: "rgba(156,168,163,0.6)" }}>Error ref: {error.digest}</p>
        )}
      </body>
    </html>
  );
}
