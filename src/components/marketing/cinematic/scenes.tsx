"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* --------------------------------------------------------------------------
 * Shared paper / ink / warm-lamp palette. Green-tinted to match LifeOS.
 * ------------------------------------------------------------------------ */
function SceneDefs() {
  return (
    <defs>
      <radialGradient id="lamp" cx="50%" cy="0%" r="90%">
        <stop offset="0%" stopColor="hsl(150 60% 60%)" stopOpacity="0.5" />
        <stop offset="35%" stopColor="hsl(150 55% 45%)" stopOpacity="0.16" />
        <stop offset="100%" stopColor="hsl(150 55% 45%)" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(150 12% 12%)" />
        <stop offset="100%" stopColor="hsl(155 14% 8%)" />
      </linearGradient>
      <linearGradient id="deskTop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(158 16% 7%)" />
        <stop offset="100%" stopColor="hsl(160 20% 4%)" />
      </linearGradient>
      <linearGradient id="ink" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="hsl(152 70% 58%)" />
        <stop offset="100%" stopColor="hsl(172 62% 50%)" />
      </linearGradient>
      <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="7" />
      </filter>
    </defs>
  );
}

/* --------------------------------- Desk ---------------------------------- */

export function DeskScene() {
  const root = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || reduced()) return;
    const q = gsap.utils.selector(el);
    const ctx = gsap.context(() => {
      // gentle scene drift on hero load
      gsap.from(q("[data-layer]"), {
        opacity: 0,
        y: (i) => 30 + i * 8,
        duration: 1.8,
        ease: "power3.out",
        stagger: 0.12,
      });
      // parallax as the hero scrolls away
      gsap.to(q("[data-far]"), {
        yPercent: -8,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: 1 },
      });
      gsap.to(q("[data-near]"), {
        yPercent: 16,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: 1 },
      });
      gsap.to(q("[data-pen]"), {
        yPercent: 30,
        rotate: -4,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: 1 },
      });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <svg
      ref={root}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden
    >
      <SceneDefs />
      <rect width="1440" height="900" fill="hsl(160 22% 4%)" />

      {/* warm lamp pool */}
      <ellipse data-layer data-far cx="720" cy="120" rx="900" ry="520" fill="url(#lamp)" />

      {/* back shelf hint */}
      <g data-layer data-far opacity="0.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <rect
            key={i}
            x={120 + i * 95}
            y={140 + (i % 3) * 6}
            width={54 + (i % 4) * 8}
            height={150}
            rx="3"
            fill={`hsl(${150 + (i % 5) * 6} 14% ${10 + (i % 3) * 3}%)`}
            stroke="hsl(150 30% 40% / 0.12)"
          />
        ))}
        <rect x="90" y="292" width="1260" height="10" rx="2" fill="hsl(155 16% 9%)" />
      </g>

      {/* desk surface */}
      <path data-layer data-near d="M0 560 L1440 560 L1440 900 L0 900 Z" fill="url(#deskTop)" />
      <line x1="0" y1="560" x2="1440" y2="560" stroke="hsl(150 40% 50% / 0.14)" strokeWidth="1.5" />

      {/* open notebook */}
      <g data-layer data-near>
        <rect x="470" y="470" width="500" height="330" rx="10" fill="hsl(150 16% 6%)" transform="rotate(-3 720 640)" filter="url(#soft)" opacity="0.7" />
        <rect x="480" y="455" width="490" height="320" rx="8" fill="url(#paper)" stroke="hsl(150 26% 26% / 0.35)" transform="rotate(-3 720 620)" />
        <line x1="725" y1="470" x2="725" y2="770" stroke="hsl(150 30% 30% / 0.4)" transform="rotate(-3 720 620)" />
        {Array.from({ length: 7 }).map((_, i) => (
          <line
            key={i}
            x1="505"
            x2={i % 2 ? 690 : 705}
            y1={505 + i * 34}
            y2={505 + i * 34}
            stroke="hsl(150 35% 45% / 0.22)"
            strokeWidth="2.5"
            strokeLinecap="round"
            transform="rotate(-3 720 620)"
          />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={i}
            x1="748"
            x2={i % 2 ? 930 : 900}
            y1={512 + i * 34}
            y2={512 + i * 34}
            stroke="hsl(150 35% 45% / 0.2)"
            strokeWidth="2.5"
            strokeLinecap="round"
            transform="rotate(-3 720 620)"
          />
        ))}
      </g>

      {/* pen */}
      <g data-layer data-pen>
        <rect x="905" y="560" width="230" height="16" rx="8" fill="hsl(150 12% 14%)" transform="rotate(24 1010 568)" stroke="hsl(150 40% 45% / 0.25)" />
        <path d="M1120 555 L1150 568 L1120 581 Z" fill="url(#ink)" transform="rotate(24 1010 568)" />
      </g>

      {/* plant silhouette */}
      <g data-layer data-far opacity="0.85">
        <rect x="120" y="470" width="90" height="90" rx="10" fill="hsl(155 14% 8%)" stroke="hsl(150 30% 40% / 0.15)" />
        {Array.from({ length: 6 }).map((_, i) => (
          <path
            key={i}
            d={`M165 470 C ${140 + i * 12} ${400 - i * 14}, ${180 + i * 10} ${380 - i * 8}, ${165 + (i - 3) * 22} ${320 - i * 6}`}
            stroke="hsl(150 45% 40% / 0.5)"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        ))}
      </g>

      {/* fine grain */}
      <rect width="1440" height="900" fill="url(#grain)" opacity="0.04" />
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
    </svg>
  );
}

/* ------------------------------ Bookshelf ------------------------------- */

export function BookshelfScene() {
  const root = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || reduced()) return;
    const q = gsap.utils.selector(el);
    const ctx = gsap.context(() => {
      // one book slides out and turns as the section scrolls
      gsap.fromTo(
        q("[data-hero-book]"),
        { x: 0, y: 0, rotate: 0 },
        {
          x: 190,
          y: -40,
          rotate: -12,
          ease: "power2.inOut",
          scrollTrigger: { trigger: el, start: "top 75%", end: "bottom 40%", scrub: 1.2 },
        },
      );
      gsap.to(q("[data-shelf-tilt]"), {
        rotate: 1.5,
        yPercent: -6,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 1 },
      });
    }, el);
    return () => ctx.revert();
  }, []);

  const shelfRows = [0, 1, 2];
  return (
    <svg ref={root} viewBox="0 0 900 900" preserveAspectRatio="xMidYMid meet" className="h-full w-full" aria-hidden>
      <SceneDefs />
      <g data-shelf-tilt>
        <rect x="90" y="70" width="720" height="760" rx="14" fill="hsl(158 16% 6%)" stroke="hsl(150 30% 40% / 0.14)" />
        {shelfRows.map((row) => (
          <g key={row}>
            <rect x="110" y={140 + row * 230} width="680" height="12" rx="2" fill="hsl(155 16% 9%)" />
            {Array.from({ length: 9 }).map((_, i) => {
              const isHero = row === 0 && i === 4;
              const h = 150 + ((i * 7 + row * 11) % 40);
              return (
                <rect
                  key={i}
                  data-hero-book={isHero ? "" : undefined}
                  x={125 + i * 72}
                  y={140 + row * 230 - h}
                  width={46 + (i % 3) * 9}
                  height={h}
                  rx="3"
                  fill={
                    isHero
                      ? "url(#ink)"
                      : `hsl(${146 + (i % 6) * 8} ${12 + (i % 4) * 4}% ${9 + (i % 3) * 4}%)`
                  }
                  stroke="hsl(150 40% 45% / 0.14)"
                />
              );
            })}
          </g>
        ))}
        <ellipse cx="450" cy="120" rx="520" ry="220" fill="url(#lamp)" opacity="0.6" />
      </g>
    </svg>
  );
}

/* ---------------------------- Notebook page ---------------------------- */
/** Lined page whose "handwriting" draws itself as the section scrolls. */
export function WritingScene() {
  const root = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const strokes = el.querySelectorAll<SVGPathElement>("[data-stroke]");
    strokes.forEach((p) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = reduced() ? "0" : String(len);
    });
    if (reduced()) return;
    const ctx = gsap.context(() => {
      gsap.to(strokes, {
        strokeDashoffset: 0,
        ease: "none",
        stagger: 0.5,
        scrollTrigger: { trigger: el, start: "top 78%", end: "bottom 55%", scrub: 1 },
      });
    }, el);
    return () => ctx.revert();
  }, []);

  const lines = [
    "M120 180 C 220 150, 300 210, 400 170 S 560 150, 660 185",
    "M120 260 C 200 240, 260 290, 380 250 S 520 240, 600 270",
    "M120 340 C 210 320, 320 360, 430 330 S 600 320, 700 350",
    "M120 420 C 190 400, 250 445, 360 415 S 500 405, 560 430",
  ];

  return (
    <svg ref={root} viewBox="0 0 820 560" preserveAspectRatio="xMidYMid meet" className="h-full w-full" aria-hidden>
      <SceneDefs />
      <rect x="40" y="40" width="740" height="480" rx="12" fill="url(#paper)" stroke="hsl(150 26% 26% / 0.35)" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={i} x1="80" x2="740" y1={140 + i * 80} y2={140 + i * 80} stroke="hsl(150 30% 40% / 0.15)" />
      ))}
      <line x1="150" y1="60" x2="150" y2="500" stroke="hsl(0 60% 55% / 0.18)" />
      {lines.map((d, i) => (
        <path
          key={i}
          data-stroke
          d={d}
          fill="none"
          stroke="url(#ink)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
