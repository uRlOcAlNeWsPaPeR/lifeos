/**
 * Podcast script-building checks.
 *
 *   npx tsx src/lib/podcast/podcast.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import {
  countWords,
  estimateSeconds,
  formatDuration,
  groupBySubject,
  heuristicScript,
  sanitizeScript,
  splitSentences,
  wordBudget,
  WORDS_PER_MINUTE,
} from "./script";
import type { PodcastOptions } from "./types";

const NOTES = `Cell respiration
Glycolysis happens in the cytoplasm and splits glucose into two pyruvate molecules.
The Krebs cycle runs in the mitochondrial matrix and produces NADH and FADH2.
- Oxidative phosphorylation makes about 34 ATP because the electron transport chain pumps protons.
Fermentation happens when oxygen is absent.
Net yield is roughly 36 to 38 ATP per glucose molecule.`;

const opts = (over: Partial<PodcastOptions> = {}): PodcastOptions => ({
  title: null,
  format: "solo",
  targetMinutes: 5,
  subject: "Biology",
  ...over,
});

/* ------------------------------- budgeting ------------------------------ */

test("word budget scales with the requested runtime", () => {
  assert.equal(wordBudget(10), 10 * WORDS_PER_MINUTE);
  assert.ok(wordBudget(20) > wordBudget(5));
});

test("a very short request still gets a usable floor", () => {
  assert.ok(wordBudget(0) >= 120);
});

test("runtime estimate round-trips through the word budget", () => {
  const segments = [{ speaker: "host" as const, kind: "point" as const, text: "word ".repeat(300).trim() }];
  // 300 words at 150 wpm is two minutes.
  assert.equal(estimateSeconds(segments), 120);
});

test("durations format as m:ss", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(600), "10:00");
});

test("countWords ignores surrounding whitespace", () => {
  assert.equal(countWords("  two  words  "), 2);
  assert.equal(countWords("   "), 0);
});

/* ------------------------------- splitting ------------------------------ */

test("notes split into sentences, keeping bullets and headings", () => {
  const s = splitSentences(NOTES);
  assert.ok(s.includes("Cell respiration"), "heading kept");
  assert.ok(
    s.some((x) => x.startsWith("Oxidative phosphorylation")),
    "bullet marker stripped",
  );
  assert.ok(s.every((x) => !/^[-*•]/.test(x)), "no leftover bullet glyphs");
});

test("prose splits on sentence boundaries", () => {
  const s = splitSentences(
    "The mitochondrion is the powerhouse of the cell and it makes energy. Chloroplasts do photosynthesis in plants only.",
  );
  assert.equal(s.length, 2);
});

/* ------------------------------- heuristic ------------------------------ */

test("the offline engine never invents a fact", () => {
  const script = heuristicScript(NOTES, opts());
  const source = splitSentences(NOTES);
  const points = script.segments.filter((s) => s.kind === "point");
  assert.ok(points.length > 0, "produced no points");
  for (const p of points) {
    // Every point is a lead-in phrase followed by one of the student's own
    // sentences — nothing factual is generated.
    assert.ok(
      source.some((src) => p.text.includes(src.replace(/[.!?]$/, ""))),
      `point not traceable to the notes: ${p.text}`,
    );
  }
});

test("an episode has an intro and an outro", () => {
  const script = heuristicScript(NOTES, opts());
  assert.equal(script.segments[0].kind, "intro");
  assert.equal(script.segments.at(-1)!.kind, "outro");
});

test("a longer request produces a longer episode", () => {
  const short = heuristicScript(NOTES, opts({ targetMinutes: 3 }));
  const long = heuristicScript(NOTES, opts({ targetMinutes: 20 }));
  assert.ok(estimateSeconds(long.segments) >= estimateSeconds(short.segments));
});

test("a solo episode is entirely the host", () => {
  const script = heuristicScript(NOTES, opts({ format: "solo" }));
  assert.ok(script.segments.every((s) => s.speaker === "host"));
});

test("a duo episode actually uses both voices", () => {
  const script = heuristicScript(NOTES, opts({ format: "duo" }));
  assert.ok(script.segments.some((s) => s.speaker === "host"));
  assert.ok(script.segments.some((s) => s.speaker === "cohost"));
});

test("empty notes produce a single explanatory segment, not a crash", () => {
  const script = heuristicScript("   ", opts());
  assert.equal(script.segments.length, 1);
  assert.ok(script.segments[0].text.length > 0);
});

test("the title falls back to the subject when none is given", () => {
  assert.equal(heuristicScript(NOTES, opts({ title: "Unit 3 recap" })).title, "Unit 3 recap");
  assert.ok(heuristicScript(NOTES, opts({ title: null })).title.length > 0);
});

/* ------------------------------ sanitizing ------------------------------ */

test("a well-formed model script is accepted", () => {
  const s = sanitizeScript(
    {
      title: "Cell respiration",
      summary: "The three stages.",
      segments: [
        { speaker: "host", kind: "intro", text: "Welcome." },
        { speaker: "cohost", kind: "point", text: "Glycolysis splits glucose." },
      ],
    },
    "duo",
  );
  assert.equal(s?.segments.length, 2);
  assert.equal(s?.segments[1].speaker, "cohost");
});

test("junk in, null out", () => {
  assert.equal(sanitizeScript(null, "solo"), null);
  assert.equal(sanitizeScript("nope", "solo"), null);
  assert.equal(sanitizeScript({ segments: [] }, "solo"), null);
  assert.equal(sanitizeScript({ segments: [{ text: "   " }] }, "solo"), null);
});

test("a solo episode can't smuggle in a co-host the student never picked", () => {
  const s = sanitizeScript(
    { title: "T", segments: [{ speaker: "cohost", kind: "point", text: "Hello." }] },
    "solo",
  );
  assert.equal(s?.segments[0].speaker, "host");
});

test("an unknown segment kind degrades to a plain point", () => {
  const s = sanitizeScript({ segments: [{ kind: "sponsor-read", text: "Hi." }] }, "solo");
  assert.equal(s?.segments[0].kind, "point");
});

test("a runaway segment is capped rather than dropped", () => {
  const s = sanitizeScript({ segments: [{ text: "x ".repeat(2000) }] }, "solo");
  assert.ok(s!.segments[0].text.length <= 1200);
});

/* -------------------------------- folders ------------------------------- */

const courses = [{ id: "c1", name: "Biology" }, { id: "c2", name: "History" }];

test("episodes file into one folder per subject", () => {
  const folders = groupBySubject(
    [
      { courseId: "c1", subject: null },
      { courseId: "c1", subject: null },
      { courseId: "c2", subject: null },
    ],
    courses,
  );
  assert.equal(folders.length, 2);
  assert.equal(folders.find((f) => f.label === "Biology")?.episodes.length, 2);
});

test("a course-linked episode files under the course, not its free text", () => {
  const folders = groupBySubject([{ courseId: "c1", subject: "Something else" }], courses);
  assert.equal(folders[0].label, "Biology");
  assert.equal(folders[0].courseId, "c1");
});

test("subjects that differ only by case share one folder", () => {
  const folders = groupBySubject(
    [{ courseId: null, subject: "Physics" }, { courseId: null, subject: "physics" }],
    courses,
  );
  assert.equal(folders.length, 1);
  assert.equal(folders[0].episodes.length, 2);
});

test("episodes with no subject land in Unfiled, listed last", () => {
  const folders = groupBySubject(
    [{ courseId: null, subject: null }, { courseId: null, subject: "Art" }],
    courses,
  );
  assert.equal(folders.at(-1)!.label, "Unfiled");
  assert.equal(folders[0].label, "Art");
});

test("an episode pointing at a deleted course falls back to its subject", () => {
  const folders = groupBySubject([{ courseId: "gone", subject: "Chemistry" }], courses);
  assert.equal(folders[0].label, "Chemistry");
  assert.equal(folders[0].courseId, null);
});

report("podcast");
