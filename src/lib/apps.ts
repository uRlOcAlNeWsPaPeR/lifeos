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
  /** Internal route to push to (Study is special — it detonates, no route). */
  route?: string;
  /** External target (opened in a new tab). */
  href?: string;
  enterLabel: string;
}

export const LIFE_APPS: LifeApp[] = [
  {
    id: "study",
    name: "Study",
    tagline: "Your day, organized — tasks, deadlines and focus in one place.",
    motif: "study",
    hue: 152,
    kind: "internal",
    enterLabel: "Enter Study",
  },
  {
    id: "sat",
    name: "SAT",
    tagline: "Practice questions, full-length adaptive exams and progress tracking, powered by ScoreClimb.",
    motif: "school",
    hue: 227,
    kind: "internal",
    route: "/sat",
    enterLabel: "Enter SAT",
  },
];

export const STUDY_APP_INDEX = LIFE_APPS.findIndex((a) => a.id === "study");
