"use client";

import { Component, useEffect, useRef, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { sceneStore, useSceneStatusDetail } from "@/lib/scene/scene-store";
import { useSceneCapability } from "@/lib/scene/use-scene-capability";

// three.js + R3F live behind this import: they're only fetched once a device
// passes the capability check, and only on the page that mounts this (the
// Dashboard). Nothing here imports three directly.
const SceneRoot = dynamic(() => import("./scene-root"), { ssr: false, loading: () => null });

// A device the FPS watchdog once called "too slow" gets a couple of chances
// to prove that wrong — a heavy first paint, a screen recorder eating the
// GPU, or another app briefly hogging it can all trip it without the device
// actually being unable to keep up. A genuine WebGL error or context loss is
// trusted the first time (no retry) — that's hardware actually breaking, not
// a passing dip.
const RETRY_COOLDOWN_MS = 20_000;
const MAX_RETRIES = 2;

/**
 * The 3D layer for the Dashboard Core. Renders nothing unless the device can
 * take it; a failure — the chunk not loading, WebGL erroring, the context
 * being lost, or the frame rate collapsing — marks the scene `failed` and
 * unmounts it, so the CSS Core underneath comes back. A slowdown-only failure
 * retries a couple of times before settling on that fallback for good.
 */
export function SceneCanvas({ className }: { className?: string }) {
  const cap = useSceneCapability();
  const { status, reason } = useSceneStatusDetail();
  const retries = useRef(0);

  useEffect(() => {
    if (cap && !cap.ok) sceneStore.setStatus("off", cap.reason);
  }, [cap]);

  // Leaving the Dashboard: drop back to "off" so nothing stays hidden.
  useEffect(() => () => sceneStore.setStatus("off"), []);

  useEffect(() => {
    if (status !== "failed" || reason !== "too-slow" || retries.current >= MAX_RETRIES) return;
    const t = window.setTimeout(() => {
      retries.current += 1;
      sceneStore.setStatus("off");
    }, RETRY_COOLDOWN_MS);
    return () => window.clearTimeout(t);
  }, [status, reason]);

  if (!cap?.ok || status === "failed") return null;

  return (
    <SceneErrorBoundary>
      <SceneRoot className={className} />
    </SceneErrorBoundary>
  );
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };

  static getDerivedStateFromError() {
    return { broken: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[core3d] scene failed, using the CSS Core:", error);
    sceneStore.setStatus("failed", "error");
  }

  render() {
    return this.state.broken ? null : this.props.children;
  }
}
