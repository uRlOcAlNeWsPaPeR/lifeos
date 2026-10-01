/**
 * Layout and mood for the Dashboard's live nebula backdrop
 * (components/three/nebula-root.tsx). Pure — no React, no three.js.
 *
 * World units: the viewport is 1 unit tall and `aspect` units wide, origin at
 * the centre, y up. Horizontal positions below are given as `u`, a fraction of
 * the half-width (-1 = left edge, 1 = right edge), so the composition stretches
 * with the screen instead of being cropped.
 */

export type NebulaPhase = "home" | "boom" | "console" | "closing";

export interface NebulaInput {
  /** The day's Core hue (STATE_LOOK). */
  stateHue: number;
  /** Workload energy 0–1 (STATE_LOOK). */
  energy: number;
  /** Hue of the centred app when it isn't Study (Study is the Core itself). */
  appHue: number | null;
  phase: NebulaPhase;
}

export interface NebulaMood {
  /** Clouds, stars, planet, rocks. */
  hue: number;
  /** Ribbons, sparks and flares — carries more of the day's state. */
  accentHue: number;
  brightness: number;
  /** Flow / spark speed multiplier. */
  speed: number;
}

export const NEBULA_BASE_HUE = 152;

/** Shortest-way hue interpolation, result in [0, 360). */
export function mixHue(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + d * t) % 360) + 360) % 360;
}

export function nebulaMood({ stateHue, energy, appHue, phase }: NebulaInput): NebulaMood {
  const e = Math.min(1, Math.max(0, energy));
  const onConsole = phase === "console";
  return {
    // A routed app (SAT) recolours the whole sky; the day's state barely tints
    // it (a full shift turns the brand teal lime) and shows in the ribbons instead.
    hue: mixHue(NEBULA_BASE_HUE, appHue ?? stateHue, appHue != null ? 0.75 : 0.1),
    accentHue: mixHue(NEBULA_BASE_HUE, appHue ?? stateHue, appHue != null ? 0.85 : 0.5),
    brightness: onConsole ? 0.55 : 1,
    speed: (0.7 + e * 0.9) * (onConsole ? 0.6 : 1),
  };
}

/** 0 at 1am (thinnest crescent) → 1 at 1pm (most of the face lit). */
export function planetDaylight(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * (h - 1)) / 24);
}

/** The big planet sits in the top-right corner, partly off-screen; smaller and
 *  pushed further out on narrow screens so it stays clear of the clock. */
export function planetLayout(aspect: number): { x: number; y: number; r: number } {
  const r = 0.42 * Math.min(1.05, Math.max(0.38, aspect / 1.9));
  const k = Math.min(1, Math.max(0, (aspect - 0.5) / 1.3));
  const out = 0.35 + (0.6 - 0.35) * k;
  return { x: aspect / 2 - out * r, y: 0.5 + 0.07 * r, r };
}

/** The main light ribbon, [u, y]: in from the top-left, an S-bend down the
 *  left third, then a long sweep across to a flare near the right edge. */
export const RIBBON_PATH: ReadonlyArray<readonly [number, number]> = [
  [-1.15, 0.375],
  [-1.0, 0.35],
  [-0.8, 0.324],
  [-0.6, 0.27],
  [-0.5, 0.215],
  [-0.44, 0.138],
  [-0.42, 0.048],
  [-0.44, -0.023],
  [-0.38, -0.103],
  [-0.2, -0.183],
  [0.1, -0.219],
  [0.4, -0.226],
  [0.79, -0.239],
  [1.0, -0.244],
  [1.15, -0.247],
];
/** Ribbon u → world x. On narrow screens the left half keeps a wider span, so
 *  the S-bend hugs the left edge instead of squeezing in behind the clock. */
export function ribbonX(u: number, aspect: number): number {
  const half = aspect / 2;
  return u < 0 ? u * Math.max(half, 0.45) : u * half;
}

/** Rocks read u from at least this half-width, so a phone shows the gentle
 *  middle of the ridge profile rather than the whole thing squeezed into a cliff. */
export const ROCKS_MIN_HALF_WIDTH = 0.45;

/** Where the ribbon flares: the bright knee top-left, and the burst on the right. */
export const RIBBON_KNEE: readonly [number, number] = [-0.5, 0.215];
export const RIBBON_FLARE: readonly [number, number] = [0.79, -0.239];

/** Rock ridge heights (world y) at nine evenly spaced u from -1 to 1. High on
 *  the left, low through the middle, rising again on the right. */
export const ROCKS_BACK = [-0.01, -0.03, -0.18, -0.3, -0.36, -0.38, -0.36, -0.3, -0.31];
export const ROCKS_FRONT = [-0.16, -0.24, -0.33, -0.42, -0.47, -0.48, -0.45, -0.4, -0.38];
