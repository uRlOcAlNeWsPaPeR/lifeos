"use client";

import { Component, useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { sceneStore, useSceneStatus } from "@/lib/scene/scene-store";
import { useSceneCapability } from "@/lib/scene/use-scene-capability";

// three.js + R3F live behind this import: they're only fetched once a device
// passes the capability check, and only on the page that mounts this (the
// Dashboard). Nothing here imports three directly.
const SceneRoot = dynamic(() => import("./scene-root"), { ssr: false, loading: () => null });

/**
 * The 3D layer for the Dashboard Core. Renders nothing unless the device can
 * take it; any failure — the chunk not loading, WebGL erroring, the context
 * being lost, or the frame rate collapsing — marks the scene `failed` and
 * unmounts it, so the CSS Core underneath comes back.
 */
export function SceneCanvas({ className }: { className?: string }) {
  const cap = useSceneCapability();
  const status = useSceneStatus();

  useEffect(() => {
    if (cap && !cap.ok) sceneStore.setStatus("off", cap.reason);
  }, [cap]);

  // Leaving the Dashboard: drop back to "off" so nothing stays hidden.
  useEffect(() => () => sceneStore.setStatus("off"), []);

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
