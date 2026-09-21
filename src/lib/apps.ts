// The apps that live inside LifeOS. The dashboard renders one sphere per
// entry along an invisible arc; the centred one is active. Adding a future
// app (Coding, Finance, Fitness…) is a single entry here — the orbit
// positions it. Each app gets its own hue for a real color identity, not
// just a green-family variant — School's genuinely blue, Progress genuinely
// amber, so the spheres stay distinguishable at a glance.

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
    id: "school",
    name: "School",
    tagline: "Courses, assignments and grades — Canvas synced, or add it yourself.",
    motif: "school",
    hue: 227,
    kind: "internal",
    route: "/school",
    enterLabel: "Enter School",
  },
  {
    id: "progress",
    name: "Progress",
    tagline: "Goals, streaks and how your week's actually going.",
    motif: "progress",
    hue: 38,
    kind: "internal",
    route: "/progress",
    enterLabel: "Enter Progress",
  },
];

export const STUDY_APP_INDEX = LIFE_APPS.findIndex((a) => a.id === "study");
