"use client";

import { useEffect, useState } from "react";

export type SceneCapability =
  | { ok: true }
  | { ok: false; reason: "reduced-motion" | "no-webgl" | "low-power" | "opted-out" };

const OPT_OUT_KEY = "lifeos.core3d";

/**
 * Can (and should) this device draw the 3D Core? Checked once on the client;
 * anything that says no keeps the existing CSS Core.
 *
 * - reduced motion → the CSS Core already handles that preference properly
 * - `?core3d=off` (remembered) or `?core3d=on` to clear it → manual switch,
 *   handy for comparing against the fallback
 * - no WebGL, or only a software renderer (`failIfMajorPerformanceCaveat`)
 * - very low device memory
 */
export function detectSceneCapability(): SceneCapability {
  try {
    const param = new URLSearchParams(window.location.search).get("core3d");
    if (param === "off") localStorage.setItem(OPT_OUT_KEY, "off");
    if (param === "on") localStorage.removeItem(OPT_OUT_KEY);
    if (localStorage.getItem(OPT_OUT_KEY) === "off") return { ok: false, reason: "opted-out" };
  } catch {
    /* storage blocked — no opt-out to read */
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return { ok: false, reason: "reduced-motion" };
  }

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (memory != null && memory < 2) return { ok: false, reason: "low-power" };

  try {
    const canvas = document.createElement("canvas");
    const opts = { failIfMajorPerformanceCaveat: true } as WebGLContextAttributes;
    const gl =
      (canvas.getContext("webgl2", opts) as WebGL2RenderingContext | null) ??
      (canvas.getContext("webgl", opts) as WebGLRenderingContext | null);
    if (!gl) return { ok: false, reason: "no-webgl" };
    gl.getExtension("WEBGL_lose_context")?.loseContext(); // free the probe now
  } catch {
    return { ok: false, reason: "no-webgl" };
  }

  return { ok: true };
}

/**
 * null only during SSR; on the client this resolves on the very first render
 * (not after an effect) so a remount — a reload, or coming back from a routed
 * app — doesn't add its own extra tick before the chunk fetch can start.
 * Re-checks if reduced motion flips.
 */
export function useSceneCapability(): SceneCapability | null {
  const [cap, setCap] = useState<SceneCapability | null>(() =>
    typeof window === "undefined" ? null : detectSceneCapability(),
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const recheck = () => setCap(detectSceneCapability());
    mq.addEventListener("change", recheck);
    return () => mq.removeEventListener("change", recheck);
  }, []);

  return cap;
}

export type QualityTier = "low" | "high";

/**
 * A coarse device tier for scaling non-essential visual cost (particle
 * counts and the like) — separate from detectSceneCapability's pass/fail
 * gate, which only decides whether to draw anything at all.
 */
export function getQualityTier(): QualityTier {
  if (typeof navigator === "undefined") return "high";
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency ?? 8;
  return (memory != null && memory <= 4) || cores <= 4 ? "low" : "high";
}
