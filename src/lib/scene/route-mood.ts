/**
 * Per-route "mood" for the ambient 3D background (see
 * components/three/ambient-scene.tsx). Pure config — no React, no three.js —
 * so a new route's feel is one line here, not a new scene component.
 */

export type AmbientVariant = "scatter" | "grid" | "orbit";

export interface RouteMood {
  /** Hue in degrees, same scale as the Dashboard Core's hues. */
  hue: number;
  /** Base animation speed multiplier — how fast particles drift/orbit. */
  speed: number;
  /** Base opacity for particles and floating shapes (kept low everywhere). */
  opacity: number;
  /** How particles are laid out and move. */
  variant: AmbientVariant;
}

const DEFAULT_MOOD: RouteMood = { hue: 152, speed: 0.5, opacity: 0.12, variant: "scatter" };

/** Only the routes called out with their own feel; everything else in
 * AMBIENT_ROUTES gets DEFAULT_MOOD. */
const MOODS: Record<string, RouteMood> = {
  tasks: { hue: 152, speed: 0.6, opacity: 0.14, variant: "scatter" },
  calendar: { hue: 168, speed: 0.4, opacity: 0.12, variant: "grid" },
  grades: { hue: 174, speed: 0.75, opacity: 0.15, variant: "scatter" },
  study: { hue: 150, speed: 0.22, opacity: 0.09, variant: "scatter" },
  goals: { hue: 158, speed: 0.5, opacity: 0.13, variant: "orbit" },
  assistant: { hue: 162, speed: 0.95, opacity: 0.16, variant: "scatter" },
  // Applies to SAT's sub-pages only now (practice, exams, settings, …) — the
  // overview itself (`/sat`) gets the persistent nebula instead (blue, same
  // identity as the Dashboard's SAT hue) so it keeps going across the
  // Dashboard → SAT navigation instead of handing off to this lighter system.
  // See components/three/persistent-nebula.tsx.
  sat: { hue: 150, speed: 0.3, opacity: 0.08, variant: "scatter" },
};

/** Routes that get the ambient layer at all — a conservative allowlist so an
 * unlisted/new route never silently picks up an effect it wasn't designed
 * for. The Dashboard and Brain Game run their own cinematic scenes instead
 * (see core-portal.tsx and BackgroundFX), and auth/marketing pages don't use
 * the app shell at all. */
const AMBIENT_ROUTES = new Set([
  "tasks",
  "calendar",
  "school",
  "grades",
  "study",
  "goals",
  "assistant",
  "sat",
  "analytics",
  "brain-dump",
  "podcast",
  "practice",
  "progress",
  "settings",
]);

function firstSegment(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

/** The exact SAT overview path — carved out below since <PersistentNebula/>
 * covers it instead of this lighter ambient layer. */
function isSatOverview(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length === 1 && segments[0] === "sat";
}

export function shouldShowAmbient(pathname: string): boolean {
  if (isSatOverview(pathname)) return false;
  return AMBIENT_ROUTES.has(firstSegment(pathname));
}

export function getRouteMood(pathname: string): RouteMood {
  return MOODS[firstSegment(pathname)] ?? DEFAULT_MOOD;
}
