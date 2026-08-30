"use client";

import { cn } from "@/lib/utils";

export type CoreState = "clear" | "steady" | "busy" | "heavy";

const STATE_HUE: Record<CoreState, string> = {
  clear: "152",
  steady: "150",
  busy: "84",
  heavy: "38",
};

const OPEN = "560ms cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * The LifeOS Core — the focal object.
 *
 * `panel` — compact, sits in the dashboard grid.
 * `hero`  — large, dominant; reads `--exp` (0 or 1, toggled by the portal) to
 *           "open up". A scale layer animates the open/close slowly; a separate
 *           tilt layer tracks the cursor quickly. All transform / opacity — the
 *           only paint is the blurred bloom, which is GPU-composited.
 */
export function LifeosCore({
  state = "steady",
  label,
  value,
  className,
  variant = "panel",
}: {
  state?: CoreState;
  label?: string;
  value?: string;
  className?: string;
  variant?: "panel" | "hero";
}) {
  const hue = STATE_HUE[state];
  const hero = variant === "hero";
  const particles = hero ? 9 : 3;

  return (
    <div
      className={cn("relative grid place-items-center [perspective:1600px]", className)}
      style={{ ["--core-hue" as string]: hue }}
    >
      {/* ambient bloom */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute rounded-full blur-2xl",
          hero ? "h-[165%] w-[165%] motion-safe:animate-drift" : "h-[150%] w-[150%]",
          "motion-safe:animate-[glow-breathe_5s_ease-in-out_infinite]",
        )}
        style={{
          background: `radial-gradient(circle, hsl(var(--core-hue) 78% 46% / ${
            hero ? 0.32 : 0.28
          }), transparent 62%)`,
        }}
      />

      {/* scale layer — the "open" happens here, slowly */}
      <div
        className="relative"
        style={
          hero
            ? {
                transform: "scale(calc(1 + var(--exp, 0) * 0.42))",
                transition: `transform ${OPEN}`,
              }
            : undefined
        }
      >
        {/* tilt layer — tracks the cursor, fast */}
        <div
          className={cn(
            "relative [transform-style:preserve-3d]",
            hero
              ? "h-[clamp(200px,38vmin,420px)] w-[clamp(200px,38vmin,420px)]"
              : "h-[clamp(180px,26vw,300px)] w-[clamp(180px,26vw,300px)]",
          )}
          style={{
            transform:
              "rotateX(calc(var(--py, 0) * -12deg)) rotateY(calc(var(--px, 0) * 14deg))",
            transition: "transform 0.18s ease-out",
          }}
        >
          {/* outer dashed ring */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-full border border-dashed border-white/10 motion-safe:animate-[spin_38s_linear_infinite]"
            style={{
              transform: `translateZ(calc(40px + var(--exp,0) * ${hero ? 60 : 0}px))`,
              transition: `transform ${OPEN}`,
            }}
          />
          {/* conic energy ring */}
          <div
            aria-hidden
            className="absolute inset-[10%] rounded-full motion-safe:animate-[spin_9s_linear_infinite]"
            style={{
              transform: `translateZ(calc(22px + var(--exp,0) * ${hero ? 34 : 0}px))`,
              transition: `transform ${OPEN}`,
              background: `conic-gradient(from 0deg, transparent 60%, hsl(var(--core-hue) 82% 56% / 0.9), hsl(168 70% 55% / 0.6), transparent)`,
              mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
              WebkitMask:
                "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
            }}
          />
          {/* mid ring */}
          <div
            aria-hidden
            className="absolute inset-[22%] rounded-full border border-white/[0.08] motion-safe:animate-[spin_24s_linear_infinite_reverse]"
            style={{
              transform: `translateZ(calc(10px + var(--exp,0) * ${hero ? 20 : 0}px))`,
              transition: `transform ${OPEN}`,
            }}
          />

          {/* hero-only inner ring, brightens as the core opens */}
          {hero && (
            <div
              aria-hidden
              className="absolute inset-[34%] rounded-full border border-primary/20 motion-safe:animate-[spin_16s_linear_infinite]"
              style={{
                transform: "translateZ(6px)",
                opacity: "calc(0.3 + var(--exp,0) * 0.7)",
                transition: "opacity 420ms ease",
              }}
            />
          )}

          {/* the orb */}
          <div
            className="absolute inset-[30%] grid place-items-center overflow-hidden rounded-full text-center"
            style={{
              transform: `translateZ(calc(60px + var(--exp,0) * ${hero ? 46 : 0}px))`,
              transition: `transform ${OPEN}`,
              background: `radial-gradient(circle at 35% 30%, hsl(var(--core-hue) 70% 42% / 0.92), hsl(160 30% 8%) 78%)`,
              boxShadow: `inset 0 0 34px -6px hsl(var(--core-hue) 82% 56% / 0.55), 0 0 ${
                hero ? "90px -10px" : "50px -8px"
              } hsl(var(--core-hue) 76% 46% / 0.55)`,
            }}
          >
            {/* specular highlight tracking the cursor */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 motion-reduce:hidden"
              style={{
                background:
                  "radial-gradient(60% 60% at var(--mx,38%) var(--my,30%), hsl(0 0% 100% / 0.28), transparent 70%)",
                transition: "background 0.2s ease-out",
              }}
            />
            {/* the hero Core stays wordless — just light */}
            {!hero && (
              <div className="relative">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/60">
                  {label}
                </p>
                <p className="mt-0.5 text-xl font-semibold text-white sm:text-2xl">{value}</p>
              </div>
            )}
          </div>

          {/* orbiting particles */}
          {Array.from({ length: particles }).map((_, i) => {
            const dur = 12 + (i % 5) * 6;
            const z = 20 + (i % 4) * 18;
            const inset = 2 + (i % 3) * 9;
            return (
              <div
                key={i}
                aria-hidden
                className="absolute inset-0 motion-safe:animate-spin motion-reduce:hidden"
                style={{
                  inset: `${inset}%`,
                  transform: `translateZ(${z}px)`,
                  animationDuration: `${dur}s`,
                  animationDirection: i % 2 ? "reverse" : "normal",
                  opacity: hero ? "calc(0.4 + var(--exp,0) * 0.5)" : "0.75",
                  transition: "opacity 420ms ease",
                }}
              >
                <span
                  className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full"
                  style={{
                    height: i % 3 === 0 ? 6 : 4,
                    width: i % 3 === 0 ? 6 : 4,
                    background: `hsl(${i % 4 === 1 ? "168" : "var(--core-hue)"} 88% ${
                      60 + (i % 3) * 6
                    }%)`,
                    boxShadow: `0 0 10px 1px hsl(var(--core-hue) 88% 62% / 0.8)`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
