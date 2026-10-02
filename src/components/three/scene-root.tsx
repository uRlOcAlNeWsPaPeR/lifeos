"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { sceneStore, useAnchorKey } from "@/lib/scene/scene-store";
import { CoreOrb, pointer } from "./core-orb";

/** Highest pixel ratio we'll render at — beyond 1.5 the orb looks the same and costs ~2x. */
const MAX_DPR = 1.5;

/**
 * The Dashboard's 3D layer: a transparent canvas over the stage that draws one
 * glass Core per registered anchor. Orthographic, one world unit = one CSS
 * pixel, so each orb lands exactly on the DOM element it replaces.
 *
 * Stops rendering entirely when no anchor is registered (the console view).
 */
export default function SceneRoot({ className }: { className?: string }) {
  const key = useAnchorKey();
  const ids = key ? key.split(",") : [];
  const [dpr, setDpr] = useState(() =>
    typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, MAX_DPR),
  );
  const ceiling = useRef(dpr);

  useEffect(() => {
    sceneStore.setStatus("loading");
  }, []);

  return (
    <Canvas
      className={className}
      orthographic
      camera={{ position: [0, 0, 1000], near: 1, far: 4000, zoom: 1 }}
      dpr={dpr}
      frameloop={ids.length ? "always" : "never"}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: true,
        premultipliedAlpha: true,
      }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      {/* Step resolution down (never below 1) when frames drop; back up when
          they recover. This only ever adjusts dpr — the actual fallback
          decision is FpsWatchdog's, below. */}
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(1, +(d - 0.25).toFixed(2)))}
        onIncline={() => setDpr((d) => Math.min(ceiling.current, +(d + 0.25).toFixed(2)))}
      />
      <PointerTracker />
      <ReadySignal />
      <ContextLossWatcher />
      <FpsWatchdog />
      {ids.map((id) => (
        <CoreOrb key={id} id={id} />
      ))}
    </Canvas>
  );
}

/**
 * Watches for a *genuine* loss of this canvas's WebGL context — not the one
 * R3F itself triggers on the way out. Unmounting (leaving the Dashboard, or
 * React remounting this Canvas) makes R3F call `gl.forceContextLoss()` so the
 * context is freed immediately rather than left for the GC — standard, and
 * fine. But `webglcontextlost` is dispatched asynchronously (queued as a
 * task, per spec), so without this check it fires *after* this component is
 * already gone and lands on the next Dashboard visit's fresh canvas, marking
 * a perfectly healthy scene "failed" and hiding the glass Core for the rest
 * of the session. Checking the element is still attached tells the two
 * apart: a real loss happens to a canvas still on screen; ours has already
 * been removed from the DOM by the time the event arrives.
 */
function ContextLossWatcher() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();
      if (document.contains(el)) sceneStore.setStatus("failed", "context-lost");
    };
    el.addEventListener("webglcontextlost", onLost);
    return () => el.removeEventListener("webglcontextlost", onLost);
  }, [gl]);
  return null;
}

/** Marks the scene ready once it has actually drawn a couple of frames. */
function ReadySignal() {
  const frames = useRef(0);
  useFrame(() => {
    if (frames.current > 2) return;
    frames.current++;
    if (frames.current === 2) sceneStore.setStatus("ready");
  });
  return null;
}

/**
 * The real fallback decision. drei's PerformanceMonitor flags relative frame-time
 * variance, which trips on a perfectly smooth 60fps session (its onDecline/onIncline
 * dpr changes feed back into its own measurement). This instead watches genuine
 * elapsed-time FPS over a trailing window and only gives up on sustained slowness.
 */
function FpsWatchdog() {
  const WINDOW_MS = 3000;
  const GRACE_MS = 1500;
  const MIN_FPS = 24;
  // A gap this long between two frames is the page being paused (hidden tab,
  // laptop asleep, the browser throttling an occluded window) — not a slow
  // GPU. Counting it is what used to flip the glass Core to the CSS fallback
  // after the tab sat idle for a while.
  const PAUSE_GAP_MS = 2500;
  const start = useRef(performance.now());
  const last = useRef(performance.now());
  const times = useRef<number[]>([]);

  useEffect(() => {
    const restart = () => {
      start.current = last.current = performance.now();
      times.current = [];
    };
    document.addEventListener("visibilitychange", restart);
    return () => document.removeEventListener("visibilitychange", restart);
  }, []);

  useFrame(() => {
    const now = performance.now();
    if (document.hidden || now - last.current > PAUSE_GAP_MS) {
      // resumed from a pause — begin a fresh grace window rather than judging
      // the stalled stretch
      start.current = last.current = now;
      times.current = [];
      return;
    }
    last.current = now;
    if (now - start.current < GRACE_MS) return;
    const buf = times.current;
    buf.push(now);
    const cutoff = now - WINDOW_MS;
    while (buf.length && buf[0] < cutoff) buf.shift();
    if (now - start.current < GRACE_MS + WINDOW_MS) return; // wait for a full window
    const span = buf[buf.length - 1] - buf[0];
    if (span <= 0) return;
    const fps = ((buf.length - 1) / span) * 1000;
    if (fps < MIN_FPS) sceneStore.setStatus("failed", "too-slow");
  });

  return null;
}

/** Feeds the shared `pointer` (viewport px) — a passive listener, no React state. */
function PointerTracker() {
  useEffect(() => {
    pointer.fine = window.matchMedia("(pointer: fine)").matches;
    if (!pointer.fine) return;
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return null;
}
