"use client";

import Link from "next/link";
import { Logo } from "@/components/brand";

export function FullscreenLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <span className="relative flex h-12 w-12 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/25" />
        <span
          className="absolute inline-flex h-11 w-11 animate-spin rounded-full [animation-duration:1s]"
          style={{
            background: "conic-gradient(from 0deg, transparent 55%, var(--g-green), var(--g-teal))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0)",
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0)",
          }}
        />
        <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M4 7l8-4 8 4-8 4-8-4z" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}

export function FirebaseNotConfigured() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <Logo className="mb-6" />
      <h1 className="text-xl font-semibold tracking-tight">Firebase isn&apos;t configured yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Add your Firebase web config to <code className="rounded bg-white/10 px-1">.env</code> (the
        <code className="mx-1 rounded bg-white/10 px-1">NEXT_PUBLIC_FIREBASE_*</code> values from the
        Firebase console) and restart the dev server. See{" "}
        <code className="rounded bg-white/10 px-1">.env.example</code> and the setup steps in the README.
      </p>
      <Link href="/" className="mt-6 text-sm font-medium text-primary hover:underline">
        Back to home
      </Link>
    </div>
  );
}
