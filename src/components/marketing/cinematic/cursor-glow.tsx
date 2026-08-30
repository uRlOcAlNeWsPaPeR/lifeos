"use client";

import { useEffect, useRef } from "react";

/**
 * A soft green light that trails the cursor across the page. Compositor-only
 * (translate3d), fine-pointer only, off for reduced motion.
 */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

    el.style.opacity = "1";
    let tx = innerWidth / 2;
    let ty = innerHeight / 2;
    let x = tx;
    let y = ty;
    let raf = 0;

    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    const loop = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      el.style.transform = `translate3d(${x - 300}px, ${y - 300}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-30 h-[600px] w-[600px] opacity-0 mix-blend-screen transition-opacity duration-700 will-change-transform"
      style={{
        background:
          "radial-gradient(circle at center, hsl(152 80% 48% / 0.12), hsl(152 70% 44% / 0.04) 40%, transparent 62%)",
      }}
    />
  );
}
