// Script building for podcast episodes — pure, so it can be unit-tested and
// run identically on the server (AI path) and the client (preview, estimates).

import type {
  PodcastFormat,
  PodcastOptions,
  PodcastScript,
  PodcastSegment,
  SegmentKind,
  Speaker,
} from "./types";

/**
 * Speaking rate used to turn "I want 10 minutes" into a word budget. Measured
 * conversational narration sits around 150 wpm; the Web Speech API at rate 1.0
 * is close enough that the estimate holds up.
 */
export const WORDS_PER_MINUTE = 150;

export const countWords = (text: string): number =>
  text.trim() ? text.trim().split(/\s+/).length : 0;

/** Target word count for a requested runtime. */
export const wordBudget = (minutes: number): number =>
  Math.max(120, Math.round(minutes * WORDS_PER_MINUTE));

/** Estimated runtime of a finished script, in seconds. */
export function estimateSeconds(segments: PodcastSegment[]): number {
  const words = segments.reduce((n, s) => n + countWords(s.text), 0);
  return Math.round((words / WORDS_PER_MINUTE) * 60);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

const SEGMENT_KINDS = new Set<SegmentKind>(["intro", "point", "aside", "recap", "outro"]);

/**
 * Coerce whatever the model returned into a valid script.
 *
 * Anything unusable is dropped rather than repaired, and a `duo` request that
 * comes back entirely single-speaker is left alone — the caller decides whether
 * that's worth a retry. In `solo` every line is reassigned to the host, so a
 * model that invents a second speaker can't produce an episode whose co-host
 * voice was never chosen.
 */
export function sanitizeScript(raw: unknown, format: PodcastFormat): PodcastScript | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const segments: PodcastSegment[] = [];
  for (const item of Array.isArray(obj.segments) ? obj.segments : []) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const text = typeof s.text === "string" ? s.text.trim().replace(/\s+/g, " ") : "";
    if (!text) continue;

    const kind = String(s.kind ?? "point") as SegmentKind;
    const speaker: Speaker =
      format === "solo" ? "host" : s.speaker === "cohost" ? "cohost" : "host";

    segments.push({
      speaker,
      kind: SEGMENT_KINDS.has(kind) ? kind : "point",
      // A single spoken line; anything longer is a sign the model ignored the
      // structure, and huge utterances make the player impossible to follow.
      text: text.slice(0, 1200),
    });
  }
  if (!segments.length) return null;

  const title =
    typeof obj.title === "string" && obj.title.trim()
      ? obj.title.trim().slice(0, 120)
      : "Study episode";
  const summary =
    typeof obj.summary === "string" && obj.summary.trim()
      ? obj.summary.trim().slice(0, 300)
      : "";

  return { title, summary, segments };
}

/* -------------------------------------------------------------------------- *
 * Offline engine
 *
 * With no API key configured this is what every student gets, so it has to
 * produce something genuinely listenable. The rule it follows is the same one
 * the rest of the heuristic layer follows: it may reorganise and introduce the
 * student's own sentences, but it never invents a claim. Every factual line in
 * the output is a sentence the student wrote.
 * -------------------------------------------------------------------------- */

/** Split notes into sentences, keeping bullet points and headings intact. */
export function splitSentences(notes: string): string[] {
  return notes
    .split(/\r?\n+/)
    .flatMap((line) => {
      const trimmed = line.replace(/^\s*([-*•+]|\d+[.)])\s*/, "").trim();
      if (!trimmed) return [];
      // Keep short lines (headings, bullets) whole; split prose into sentences.
      if (countWords(trimmed) <= 12) return [trimmed];
      return trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim());
    })
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => countWords(s) >= 2);
}

/**
 * Rank sentences by how much they carry. Longer sentences and ones with
 * numbers, "because"/"means"/"so" style connectives tend to be the substance;
 * fragments and one-word bullets tend not to be.
 */
function density(sentence: string): number {
  const words = countWords(sentence);
  let score = Math.min(words, 30);
  if (/\d/.test(sentence)) score += 6;
  if (/\b(because|therefore|means|so that|results? in|leads? to|due to|causes?)\b/i.test(sentence))
    score += 8;
  if (/\b(is|are|was|were|has|have|can|will)\b/i.test(sentence)) score += 3;
  if (/[:=]/.test(sentence)) score += 3;
  return score;
}

/** Ensure a spoken line ends with punctuation, so the synthesiser pauses. */
const asSentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** Rotating connectives, indexed so the same phrase never repeats back to back. */
const LEAD_INS = [
  "Here's the first thing to hold on to.",
  "Next up.",
  "This one matters.",
  "Keep going.",
  "Here's another piece.",
  "Now this.",
  "Worth pausing on.",
  "One more.",
];

const COHOST_BEATS = [
  "So what's the takeaway there?",
  "Let me say that back — that's the part to remember.",
  "Right, and that's the bit that shows up in questions.",
  "Got it. That connects to what we just said.",
  "Okay, that's clear.",
  "That's worth writing down.",
];

/**
 * Build an episode from the student's notes with no model involved.
 *
 * Sentences are ranked, the best ones fill the word budget in the order they
 * appeared (so the episode follows the notes rather than the ranking), and the
 * connective tissue around them is fixed phrasing — never generated claims.
 */
export function heuristicScript(notes: string, opts: PodcastOptions): PodcastScript {
  const sentences = splitSentences(notes);
  const topic = opts.title?.trim() || opts.subject?.trim() || "your notes";

  if (!sentences.length) {
    return {
      title: opts.title?.trim() || "Study episode",
      summary: "",
      segments: [
        {
          speaker: "host",
          kind: "intro",
          text: `There wasn't enough in these notes to build an episode. Add a few more lines and generate it again.`,
        },
      ],
    };
  }

  const budget = wordBudget(opts.targetMinutes);
  const duo = opts.format === "duo";

  // Pick the densest sentences, then restore the original order so the episode
  // walks through the notes the way the student wrote them.
  const ranked = sentences
    .map((text, index) => ({ text, index, d: density(text) }))
    .sort((a, b) => b.d - a.d);

  const chosen: { text: string; index: number }[] = [];
  let used = 0;
  // Reserve roughly a fifth of the budget for intro, co-host beats and recap.
  const contentBudget = Math.round(budget * 0.8);
  for (const s of ranked) {
    if (used >= contentBudget) break;
    chosen.push(s);
    used += countWords(s.text);
  }
  chosen.sort((a, b) => a.index - b.index);

  const segments: PodcastSegment[] = [];

  segments.push({
    speaker: "host",
    kind: "intro",
    text: `Welcome back. Today we're going through ${topic}. ${
      duo ? "I've got my co-host with me, and we're" : "We're"
    } covering ${chosen.length} key point${chosen.length === 1 ? "" : "s"}, so settle in.`,
  });

  if (duo) {
    segments.push({
      speaker: "cohost",
      kind: "intro",
      text: "Good to be here. Let's get into it.",
    });
  }

  chosen.forEach((s, i) => {
    segments.push({
      speaker: "host",
      kind: "point",
      text: `${LEAD_INS[i % LEAD_INS.length]} ${asSentence(s.text)}`,
    });
    // A beat after every other point keeps a two-host episode conversational
    // without doubling its length.
    if (duo && i % 2 === 1) {
      segments.push({
        speaker: "cohost",
        kind: "aside",
        text: COHOST_BEATS[Math.floor(i / 2) % COHOST_BEATS.length],
      });
    }
  });

  // A recap of the opening points — the highest-value part of a study listen.
  const recapPoints = chosen.slice(0, 3).map((s) => s.text);
  if (recapPoints.length) {
    segments.push({
      speaker: duo ? "cohost" : "host",
      kind: "recap",
      text: `Quick recap before we finish. ${recapPoints.map(asSentence).join(" ")}`,
    });
  }

  segments.push({
    speaker: "host",
    kind: "outro",
    text: `That's ${topic}. Play it again before your next session, and you'll have it down.`,
  });

  return {
    title: opts.title?.trim() || `${topic.charAt(0).toUpperCase()}${topic.slice(1)}`,
    summary: `${chosen.length} point${chosen.length === 1 ? "" : "s"} from your notes on ${topic}.`,
    segments,
  };
}

/* -------------------------------------------------------------------------- *
 * Library grouping
 * -------------------------------------------------------------------------- */

export interface PodcastFolder<T> {
  key: string;
  label: string;
  courseId: string | null;
  episodes: T[];
}

/**
 * File episodes into one folder per subject.
 *
 * A course-linked episode files under that course's name; otherwise its
 * free-text subject is used, matched case-insensitively so "Physics" and
 * "physics" don't become two folders. Everything else lands in "Unfiled".
 */
export function groupBySubject<T extends { courseId: string | null; subject: string | null }>(
  episodes: T[],
  courses: { id: string; name: string }[],
): PodcastFolder<T>[] {
  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const folders = new Map<string, PodcastFolder<T>>();

  for (const ep of episodes) {
    const fromCourse = ep.courseId ? courseName.get(ep.courseId) : undefined;
    const label = (fromCourse ?? ep.subject?.trim() ?? "").trim();
    const key = label ? label.toLowerCase() : "￿unfiled";

    let folder = folders.get(key);
    if (!folder) {
      folder = {
        key,
        label: label || "Unfiled",
        // Only a course-backed folder carries an id; two episodes with the same
        // free-text subject share a folder but no course.
        courseId: fromCourse ? ep.courseId : null,
        episodes: [],
      };
      folders.set(key, folder);
    }
    folder.episodes.push(ep);
  }

  // Alphabetical, with "Unfiled" pinned last via its sort-key prefix.
  return [...folders.values()].sort((a, b) => a.key.localeCompare(b.key));
}
