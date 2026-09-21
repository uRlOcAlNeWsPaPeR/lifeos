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
 * `orbit` — lightweight: just the orb + bloom + a subtle per-app motif. Used for
 *           the off-centre app spheres on the dashboard hub, where the extra
 *           rings/particles would be noise (and cost). Fills its parent box.
 */
export function LifeosCore({
  state = "steady",
  label,
  value,
  className,
  variant = "panel",
  motif = "generic",
  hueOverride,
  active = false,
}: {
  state?: CoreState;
  label?: string;
  value?: string;
  className?: string;
  variant?: "panel" | "hero" | "orbit";
  /** Subtle etched cue inside the orb (dashboard hub). */
  motif?: "study" | "school" | "progress" | "generic";
  /** Force a specific `--core-hue` (per-app identity) instead of the state colour. */
  hueOverride?: number;
  /** `orbit` only — the centred/active sphere blooms into the full treatment. */
  active?: boolean;
}) {
  const hue = hueOverride != null ? String(hueOverride) : STATE_HUE[state];
  const hero = variant === "hero";
  const particles = hero ? 9 : 3;

  if (variant === "orbit") {
    return <OrbitCore hue={hue} motif={motif} active={active} className={className} />;
  }

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

/**
 * The sphere used for app tiles on the dashboard hub. Fills its parent box (the
 * orbit scales the box, so all spheres share one coordinate system). The centred
 * one (`active`) fades in the dashed ring, energy ring and a few particles — the
 * off-centre ones are bare orbs (less detail further out).
 */
function OrbitCore({
  hue,
  motif,
  active,
  className,
}: {
  hue: string;
  motif: "study" | "school" | "progress" | "generic";
  active: boolean;
  className?: string;
}) {
  const T = "opacity 460ms ease, transform 460ms cubic-bezier(.22,1,.36,1)";
  return (
    <div
      className={cn("relative grid h-full w-full place-items-center [perspective:900px]", className)}
      style={{ ["--core-hue" as string]: hue }}
    >
      {/* bloom — brighter + larger when active */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full blur-2xl motion-safe:animate-[glow-breathe_5s_ease-in-out_infinite]"
        style={{
          height: active ? "165%" : "150%",
          width: active ? "165%" : "150%",
          background: `radial-gradient(circle, hsl(var(--core-hue) 78% 46% / ${active ? 0.32 : 0.22}), transparent 62%)`,
          transition: T,
        }}
      />

      <div className="relative h-full w-full [transform-style:preserve-3d]">
        {/* dashed ring — active only */}
        <div
          aria-hidden
          className="absolute inset-[6%] rounded-full border border-dashed border-white/10 motion-safe:animate-[spin_38s_linear_infinite]"
          style={{ opacity: active ? 1 : 0, transform: "translateZ(24px)", transition: T }}
        />
        {/* energy ring — active only */}
        <div
          aria-hidden
          className="absolute inset-[14%] rounded-full motion-safe:animate-[spin_10s_linear_infinite]"
          style={{
            opacity: active ? 1 : 0,
            transform: "translateZ(14px)",
            transition: T,
            background:
              "conic-gradient(from 0deg, transparent 60%, hsl(var(--core-hue) 82% 56% / 0.9), hsl(168 70% 55% / 0.6), transparent)",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
          }}
        />

        {/* the orb */}
        <div
          className="absolute inset-[26%] grid place-items-center overflow-hidden rounded-full"
          style={{
            transform: "translateZ(30px)",
            background:
              "radial-gradient(circle at 35% 30%, hsl(var(--core-hue) 70% 42% / 0.92), hsl(160 30% 8%) 78%)",
            boxShadow: `inset 0 0 30px -6px hsl(var(--core-hue) 82% 56% / 0.5), 0 0 ${
              active ? "70px -8px" : "40px -10px"
            } hsl(var(--core-hue) 76% 46% / 0.5)`,
            transition: T,
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 60% at 36% 28%, hsl(0 0% 100% / 0.22), transparent 70%)",
            }}
          />
          <CoreMotif motif={motif} />
        </div>

        {/* a few particles — active only */}
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            aria-hidden
            className="absolute inset-[4%] motion-safe:animate-spin motion-reduce:hidden"
            style={{
              transform: `translateZ(${18 + i * 12}px)`,
              animationDuration: `${14 + i * 5}s`,
              animationDirection: i % 2 ? "reverse" : "normal",
              opacity: active ? 0.7 : 0,
              transition: "opacity 460ms ease",
            }}
          >
            <span
              className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
              style={{
                background: `hsl(${i === 1 ? "168" : "var(--core-hue)"} 88% 64%)`,
                boxShadow: "0 0 10px 1px hsl(var(--core-hue) 88% 62% / 0.8)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A faint etched pattern inside a hub sphere — signals what the app is for. */
function CoreMotif({ motif }: { motif: "study" | "school" | "progress" | "generic" }) {
  if (motif === "generic") return null;
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 h-full w-full text-white"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {motif === "study" && (
        // concentric arcs + a data tick
        <g opacity="0.16">
          <path d="M28 62 A24 24 0 0 1 72 62" strokeWidth="3" />
          <path d="M36 55 A15 15 0 0 1 64 55" strokeWidth="2.5" />
          <line x1="50" y1="30" x2="50" y2="40" strokeWidth="3" />
        </g>
      )}
      {motif === "school" && (
        // a mortarboard — flat cap + tassel
        <g opacity="0.16">
          <path d="M50 32 L78 45 L50 58 L22 45 Z" strokeWidth="3" />
          <path d="M38 50 V64 Q50 71 62 64 V50" strokeWidth="2.5" />
          <line x1="74" y1="47" x2="74" y2="62" strokeWidth="2.5" />
        </g>
      )}
      {motif === "progress" && (
        // an ascending trend line with three checkpoints
        <g opacity="0.16">
          <path d="M26 66 L44 50 L58 58 L76 34" strokeWidth="3" />
          <circle cx="26" cy="66" r="3" fill="currentColor" stroke="none" />
          <circle cx="44" cy="50" r="3" fill="currentColor" stroke="none" />
          <circle cx="58" cy="58" r="3" fill="currentColor" stroke="none" />
          <circle cx="76" cy="34" r="3" fill="currentColor" stroke="none" />
        </g>
      )}
    </svg>
  );
}
