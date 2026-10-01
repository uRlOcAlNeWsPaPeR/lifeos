"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useSceneCapability } from "@/lib/scene/use-scene-capability";
import { getRouteMood, shouldShowAmbient } from "@/lib/scene/route-mood";

// Same lazy-chunk pattern as the Dashboard Core: three/R3F only load once a
// device passes the capability check, and only on a page that wants them.
const AmbientRoot = dynamic(() => import("./ambient-root"), { ssr: false, loading: () => null });

/**
 * The subtle, always-on 3D backdrop for the rest of LifeOS — everywhere
 * except the Dashboard, which has its own dedicated Core (core-portal.tsx).
 * Mounted once at the root layout, next to <BackgroundFX/>, so it persists
 * across navigation instead of re-paying WebGL/shader setup on every route
 * change (see the Dashboard↔SAT remount-latency fix for why that matters).
 */
export function AmbientScene() {
  const pathname = usePathname();
  const cap = useSceneCapability();
  // Guarantees this returns null on the very first client render too (not
  // just during SSR), so there's never a server/client mismatch here even
  // though this is already ssr:false at its mount point.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !shouldShowAmbient(pathname) || !cap?.ok) return null;

  return (
    <AmbientErrorBoundary>
      <AmbientRoot mood={getRouteMood(pathname)} />
    </AmbientErrorBoundary>
  );
}

// Deliberately its own boundary, not the Dashboard Core's: a crash here must
// never touch sceneStore, which would wrongly mark the unrelated Dashboard
// Core as failed too the next time it's visited.
class AmbientErrorBoundary extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };

  static getDerivedStateFromError() {
    return { broken: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[ambient3d] background scene failed, dropping it:", error);
  }

  render() {
    return this.state.broken ? null : this.props.children;
  }
}
