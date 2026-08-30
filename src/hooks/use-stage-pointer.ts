"use client";

import { useEffect, useRef } from "react";

/**
 * Installs a rAF-lerped pointer tracker on the returned element. Writes CSS
 * custom properties children can read from:
 *   --px, --py       normalised pointer offset from centre, roughly -0.5 … 0.5
 *   --mx, --my       pointer position in %  (for gradient stops)
 *   --mxpx, --mypx   pointer position in px (translate a light — composite only)
 *
 * One style write per frame on the stage element only — GPU-friendly, no React
 * re-renders. No-op under prefers-reduced-motion or on coarse pointers.
 */
export function useStagePointer<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (reduce || !fine) {
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
      el.style.setProperty("--mx", "50%");
      el.style.setProperty("--my", "35%");
      el.style.setProperty("--mxpx", "50vw");
      el.style.setProperty("--mypx", "35vh");
      return;
    }

    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let mx = 50;
    let my = 35;
    let px = 0;
    let py = 0;
    let lx = 0;
    let ly = 0;
    let raf = 0;
    let active = false;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      mx = ((e.clientX - r.left) / r.width) * 100;
      my = ((e.clientY - r.top) / r.height) * 100;
      px = e.clientX;
      py = e.clientY;
      if (!active) {
        active = true;
        raf = requestAnimationFrame(loop);
      }
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };
    const loop = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      lx += (px - lx) * 0.12;
      ly += (py - ly) * 0.12;
      el.style.setProperty("--px", x.toFixed(4));
      el.style.setProperty("--py", y.toFixed(4));
      el.style.setProperty("--mx", `${mx.toFixed(2)}%`);
      el.style.setProperty("--my", `${my.toFixed(2)}%`);
      el.style.setProperty("--mxpx", `${lx.toFixed(1)}px`);
      el.style.setProperty("--mypx", `${ly.toFixed(1)}px`);
      if (
        Math.abs(tx - x) > 0.0004 ||
        Math.abs(ty - y) > 0.0004 ||
        Math.abs(px - lx) > 0.4 ||
        Math.abs(py - ly) > 0.4
      ) {
        raf = requestAnimationFrame(loop);
      } else {
        active = false;
      }
    };

    el.style.setProperty("--px", "0");
    el.style.setProperty("--py", "0");
    el.style.setProperty("--mx", "50%");
    el.style.setProperty("--my", "35%");
    el.style.setProperty("--mxpx", "50vw");
    el.style.setProperty("--mypx", "35vh");
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return ref;
}
