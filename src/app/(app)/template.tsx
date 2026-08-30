"use client";

// Re-mounts on every route change inside (app) — used only for a fast,
// transform/opacity enter animation. Does NOT delay content (content is
// already in the client store; this just fades it in).
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
