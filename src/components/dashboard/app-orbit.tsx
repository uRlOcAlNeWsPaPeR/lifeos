"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { LifeosCore } from "./lifeos-core";
import { cn } from "@/lib/utils";
import type { LifeApp } from "@/lib/apps";

/**
 * The LifeOS hub. App spheres sit on an invisible horizontal arc; the centred
 * one is active. Arrows / clicking a sphere / swiping / arrow-keys glide the
 * whole group one step along the arc (it wraps). Only the centre sphere gets the
 * full Core treatment. Position is a pure function of the ring offset — every
 * move is a CSS transform transition, no rAF, no per-frame React.
 */
export function AppOrbit({
  apps,
  activeIndex,
  onActiveChange,
  onEnter,
  reducedMotion = false,
  centerAction,
}: {
  apps: LifeApp[];
  activeIndex: number;
  onActiveChange: (i: number) => void;
  onEnter: (app: LifeApp) => void;
  reducedMotion?: boolean;
  /** When set, replaces the "Enter" button under the active sphere (e.g. the
   *  study-lock bar) and drops the "Tap to enter" hint. */
  centerAction?: React.ReactNode;
}) {
  const n = apps.length;
  const active = apps[activeIndex];
  const stageRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const drag = useRef<{ x0: number; moved: boolean } | null>(null);

  // which app was centred last render → the newly-centred one waits for the
  // outgoing one to recede before it slides forward ("goes back, THEN next comes").
  const prevActive = useRef(activeIndex);
  const arrivingIndex = prevActive.current !== activeIndex ? activeIndex : -1;
  useEffect(() => {
    prevActive.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const canPrev = activeIndex > 0;
  const canNext = activeIndex < n - 1;
  const step = useCallback(
    (dir: -1 | 1) => {
      const next = activeIndex + dir;
      if (next >= 0 && next < n) onActiveChange(next);
    },
    [activeIndex, n, onActiveChange],
  );

  // keyboard — only when the stage (or something inside it) has focus
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [step]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { x0: e.clientX, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    if (Math.abs(e.clientX - drag.current.x0) > 8) drag.current.moved = true;
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x0;
    if (Math.abs(dx) > 48) step(dx < 0 ? 1 : -1);
  }

  const transition = reducedMotion
    ? "transform 160ms ease, opacity 120ms ease, filter 120ms ease"
    : "transform 520ms cubic-bezier(.22,1,.36,1), opacity 380ms ease, filter 380ms ease";

  return (
    <div className="flex w-full flex-col items-center">
      <div
        ref={stageRef}
        tabIndex={0}
        role="group"
        aria-roledescription="app carousel"
        aria-label="LifeOS apps"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        className="relative h-[clamp(240px,42vh,500px)] w-full touch-pan-y select-none outline-none sm:h-[clamp(320px,46vh,500px)]"
        style={{ perspective: "1400px" }}
      >
        {/* soft ground glow under the active sphere */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[44%] h-[420px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(circle, hsl(var(--glow)/0.07), transparent 66%)" }}
        />

        {apps.map((app, i) => {
          // clamped (no wrap): the arc has real ends, so the arrows can disappear.
          const slot = i - activeIndex;
          const d = Math.min(Math.abs(slot), 3);
          const centre = slot === 0;
          // sideways spread — responsive via CSS min(), not window measurements
          const xExpr = narrow
            ? `${slot * 118}px`
            : `calc(${slot} * min(31vw, 310px))`;
          // off-centre spheres sit noticeably lower + further back so a step reads
          // as "the current one recedes, the next comes forward".
          const y = centre ? 0 : (narrow ? 60 : 96) + (d - 1) * 46;
          const scale = centre ? 1 : Math.max(0.24, 0.6 - (d - 1) * 0.16);
          const opacity = centre ? 1 : Math.max(0, 0.5 - (d - 1) * 0.24);
          const blur = centre ? 0 : 2 + (d - 1) * 2;
          const hidden = (narrow && d >= 2) || opacity <= 0.02;

          const box = narrow
            ? "h-[196px] w-[196px]"
            : "h-[clamp(230px,32vmin,360px)] w-[clamp(230px,32vmin,360px)]";

          // the sphere arriving at the centre waits ~120ms for the old one to move
          const delay = !reducedMotion && centre && i === arrivingIndex ? 120 : 0;

          return (
            <button
              key={app.id}
              type="button"
              aria-label={centre ? app.enterLabel : `Bring ${app.name} to the centre`}
              aria-current={centre ? "true" : undefined}
              onClick={() => {
                if (drag.current?.moved) return;
                if (centre) onEnter(app);
                else onActiveChange(i);
              }}
              tabIndex={hidden ? -1 : 0}
              className={cn(
                "absolute left-1/2 top-[44%] grid cursor-pointer rounded-full outline-none",
                "focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-4 focus-visible:ring-offset-background",
                box,
              )}
              style={{
                transform: `translate(-50%,-50%) translate3d(${xExpr}, ${y}px, 0) scale(${scale})`,
                opacity: hidden ? 0 : opacity,
                filter: blur ? `blur(${blur}px)` : undefined,
                zIndex: 100 - Math.round(d * 10),
                transition,
                transitionDelay: delay ? `${delay}ms` : undefined,
                pointerEvents: hidden ? "none" : "auto",
                willChange: "transform, opacity",
              }}
            >
              <span className="pointer-events-none block h-full w-full transition-transform duration-300 hover:scale-[1.03]">
                <LifeosCore
                  variant="orbit"
                  motif={app.motif}
                  hueOverride={app.hue}
                  active={centre}
                />
              </span>
              {centre && !centerAction && (
                <span className="pointer-events-none absolute inset-x-0 -bottom-6 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
                  Tap to enter
                </span>
              )}
            </button>
          );
        })}

        {/* arrows — fade out at the ends of the arc */}
        {n > 1 && (
          <>
            <ArrowBtn side="left" visible={canPrev} onClick={() => step(-1)} />
            <ArrowBtn side="right" visible={canNext} onClick={() => step(1)} />
          </>
        )}
      </div>

      {/* active app info */}
      <div className="mt-1 flex flex-col items-center text-center">
        <div key={active.id} className="flex flex-col items-center animate-fade-in">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            {active.name}
          </p>
          <p className="mt-1.5 max-w-xs text-xs text-muted-foreground sm:mt-2 sm:text-sm">
            {active.tagline}
          </p>
        </div>
        {centerAction ? (
          <div className="mt-3 sm:mt-4">{centerAction}</div>
        ) : (
          <button
            onClick={() => onEnter(active)}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-brand bg-[length:180%_auto] px-6 py-2.5 text-sm font-medium text-white shadow-glow-sm transition-all duration-300 hover:bg-[position:100%_50%] hover:shadow-glow hover:-translate-y-px sm:mt-4"
          >
            {active.enterLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {n > 1 && (
          <div className="mt-3 flex gap-1.5 sm:mt-4">
            {apps.map((a, i) => (
              <button
                key={a.id}
                aria-label={`Go to ${a.name}`}
                onClick={() => onActiveChange(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === activeIndex ? "w-5 bg-primary" : "w-1.5 bg-white/20 hover:bg-white/40",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ArrowBtn({
  side,
  visible,
  onClick,
}: {
  side: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!visible}
      aria-hidden={!visible}
      aria-label={side === "left" ? "Previous app" : "Next app"}
      className={cn(
        "absolute top-[44%] z-[120] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:text-primary",
        side === "left" ? "left-2 sm:left-6" : "right-2 sm:right-6",
        !visible && "pointer-events-none opacity-0",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
