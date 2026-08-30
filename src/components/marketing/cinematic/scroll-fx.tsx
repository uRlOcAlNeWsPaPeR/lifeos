"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fade + rise on scroll into view. Slow, smooth, once. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 34,
  blur = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  blur?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) {
      gsap.set(el, { opacity: 1, y: 0, filter: "none" });
      return;
    }
    gsap.set(el, { opacity: 0, y, filter: blur ? "blur(8px)" : "none" });
    const tw = gsap.to(el, {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      duration: 1.4,
      delay,
      ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 85%", once: true },
    });
    return () => {
      tw.scrollTrigger?.kill();
      tw.kill();
    };
  }, [delay, y, blur]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Split a line of text into words that rise in sequence. */
export function RevealWords({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const words = el.querySelectorAll<HTMLElement>("[data-w]");
    if (reduced()) {
      gsap.set(words, { opacity: 1, y: 0 });
      return;
    }
    gsap.set(words, { opacity: 0, y: "0.7em" });
    const tw = gsap.to(words, {
      opacity: 1,
      y: 0,
      duration: 1.1,
      delay,
      ease: "power3.out",
      stagger: 0.06,
      scrollTrigger: { trigger: el, start: "top 82%", once: true },
    });
    return () => {
      tw.scrollTrigger?.kill();
      tw.kill();
    };
  }, [delay]);

  const words = text.split(" ");
  return (
    <span ref={ref} className={className}>
      {words.map((w, i) => (
        <span key={i}>
          <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
            <span data-w className="inline-block">
              {w}
            </span>
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}

/** Translate a layer as it passes through the viewport (transform only). */
export function Parallax({
  children,
  className,
  speed = 0.2,
  scale,
}: {
  children: React.ReactNode;
  className?: string;
  speed?: number;
  scale?: [number, number];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    const tw = gsap.fromTo(
      el,
      { yPercent: -speed * 50, ...(scale ? { scale: scale[0] } : {}) },
      {
        yPercent: speed * 50,
        ...(scale ? { scale: scale[1] } : {}),
        ease: "none",
        scrollTrigger: {
          trigger: el.parentElement || el,
          start: "top bottom",
          end: "bottom top",
          scrub: 1.1,
        },
      },
    );
    return () => {
      tw.scrollTrigger?.kill();
      tw.kill();
    };
  }, [speed, scale]);

  return (
    <div ref={ref} className={cn("will-change-transform", className)}>
      {children}
    </div>
  );
}

/**
 * An element that expands from a smaller framed state to near full-bleed as it
 * scrolls through the viewport — the "image expansion on scroll" effect.
 */
export function ExpandOnScroll({
  children,
  className,
  from = 0.78,
}: {
  children: React.ReactNode;
  className?: string;
  from?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) {
      gsap.set(el, { scale: 1, opacity: 1 });
      return;
    }
    const tw = gsap.fromTo(
      el,
      { scale: from, opacity: 0.55 },
      {
        scale: 1,
        opacity: 1,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 92%", end: "top 32%", scrub: 1 },
      },
    );
    return () => {
      tw.scrollTrigger?.kill();
      tw.kill();
    };
  }, [from]);

  return (
    <div ref={ref} className={cn("will-change-transform", className)}>
      {children}
    </div>
  );
}
