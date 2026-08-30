// The apps that live inside LifeOS. The dashboard renders one green sphere per
// entry along an invisible arc; the centred one is active. Adding a future app
// (Coding, Finance, Fitness…) is a single entry here — the orbit positions it.

export interface LifeApp {
  id: string;
  /** Short display name shown under the active sphere. */
  name: string;
  /** One honest line — no invented features. */
  tagline: string;
  /** Subtle etched cue inside the sphere; all stay in the green LifeOS family. */
  motif: "study" | "writing" | "generic";
  /** Sphere hue (HSL hue channel for `--core-hue`). ~152 green … ~172 green-teal. */
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
    id: "writing",
    name: "Writing",
    tagline: "AI detector, humanizer and essay coach — know the score before you turn it in.",
    motif: "writing",
    hue: 170,
    kind: "internal",
    route: "/writing",
    enterLabel: "Enter Writing",
  },
];

export const STUDY_APP_INDEX = LIFE_APPS.findIndex((a) => a.id === "study");
