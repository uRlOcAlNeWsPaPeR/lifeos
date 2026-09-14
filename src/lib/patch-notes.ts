// What's-new / patch notes shown to a returning student instead of the daily
// brief the first time they open LifeOS after an update. Add a new entry to
// the top of PATCH_NOTES with each release — LATEST_PATCH_VERSION and the
// gating in components/app/daily-brief.tsx pick it up automatically.

export interface PatchNote {
  /** Unique, sortable — bump this with every entry. Compared as a plain string. */
  version: string;
  date: string; // ISO date, e.g. "2026-09-14"
  title: string;
  items: string[];
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: "2026-09-14",
    date: "2026-09-14",
    title: "Connections, reorganized",
    items: [
      "Canvas and Google Calendar now live together in one place: Settings → Connections.",
      "A new \"Connections\" button on School and Calendar gets you there in one click — no more scrolling to the bottom of the page to connect something.",
      "Connected services now show a live green status dot, plus a one-tap resync.",
    ],
  },
];

export const LATEST_PATCH_VERSION = PATCH_NOTES[0]?.version ?? "";
