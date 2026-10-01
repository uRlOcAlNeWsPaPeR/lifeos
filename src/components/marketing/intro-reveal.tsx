"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

/**
 * Landing-page intro: the LifeOS mark appears at center with a soft glow, the
 * wordmark slides out beside it, then the mark expands while a circular window
 * opens from its center onto the page underneath.
 *
 * Whether it plays is decided before first paint by INTRO_SCRIPT (root
 * layout), which sets <html data-intro="play" | "skip">: on "/" in every new
 * tab (sessionStorage is per tab, so a reload in the same tab doesn't replay
 * it), never with reduced motion. CSS keeps the overlay hidden unless
 * it's "play", so repeat visits never flash it. It can't be skipped: the
 * overlay blocks clicks and scrolling is held until it finishes.
 */

const SEEN_KEY = "lifeos.intro";

export const INTRO_SCRIPT = `(function(){try{var d=document.documentElement;var p=location.pathname==="/"&&!sessionStorage.getItem("${SEEN_KEY}")&&!matchMedia("(prefers-reduced-motion: reduce)").matches;d.setAttribute("data-intro",p?"play":"skip");if(p)sessionStorage.setItem("${SEEN_KEY}","1")}catch(e){}})();`;

/** Seconds the hero's own entrance should wait so it builds in as the window opens. */
export const INTRO_HERO_LEAD = 1.3;

function introPlaying() {
  return typeof document !== "undefined" && document.documentElement.getAttribute("data-intro") === "play";
}

/** Hero reveal offset: INTRO_HERO_LEAD while the intro is playing on this load, else 0. */
export function useIntroLead() {
  const [lead] = useState(() => (introPlaying() ? INTRO_HERO_LEAD : 0));
  return lead;
}

export function IntroReveal() {
  const root = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const line = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!introPlaying() || !root.current) return;
    const el = root.current;
    const nav = document.querySelector<HTMLElement>("[data-intro-nav]");
    const html = document.documentElement;
    // Far enough that the window's edge clears every corner of the viewport.
    const radius = Math.hypot(window.innerWidth, window.innerHeight) / 2 + 60;

    const finish = () => {
      html.setAttribute("data-intro", "done");
      if (nav) gsap.set(nav, { clearProps: "transform,opacity" });
    };

    const tl = gsap.timeline();
    tl.set(el, { "--hole": "0px" }, 0);
    if (nav) tl.set(nav, { y: -24, opacity: 0 }, 0);
    tl.fromTo(glow.current, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.8, ease: "power2.out" }, 0)
      .fromTo(mark.current, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" }, 0)
      .fromTo(
        word.current,
        { opacity: 0, x: -14, clipPath: "inset(0 100% 0 0)" },
        { opacity: 1, x: 0, clipPath: "inset(0 0% 0 0)", duration: 0.55, ease: "power3.out" },
        0.55,
      )
      .fromTo(line.current, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power2.inOut" }, 0.6)
      .to([word.current, line.current], { opacity: 0, duration: 0.25 }, 1.2)
      .to(mark.current, { scale: 9, opacity: 0, duration: 0.85, ease: "power3.in" }, 1.25)
      .to(el, { "--hole": `${radius}px`, duration: 0.85, ease: "power3.in" }, 1.3)
      .to(glow.current, { opacity: 0, duration: 0.5 }, 1.3);
    if (nav) tl.to(nav, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }, 1.9);

    // Hold the page still until the intro finishes. Capture phase on window
    // runs before the smooth-scroll library's own listeners, so it never sees them.
    const SCROLL_KEYS = new Set([" ", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"]);
    const block = (e: Event) => {
      if (e instanceof KeyboardEvent && !SCROLL_KEYS.has(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const events = ["wheel", "touchmove", "keydown"] as const;
    const release = () => events.forEach((e) => window.removeEventListener(e, block, { capture: true }));
    events.forEach((e) => window.addEventListener(e, block, { capture: true, passive: false }));
    tl.eventCallback("onComplete", () => {
      release();
      finish();
    });

    return () => {
      release();
      if (tl.progress() < 1) finish();
      tl.kill();
    };
  }, []);

  return (
    <div
      ref={root}
      aria-hidden="true"
      className="intro-overlay fixed inset-0 z-[100] items-center justify-center bg-background"
      style={{
        WebkitMaskImage:
          "radial-gradient(circle at center, transparent var(--hole, 0px), #000 calc(var(--hole, 0px) + 1px))",
        maskImage:
          "radial-gradient(circle at center, transparent var(--hole, 0px), #000 calc(var(--hole, 0px) + 1px))",
      }}
    >
      <div
        ref={glow}
        className="absolute h-[60vmin] w-[60vmin] rounded-full bg-[radial-gradient(circle,hsl(var(--glow)/0.25),transparent_65%)] opacity-0"
      />
      <div className="relative flex flex-col items-center">
        <div className="flex items-center gap-4">
          <div
            ref={mark}
            className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-brand text-white opacity-0 shadow-glow-lg"
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 7l8-4 8 4-8 4-8-4z" strokeLinejoin="round" />
              <path d="M4 12l8 4 8-4M4 17l8 4 8-4" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </div>
          <span ref={word} className="text-4xl font-semibold tracking-tight opacity-0">
            LifeOS
          </span>
        </div>
        <div className="mt-6 h-px w-40 overflow-hidden bg-white/[0.06]">
          <div ref={line} className="h-full origin-left scale-x-0 bg-primary" />
        </div>
      </div>
    </div>
  );
}
