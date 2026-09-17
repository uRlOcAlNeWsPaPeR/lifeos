// Turn a student's own notes into something they can listen to.
//
// An episode is stored as a *script*, not an audio file: a list of spoken
// segments with a speaker on each. Playback happens in the browser through the
// Web Speech API, which means episodes cost nothing to make, work with no API
// key, replay instantly, and stay well inside a Firestore document. The audio
// is synthesised fresh each time from the saved script.

/** One host, or two hosts in conversation. */
export type PodcastFormat = "solo" | "duo";

/** Which host speaks a line. In `solo` episodes every segment is the host. */
export type Speaker = "host" | "cohost";

/** What a segment is doing, so the player can show structure. */
export type SegmentKind = "intro" | "point" | "aside" | "recap" | "outro";

export interface PodcastSegment {
  speaker: Speaker;
  kind: SegmentKind;
  text: string;
}

/** How the episode was produced — mirrors DeckSource. */
export type PodcastSource = "ai" | "offline";

export interface PodcastDTO {
  id: string;
  title: string;
  /** One-line description of what the episode covers. */
  summary: string | null;
  /** Links the episode to a course so it files under that class. */
  courseId: string | null;
  /** Free-text subject, used when it isn't tied to a course. */
  subject: string | null;
  format: PodcastFormat;
  segments: PodcastSegment[];
  /** Voice names chosen at creation, resolved against the device at play time. */
  voices: { host: string | null; cohost: string | null };
  /** What the student asked for, in minutes. */
  targetMinutes: number;
  /** Estimated runtime of the actual script, in seconds. */
  estimatedSeconds: number;
  source: PodcastSource;
  createdAt: string;
  lastPlayedAt: string | null;
  plays: number;
}

/** The options panel in the studio. */
export interface PodcastOptions {
  title: string | null;
  format: PodcastFormat;
  targetMinutes: number;
  subject: string | null;
}

/** Lengths offered in the studio. */
export const LENGTH_CHOICES = [3, 5, 10, 15, 20] as const;

/** The shape the model is asked to return, and the heuristic engine mimics. */
export interface PodcastScript {
  title: string;
  summary: string;
  segments: PodcastSegment[];
}
