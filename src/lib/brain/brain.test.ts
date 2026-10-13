/**
 * Brain checks — collecting memories, linking them, laying out the web, and
 * finding things again by topic and by time.
 *
 *   npx tsx src/lib/brain/brain.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import type { AssignmentDTO, CourseDTO, DeckDTO, GoalDTO, PodcastDTO, TaskDTO } from "@/lib/types";
import { collectMemories, type MemorySources } from "./collect";
import { buildGraph, layoutGraph, neighboursOf } from "./graph";
import { root, tokenize } from "./keywords";
import { groupTimeline, resurface } from "./recall";
import { recall } from "./search";
import { ageLabel, dayKey, parseDay, parseTimeHint } from "./time";
import type { MemoryDTO, MemoryNode } from "./types";

const NOW = new Date(2026, 9, 13, 12).getTime(); // Oct 13 2026
const DAY = 86_400_000;
const empty: MemorySources = { memories: [], tasks: [], assignments: [], goals: [], decks: [], podcasts: [], courses: [], dumps: [] };

const node = (id: string, title: string, over: Partial<MemoryNode> = {}): MemoryNode => ({
  id, kind: "note", title, text: "", at: NOW - 30 * DAY, hubKey: null, hubLabel: null, tags: [], href: null, storedId: null, ...over,
});
const stored = (id: string, over: Partial<MemoryDTO> = {}): MemoryDTO => ({
  id, kind: "note", title: "", text: "", occurredAt: "2026-09-01", courseId: null, subject: null, tags: [], createdAt: "2026-10-01T00:00:00.000Z", ...over,
});

/* ---------------------------------- time ---------------------------------- */

test("a stored day is local noon, so it never shows a day early", () => {
  const t = parseDay("2016-03-05")!;
  assert.equal(new Date(t).getDate(), 5);
  assert.equal(new Date(t).getHours(), 12);
  assert.equal(dayKey(t), "2016-03-05");
  assert.equal(parseDay(null), null);
  assert.equal(parseDay("nonsense"), null);
});

test("ages read in the nearest honest unit", () => {
  assert.equal(ageLabel(NOW, NOW), "Today");
  assert.equal(ageLabel(NOW - DAY, NOW), "Yesterday");
  assert.equal(ageLabel(NOW - 5 * DAY, NOW), "5 days ago");
  assert.equal(ageLabel(NOW - 21 * DAY, NOW), "3 weeks ago");
  assert.equal(ageLabel(NOW - 100 * DAY, NOW), "3 months ago");
  assert.equal(ageLabel(NOW - 400 * DAY, NOW), "1 year ago");
  assert.equal(ageLabel(NOW - 10 * 366 * DAY, NOW), "10 years ago");
  assert.equal(ageLabel(null, NOW), "Undated");
});

test("'10 years ago' means around then, and the topic words are left over", () => {
  const { range, rest } = parseTimeHint("multiplication 10 years ago", NOW);
  assert.equal(rest, "multiplication");
  assert.ok(range);
  const tenAgo = new Date(2016, 9, 13).getTime();
  assert.ok(range!.start < tenAgo && tenAgo < range!.end, "10 years back falls inside the window");
  assert.ok(range!.end < NOW - 8 * 365 * DAY, "and the window doesn't reach the recent past");
});

test("other time phrases are understood too", () => {
  assert.equal(parseTimeHint("essay in 2019", NOW).range?.label, "2019");
  assert.equal(parseTimeHint("essay in 2019", NOW).rest, "essay");
  assert.equal(parseTimeHint("fractions last year", NOW).range?.label, "2025");
  assert.equal(parseTimeHint("quiz 2 weeks ago", NOW).rest, "quiz");
  assert.ok(parseTimeHint("anything yesterday", NOW).range);
});

test("a query with no time phrase is left exactly as typed", () => {
  const r = parseTimeHint("photosynthesis", NOW);
  assert.equal(r.range, null);
  assert.equal(r.rest, "photosynthesis");
  assert.equal(parseTimeHint("  ", NOW).rest, "");
});

/* -------------------------------- keywords -------------------------------- */

test("different forms of a word share a root", () => {
  assert.equal(root("multiplication"), root("multiplying"));
  assert.equal(root("multiplication"), root("multiplied"));
  assert.notEqual(root("internet"), root("international"));
  assert.deepEqual(tokenize("The 2 cats"), ["cat"]);
});

/* -------------------------------- collecting ------------------------------- */

const course = { id: "c1", name: "Math 4" } as CourseDTO;
const task = (over: Partial<TaskDTO>): TaskDTO => ({ id: "t", title: "T", notes: null, assignmentId: null, courseId: null, category: null, createdAt: "2026-10-01T00:00:00.000Z", dueAt: null, ...over }) as TaskDTO;

test("every source becomes a memory, namespaced so ids can't collide", () => {
  const nodes = collectMemories({
    ...empty,
    courses: [course],
    memories: [stored("m1", { title: "Times tables", occurredAt: "2016-05-02", courseId: "c1" })],
    tasks: [task({ id: "1", title: "Read chapter" })],
    assignments: [{ id: "1", title: "Quiz", description: null, courseId: "c1", createdAt: "2026-09-02T00:00:00.000Z", dueAt: null, category: "Tests", gradeValue: "A" } as AssignmentDTO],
    goals: [{ id: "1", title: "Run a 5k", description: null, category: "Health", milestones: [] } as unknown as GoalDTO],
    decks: [{ id: "1", title: "Cells", description: null, courseId: null, subject: "Biology", createdAt: "2026-08-01T00:00:00.000Z", cards: [{ front: "Nucleus", back: "Holds DNA" }] } as unknown as DeckDTO],
    podcasts: [{ id: "1", title: "Photosynthesis", summary: "How plants eat", courseId: null, subject: null, createdAt: "2026-07-01T00:00:00.000Z", segments: [{ text: "Plants use light" }] } as unknown as PodcastDTO],
    dumps: [{ id: "1", rawText: "buy markers and finish the poster", createdAt: "2026-10-02T00:00:00.000Z" }],
  });
  assert.deepEqual(nodes.map((n) => n.id).sort(), ["assignment:1", "deck:1", "dump:1", "goal:1", "memory:m1", "podcast:1", "task:1"]);
  assert.equal(new Set(nodes.map((n) => n.id)).size, nodes.length);
});

test("a task that mirrors an assignment isn't a second memory", () => {
  const nodes = collectMemories({ ...empty, tasks: [task({ id: "9", assignmentId: "a9" }), task({ id: "10" })] });
  assert.deepEqual(nodes.map((n) => n.id), ["task:10"]);
});

test("a memory from years back keeps its real date", () => {
  const [n] = collectMemories({ ...empty, memories: [stored("m", { occurredAt: "2016-05-02" })] });
  assert.equal(dayKey(n.at as number), "2016-05-02");
});

test("hubs come from a course, falling back to a typed subject", () => {
  const nodes = collectMemories({
    ...empty,
    courses: [course],
    memories: [stored("a", { courseId: "c1" }), stored("b", { subject: "Chess club" }), stored("c")],
  });
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  assert.equal(by["memory:a"].hubKey, "course:c1");
  assert.equal(by["memory:a"].hubLabel, "Math 4");
  assert.equal(by["memory:b"].hubKey, "subject:chess-club");
  assert.equal(by["memory:c"].hubKey, null);
});

test("empty brain dumps are skipped, and a memory with no title borrows its text", () => {
  const nodes = collectMemories({ ...empty, dumps: [{ id: "1", rawText: "   ", createdAt: "2026-10-02T00:00:00.000Z" }], memories: [stored("m", { text: "I learned long division" })] });
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].title, "I learned long division");
});

/* --------------------------------- recall ---------------------------------- */

const mult = node("a", "Multiplication tables", { text: "Learned the times tables in elementary school", at: new Date(2016, 4, 2).getTime() });
const frac = node("b", "Fractions", { text: "Adding fractions with pizza slices", at: new Date(2016, 5, 9).getTime() });
const recent = node("c", "Multiplying decimals", { text: "Homework on decimals", at: NOW - 2 * DAY });

test("searching finds a memory by what it was about, in any form of the word", () => {
  const r = recall([mult, frac, recent], "multiplying", NOW);
  assert.ok(r.scores!.has("a") && r.scores!.has("c"));
  assert.ok(!r.scores!.has("b"));
});

test("a half-typed word already finds things", () => {
  assert.ok(recall([mult, frac], "multip", NOW).scores!.has("a"));
});

test("every word has to be there — 'fractions pizza' won't match fractions alone", () => {
  const plain = node("d", "Fractions", { text: "just fractions" });
  const r = recall([frac, plain], "fractions pizza", NOW);
  assert.ok(r.scores!.has("b"));
  assert.ok(!r.scores!.has("d"));
});

test("a title match outranks a mention in the text", () => {
  const titled = node("x", "Photosynthesis");
  const mention = node("y", "Biology unit", { text: "photosynthesis came up" });
  const r = recall([mention, titled], "photosynthesis", NOW);
  assert.ok(r.scores!.get("x")! > r.scores!.get("y")!);
});

test("'multiplication 10 years ago' finds the old one and not the recent one", () => {
  const r = recall([mult, frac, recent], "multiplication 10 years ago", NOW);
  assert.deepEqual([...r.scores!.keys()], ["a"]);
  assert.ok(r.range);
});

test("a time phrase alone lists everything from then", () => {
  const r = recall([mult, frac, recent], "in 2016", NOW);
  assert.deepEqual([...r.scores!.keys()].sort(), ["a", "b"]);
});

test("no query means no filtering at all", () => {
  const r = recall([mult, frac], "  ", NOW);
  assert.equal(r.scores, null);
  assert.equal(r.range, null);
});

test("a natural question still works once filler words are dropped", () => {
  assert.ok(recall([mult], "what was the multiplication", NOW).scores!.has("a"));
});

test("undated memories never match a time range", () => {
  const undated = node("u", "Multiplication", { at: null });
  assert.equal(recall([undated], "multiplication 10 years ago", NOW).scores!.size, 0);
});

/* ---------------------------------- graph ---------------------------------- */

const web = (): MemoryNode[] => [
  node("1", "Photosynthesis basics", { text: "chlorophyll absorbs light energy", hubKey: "course:bio", hubLabel: "Biology" }),
  node("2", "Plant cells", { text: "chlorophyll lives in chloroplasts and absorbs light", hubKey: "course:bio", hubLabel: "Biology" }),
  node("3", "Cell membrane", { text: "membrane controls what enters the cell", hubKey: "course:bio", hubLabel: "Biology" }),
  node("4", "French verbs", { text: "irregular verbs conjugation practice", hubKey: "course:fr", hubLabel: "French" }),
  node("5", "French dinner vocabulary", { text: "verbs and vocabulary for dinner conjugation", hubKey: "course:fr", hubLabel: "French" }),
  node("6", "Unrelated errand", { text: "pick up dry cleaning" }),
];

test("memories sharing words are linked, and unrelated ones are not", () => {
  const g = buildGraph(web());
  const linked = (a: string, b: string) => neighboursOf(g, a).some((n) => n.id === b);
  assert.ok(linked("1", "2"), "shared chlorophyll + light");
  assert.ok(linked("4", "5"), "shared verbs + conjugation");
  assert.ok(!linked("1", "4"));
  assert.equal(neighboursOf(g, "6").length, 0);
});

test("a course with several memories becomes a hub they all link to", () => {
  const g = buildGraph(web());
  const hub = g.nodes.find((n) => n.hub && n.title === "Biology");
  assert.ok(hub);
  assert.deepEqual(neighboursOf(g, hub!.id).map((n) => n.id).sort(), ["1", "2", "3"]);
});

test("a hub needs two members; a lone course memory just stands alone", () => {
  const g = buildGraph([node("1", "Solo", { hubKey: "course:x", hubLabel: "X" }), node("2", "Other")]);
  assert.equal(g.nodes.filter((n) => n.hub).length, 0);
});

test("no memory keeps more than a few topic links", () => {
  const many = Array.from({ length: 12 }, (_, i) => node(`n${i}`, `Volcano eruption lava ${i}`, { text: "magma volcano eruption lava crater" }));
  const g = buildGraph(many, { topicLinksPerNode: 3 });
  const mostFor = (id: string) => neighboursOf(g, id).length;
  // a link is kept if either end wants it, so a node can exceed its own 3 — but not run to all 11
  assert.ok(Math.max(...many.map((m) => mostFor(m.id))) < 11);
});

test("over the cap, the newest memories are kept and the rest are counted", () => {
  const many = Array.from({ length: 30 }, (_, i) => node(`n${i}`, `Memory ${i}`, { at: NOW - i * DAY }));
  const g = buildGraph(many, { maxNodes: 10 });
  assert.equal(g.nodes.length, 10);
  assert.equal(g.truncated, 20);
  assert.ok(g.index.has("n0") && !g.index.has("n29"));
});

test("the layout is the same every time", () => {
  const g = buildGraph(web());
  assert.deepEqual([...layoutGraph(g)], [...layoutGraph(g)]);
});

test("layout produces finite positions inside the unit circle, none stacked", () => {
  const g = buildGraph(web());
  const p = layoutGraph(g);
  for (let i = 0; i < g.nodes.length; i++) {
    assert.ok(Number.isFinite(p[i * 2]) && Number.isFinite(p[i * 2 + 1]));
    assert.ok(Math.hypot(p[i * 2], p[i * 2 + 1]) <= 1 + 1e-6);
    for (let j = i + 1; j < g.nodes.length; j++) {
      assert.ok(Math.hypot(p[i * 2] - p[j * 2], p[i * 2 + 1] - p[j * 2 + 1]) > 1e-3, "two nodes sit on the same spot");
    }
  }
});

test("linked memories end up closer together than unlinked ones", () => {
  const g = buildGraph(web());
  const p = layoutGraph(g);
  const dist = (a: number, b: number) => Math.hypot(p[a * 2] - p[b * 2], p[a * 2 + 1] - p[b * 2 + 1]);
  const linkedAvg = g.links.reduce((s, l) => s + dist(l.a, l.b), 0) / g.links.length;
  const set = new Set(g.links.map((l) => `${Math.min(l.a, l.b)}-${Math.max(l.a, l.b)}`));
  let sum = 0;
  let n = 0;
  for (let i = 0; i < g.nodes.length; i++) for (let j = i + 1; j < g.nodes.length; j++) if (!set.has(`${i}-${j}`)) { sum += dist(i, j); n++; }
  assert.ok(linkedAvg < sum / n);
});

test("each hub gathers its own members around it", () => {
  const g = buildGraph(web());
  const p = layoutGraph(g);
  const at = (id: string) => g.index.get(id)!;
  const d = (a: string, b: string) => Math.hypot(p[at(a) * 2] - p[at(b) * 2], p[at(a) * 2 + 1] - p[at(b) * 2 + 1]);
  const bio = g.nodes.find((n) => n.title === "Biology")!.id;
  const fr = g.nodes.find((n) => n.title === "French")!.id;
  assert.ok(d("1", bio) < d("1", fr));
  assert.ok(d("4", fr) < d("4", bio));
});

test("empty and single-memory brains lay out without blowing up", () => {
  assert.equal(layoutGraph(buildGraph([])).length, 0);
  assert.equal(layoutGraph(buildGraph([node("1", "Only")])).length, 2);
});

test("a few hundred memories lay out in a sensible time", () => {
  const big = Array.from({ length: 400 }, (_, i) => node(`n${i}`, `Topic ${i % 25} item ${i}`, { text: `word${i % 25} shared${i % 7}`, hubKey: `course:${i % 6}`, hubLabel: `Course ${i % 6}` }));
  const g = buildGraph(big);
  const t = Date.now();
  layoutGraph(g);
  assert.ok(Date.now() - t < 4000, `layout took ${Date.now() - t}ms`);
});

/* -------------------------------- timeline -------------------------------- */

test("the timeline runs newest year first, and keeps undated memories last", () => {
  const groups = groupTimeline([
    node("a", "Old", { at: new Date(2016, 4, 2).getTime() }),
    node("b", "New", { at: NOW }),
    node("c", "Mid", { at: new Date(2016, 8, 2).getTime() }),
    node("d", "Undated", { at: null }),
  ]);
  assert.deepEqual(groups.map((g) => g.label), ["2026", "2016", "Undated"]);
  assert.deepEqual(groups[1].months.map((m) => m.label), ["September", "May"]);
  assert.equal(groups[1].count, 2);
});

test("resurfacing offers old memories, the same ones all day", () => {
  const nodes = Array.from({ length: 20 }, (_, i) => node(`n${i}`, `Memory number ${i}`, { text: "some text to remember", at: NOW - (40 + i * 30) * DAY }));
  nodes.push(node("fresh", "Fresh thing", { text: "this was just made", at: NOW - DAY }));
  const a = resurface(nodes, NOW);
  const b = resurface(nodes, NOW + 3 * 3600_000); // later the same day
  assert.deepEqual(a.map((n) => n.id), b.map((n) => n.id));
  assert.equal(a.length, 3);
  assert.ok(!a.some((n) => n.id === "fresh"), "yesterday's memory isn't a 'remember this'");
  assert.notDeepEqual(a.map((n) => n.id), resurface(nodes, NOW + 5 * DAY).map((n) => n.id), "and tomorrow it changes");
});

test("a brain with nothing old yet still offers its oldest, and an empty one offers nothing", () => {
  const young = [node("a", "First thing here", { text: "written recently", at: NOW - 2 * DAY }), node("b", "Second thing here", { text: "also recent", at: NOW - DAY })];
  assert.equal(resurface(young, NOW).length, 2);
  assert.deepEqual(resurface([], NOW), []);
});

report("brain");
