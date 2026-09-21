// The apps that live inside LifeOS. The dashboard renders one sphere per
// entry along an invisible arc; the centred one is active. Adding a future
// app (Coding, Finance, Fitness…) is a single entry here — the orbit
// positions it.

export interface LifeApp {
  id: string;
  /** Short display name shown under the active sphere. */
  name: string;
  /** One honest line — no invented features. */
  tagline: string;
  /** Subtle etched cue inside the sphere. */
  motif: "study" | "school" | "progress" | "generic";
  /** Sphere hue (HSL hue channel for `--core-hue`). */
  hue: number;
  /** "internal" = lives inside LifeOS. "external" = opens in a new tab. */
  kind: "internal" | "external";
  /** Internal route to push to. No route + no href = "not set up yet" toast. */
  route?: string;
  /** External target (opened in a new tab). */
  href?: string;
  enterLabel: string;
}

// SAT is a placeholder — no section built yet, so it has no route and just
// tells you so when you tap it.
export const LIFE_APPS: LifeApp[] = [
  {
    id: "sat",
    name: "SAT",
    tagline: "Coming soon.",
    motif: "school",
    hue: 227,
    kind: "internal",
    enterLabel: "Enter SAT",
  },
];

export const STUDY_APP_INDEX = LIFE_APPS.findIndex((a) => a.id === "study");
