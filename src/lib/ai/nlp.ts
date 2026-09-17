// Lightweight, dependency-free natural-language helpers used by the heuristic
// engine (and to post-process/repair model output).

import type { Priority } from "./types";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export interface DateGuess {
  date: Date | null;
  explicit: boolean;
  timeOfDay: "morning" | "afternoon" | "evening" | "night" | null;
  matchedText: string | null;
}

function atEndOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(23, 59, 0, 0);
  return c;
}

/** Extract a due date only when the user actually stated one. */
export function guessDueDate(input: string, now: Date): DateGuess {
  const text = input.toLowerCase();
  let timeOfDay: DateGuess["timeOfDay"] = null;
  if (/\btonight\b/.test(text)) timeOfDay = "night";
  else if (/\bthis evening\b|\bevening\b/.test(text)) timeOfDay = "evening";
  else if (/\bthis afternoon\b|\bafternoon\b/.test(text)) timeOfDay = "afternoon";
  else if (/\bthis morning\b|\bmorning\b/.test(text)) timeOfDay = "morning";

  const base = new Date(now);
  base.setSeconds(0, 0);

  // today / tonight
  if (/\btoday\b|\btonight\b/.test(text)) {
    return { date: atEndOfDay(base), explicit: true, timeOfDay, matchedText: /tonight/.test(text) ? "tonight" : "today" };
  }
  // tomorrow
  if (/\btomorrow\b/.test(text)) {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return { date: atEndOfDay(d), explicit: true, timeOfDay, matchedText: "tomorrow" };
  }
  // "in N days/weeks"
  const inMatch = text.match(/\bin (\d{1,2}) (day|days|week|weeks)\b/);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10);
    const d = new Date(base);
    d.setDate(d.getDate() + (inMatch[2].startsWith("week") ? n * 7 : n));
    return { date: atEndOfDay(d), explicit: true, timeOfDay, matchedText: inMatch[0] };
  }
  // "next week" -> next Monday
  if (/\bnext week\b/.test(text)) {
    const d = new Date(base);
    const delta = ((8 - d.getDay()) % 7) || 7;
    d.setDate(d.getDate() + delta);
    return { date: atEndOfDay(d), explicit: true, timeOfDay, matchedText: "next week" };
  }
  // weekday, optionally "next friday" / "this friday"
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const re = new RegExp(`\\b(next |this )?${WEEKDAYS[i]}\\b`);
    const m = text.match(re);
    if (m) {
      const d = new Date(base);
      let delta = (i - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // "friday" on a Friday means the next one
      if (m[1]?.trim() === "next" && delta <= 6) delta += 7;
      d.setDate(d.getDate() + delta);
      return { date: atEndOfDay(d), explicit: true, timeOfDay, matchedText: m[0] };
    }
  }
  // "October 3", "Oct 3rd", "3 October"
  for (let i = 0; i < MONTHS.length; i++) {
    const name = MONTHS[i];
    const short = name.slice(0, 3);
    const re = new RegExp(`\\b(${name}|${short})\\.?\\s+(\\d{1,2})(st|nd|rd|th)?\\b`);
    const m = text.match(re);
    if (m) {
      const day = parseInt(m[2], 10);
      let year = base.getFullYear();
      const candidate = new Date(year, i, day, 23, 59);
      if (candidate.getTime() < base.getTime() - 86400000) year += 1;
      return { date: new Date(year, i, day, 23, 59), explicit: true, timeOfDay, matchedText: m[0] };
    }
  }
  // numeric M/D or M/D/YY
  const numMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numMatch) {
    const mo = parseInt(numMatch[1], 10) - 1;
    const day = parseInt(numMatch[2], 10);
    let year = numMatch[3] ? parseInt(numMatch[3], 10) : base.getFullYear();
    if (year < 100) year += 2000;
    const candidate = new Date(year, mo, day, 23, 59);
    if (!numMatch[3] && candidate.getTime() < base.getTime() - 86400000) candidate.setFullYear(year + 1);
    return { date: candidate, explicit: true, timeOfDay, matchedText: numMatch[0] };
  }

  return { date: null, explicit: false, timeOfDay, matchedText: null };
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Physics: ["physics"],
  Chemistry: ["chemistry", "chem"],
  Biology: ["biology", "bio"],
  Math: ["math", "calculus", "calc", "algebra", "geometry", "statistics", "trig"],
  English: ["english", "essay", "literature", "reading log", "book report"],
  History: ["history", "apush", "government", "civics", "geography"],
  "Computer Science": ["coding", "code", "programming", "leetcode", "app", "website", "software", "computer science", "cs "],
  Spanish: ["spanish", "español"],
  French: ["french"],
  Art: ["art", "drawing", "painting", "sketch"],
  Music: ["guitar", "piano", "violin", "band", "orchestra", "choir", "music practice"],
  Health: ["counselor", "counsellor", "doctor", "dentist", "therapist"],
  Sports: ["cricket", "soccer", "basketball", "football", "tennis", "swim", "track", "volleyball", "practice", "workout", "gym", "run"],
  Personal: ["laundry", "clean", "groceries", "call mom", "call dad", "birthday", "gift"],
};

export function guessCategory(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return category;
  }
  return null;
}

export interface TaskShape {
  title: string;
  kind: "study" | "write" | "email" | "project" | "practice" | "read" | "meeting" | "errand" | "generic";
}

const FILLER =
  /^(i\s+)?(have to|have a|have an|have|need to|needa|gotta|got to|must|should|want to|wanna|plan to|remember to|don'?t forget to|make sure to|also)\s+/i;

// Work-type keywords used to build a short "{Subject} {type}" title.
const WORK_TYPES =
  "essay|paper|report|lab report|lab|homework|hw|assignment|project|presentation|pset|problem set|worksheet|packet|reading|quiz|test|exam|midterm|final|review|notes|outline|draft|discussion post|reflection";
// The optional trailing group grabs a number/letter right after the work-type
// word ("Homework 4", "Quiz #3", "Lab 2B") — without it, "Homework 1" and
// "Homework 2" from the same screenshot both tighten down to the identical
// "Homework" and the second one gets silently deduped away as a "repeat".
const WORK_TYPE_RE = new RegExp(
  `\\b([a-z][a-z+-]{1,20})\\s+(${WORK_TYPES})\\b\\s*(#?\\d[a-z0-9]{0,2})?`,
  "i",
);
const NORMALISE_TYPE: Record<string, string> = { hw: "HW", pset: "pset", "problem set": "pset" };

/**
 * Force a task title down to a few keywords.
 *   "english essay on the great gatsby symbolism" -> "English essay"
 *   "do my chem homework problems 1-20"            -> "Chem HW"
 *   "history test on the french revolution, ..."   -> "History test"
 * Leaves already-short titles alone.
 */
export function tightenTitle(input: string): string {
  let t = (input ?? "").trim().replace(FILLER, "").trim();
  // strip date/schedule words wherever they sit — they belong on the due date, not the title
  t = t
    .replace(
      /\b(due|by|on|this|next)?\s*(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|this weekend|morning|afternoon|evening|night)\b/gi,
      " ",
    )
    .replace(/\b(in \d+ (?:days?|weeks?)|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,–-]+|[\s,–-]+$/g, "")
    .trim();
  if (!t) return titleCase((input ?? "").trim());

  // "<subject> <work-type>" is the cleanest form — use it whenever we can, even
  // for a title that's already short ("work on my coding project" -> "Coding project").
  const m = t.match(WORK_TYPE_RE);
  if (m) {
    const subject = m[1].toLowerCase();
    const type = m[2].toLowerCase();
    const typeLabel = NORMALISE_TYPE[type] ?? type;
    const suffix = m[3] ? ` ${m[3].replace(/^#/, "")}` : "";
    if (!/^(the|a|an|my|his|her|their|this|that|some|our)$/.test(subject)) {
      return titleCase(`${subject} ${typeLabel}${suffix}`);
    }
    return titleCase(`${typeLabel}${suffix}`);
  }

  if (t.split(/\s+/).length <= 5) return titleCase(t);
  // Fallback: first 5 words, no trailing punctuation.
  return titleCase(t.split(/\s+/).slice(0, 5).join(" ").replace(/[,.;:]+$/, ""));
}

// A fragment that names an assignment which can have topics / sub-steps under it.
const ELABORATABLE_RE =
  /\b(test|exam|quiz|midterm|final|essay|paper|report|presentation|project|study(?:ing)?|review|lab|homework|hw|assignment|worksheet|pset|problem set|packet|reading|analysis|write[- ]?up)\b/i;
// A verb / noun that marks its own to-do (not a detail of another task).
const ACTION_VERBS =
  "read|write|study|studying|practice|rehearse|email|e-mail|text|message|call|meet|finish|complete|submit|turn in|hand in|buy|pick up|grab|clean|return|watch|make|start|work on|apply|register|sign up|schedule|book|pay|fill out|record|find|look up|research|print|outline|revise|edit|proofread|upload|memorize|prepare|get|draft";
const NEW_TASK_RE = new RegExp(
  `\\b(test|exam|quiz|midterm|final|essay|paper|report|hw|homework|assignment|project|lab|pset|problem set|presentation|worksheet|packet|reading|meeting|appointment|${ACTION_VERBS})\\b`,
  "i",
);
const DATE_WORD_RE =
  /\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|this weekend|by (?:mon|tue|wed|thu|fri|sat|sun|next|the)|due (?:mon|tue|wed|thu|fri|sat|sun|next|by|on)|\d{1,2}\/\d{1,2}|\bin \d+ (?:day|week))\b/i;

/** A short phrase with no verb / assignment word / date — i.e. a topic, not a task. */
function isBareTopic(fragment: string): boolean {
  const f = fragment.trim().toLowerCase().replace(/^(and|the|a|an)\s+/, "");
  const words = f.split(/\s+/);
  if (!f || words.length > 9) return false;
  return !NEW_TASK_RE.test(f) && !DATE_WORD_RE.test(f);
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const asSentence = (s: string) => {
  const t = cap(s.trim().replace(/[.\s]+$/, ""));
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/**
 * Split one fragment into the short ACTION (becomes the title, keeps date words)
 * and the DETAIL (becomes notes). Handles both:
 *   "physics lab. i need to graph velocity and answer q1-8"  -> action / detail
 *   "english essay due friday about symbolism in gatsby"     -> action / detail
 */
function splitActionDetail(fragment: string): { action: string; detail: string | null } {
  const f = fragment.trim().replace(/[.]+$/, "");
  const clean = (s: string) =>
    s
      .trim()
      .replace(/^(and|then|also)\s+/i, "")
      .replace(/[\s.,;]+(?:i|a|an|the|and|to|my|it)$/i, "")
      .trim();

  // "<...work type...> on/about <detail>" — keep any date words in the action
  const topical = f.match(
    new RegExp(
      `^(.*?\\b(?:${WORK_TYPES})\\b[\\s\\w]{0,20}?)\\b(?:on|about|over|covering|regarding)\\s+(.{4,})$`,
      "i",
    ),
  );
  if (topical && !NEW_TASK_RE.test(topical[2])) {
    return { action: clean(topical[1]), detail: clean(topical[2]) };
  }

  // "email/call/ask <someone> about <detail>"
  const aboutM = f.match(
    /^((?:email|e-mail|call|text|message|meet with|talk to|ask|remind|tell|update|check with|follow up with)\b[^,.]{2,45}?)\s+(?:about|regarding|re:?|on)\s+(.{3,})$/i,
  );
  if (aboutM) return { action: clean(aboutM[1]), detail: clean(aboutM[2]) };

  // "<action>. <it/this/the X> needs/must/requires <detail>"  or  "<action> — <detail>"
  const clausal = f.match(
    /^(.{6,}?)(?:[.;]\s+|\s+—\s+|,?\s+(?:and\s+)?(?:it|this|they|which|the \w+)\s+(?:needs?|has to|have to|must|should|is|are|will|requires?)\b\s*)(.+)$/i,
  );
  if (clausal && clausal[2].trim().split(/\s+/).length >= 2) {
    return { action: clean(clausal[1]), detail: clean(clausal[2]) };
  }

  return { action: f, detail: null };
}

export interface Parcel {
  text: string;
  notes: string | null;
}

/**
 * Turn raw fragments into task parcels. Fixes over-splitting (a comma list of
 * topics under one assignment stays ONE task) and detail-loss (requirements /
 * instructions land in `notes`, not the title).
 */
export function consolidateFragments(fragments: string[]): Parcel[] {
  const groups: { head: string; extra: string[] }[] = [];
  // "I need to graph X and answer Y" — the pieces after the marker are sub-steps.
  const LIST_MARKER = /\b(?:need|needs|have|has|had|gotta|got|want|wants|planning) to\b/i;
  const STANDALONE = new RegExp(`\\b(${ACTION_VERBS}|test|exam|quiz|essay|paper|hw|homework|assignment|lab)\\b`, "i");

  for (const raw of fragments) {
    const frag = raw.trim().replace(/^(and|then|also)\s+/i, "");
    if (!frag) continue;
    const prev = groups[groups.length - 1];

    // a bare topic phrase belongs to the previous assignment, not its own task
    if (prev && ELABORATABLE_RE.test(prev.head) && isBareTopic(frag)) {
      prev.extra.push(frag.replace(/^the\s+/i, "").trim());
      continue;
    }

    // a short piece after "I need to …" is a sub-step of that task, not a new task
    if (
      prev &&
      LIST_MARKER.test(prev.head) &&
      frag.split(/\s+/).length <= 8 &&
      !DATE_WORD_RE.test(frag) &&
      !/\b(email|e-mail|call|text|meet|buy|return|pay|apply|register|schedule|book|clean)\b/i.test(frag) &&
      // still fold "answer questions 1-8" but not "study for my test"
      !/\b(test|exam|quiz|essay|paper|study|studying)\b/i.test(frag) &&
      STANDALONE.test(frag)
    ) {
      prev.extra.push(frag.trim());
      continue;
    }

    groups.push({ head: frag, extra: [] });
  }

  return groups.map((g) => {
    const { action, detail } = splitActionDetail(g.head);
    const noteParts: string[] = [];
    if (detail) noteParts.push(detail.replace(/^(?:i|we|you)\s+(?:need|have|gotta|got|want)\s+to\s+/i, ""));
    for (const e of g.extra) {
      const t = e.replace(/[\s.,;]+(?:i|a|an|the|and|to|my|it)$/i, "").trim();
      if (t) noteParts.push(t);
    }
    return {
      text: action,
      notes: noteParts.length ? asSentence(noteParts.join("; ")) : null,
    };
  });
}

/** Turn a raw fragment into a clean, action-oriented task title. */
export function normalizeTask(fragment: string): TaskShape {
  let t = fragment.trim().replace(/^[-*•\d.)\s]+/, "").replace(/[.;,]+$/, "").trim();
  t = t.replace(FILLER, "").trim();
  const lower = t.toLowerCase();

  // "physics test friday" -> "Study for Physics"
  const testMatch = lower.match(/([a-z ]+?)\s+(test|exam|quiz|midterm|final)\b/);
  if (testMatch || /\b(study|studying|review|revise)\b/.test(lower)) {
    let raw = testMatch
      ? testMatch[1].trim()
      : lower
          .replace(/.*\b(study|studying|review|revise)( for)?\b/, "")
          .replace(/\b(test|exam|quiz|midterm|final)\b.*/, "")
          .trim();
    // strip any leading "study for" / "for" the matcher grabbed with the subject
    raw = raw.replace(/^(study(ing)?\s+for|study(ing)?|for)\s+/i, "").trim();
    const subject = titleCase((guessCategory(raw) ?? raw).trim());
    const label = subject ? `Study for ${subject}` : tightenTitle(t);
    return { title: label, kind: "study" };
  }
  if (/\b(essay|paper|report|write|writing|draft)\b/.test(lower)) {
    return { title: tightenTitle(stripLeadVerb(t)), kind: "write" };
  }
  if (/\bemail\b|\breach out\b|\bmessage\b|\btext\b(?! book)/.test(lower)) {
    return { title: tightenTitle(t), kind: "email" };
  }
  if (/\bpractice\b|\brehears/.test(lower)) {
    // "practice cricket" / "cricket practice" -> "Cricket practice"
    const noun = lower.replace(/\bpractice\b/g, "").replace(/\btonight\b|\btoday\b|\bfor .*/g, "").trim();
    return { title: noun ? `${titleCase(noun)} practice` : tightenTitle(t), kind: "practice" };
  }
  if (/\bread\b|\bchapter\b|\bpages?\b/.test(lower)) {
    return { title: tightenTitle(stripLeadVerb(t)), kind: "read" };
  }
  if (/\bproject\b|\bbuild\b|\bcode\b|\bapp\b|\bwebsite\b|\bwork on\b/.test(lower)) {
    return { title: tightenTitle(stripLeadVerb(t)), kind: "project" };
  }
  if (/\bmeet\b|\bmeeting\b|\bappointment\b|\bcall\b/.test(lower)) {
    return { title: tightenTitle(t), kind: "meeting" };
  }
  if (/\bbuy\b|\bpick up\b|\bgroceries\b|\blaundry\b|\bclean\b|\breturn\b/.test(lower)) {
    return { title: tightenTitle(t), kind: "errand" };
  }
  return { title: tightenTitle(t), kind: "generic" };
}

function stripLeadVerb(t: string) {
  return t.replace(/^(finish|complete|do|work on|start|continue|keep working on|wrap up)\s+/i, (m) =>
    /^finish/i.test(m) ? "Finish " : m,
  );
}

export function titleCase(s: string) {
  const trimmed = s.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function estimateMinutes(kind: TaskShape["kind"]): number {
  switch (kind) {
    case "study":
      return 90;
    case "write":
      return 120;
    case "project":
      return 90;
    case "practice":
      return 75;
    case "read":
      return 45;
    case "meeting":
      return 30;
    case "email":
      return 15;
    case "errand":
      return 30;
    default:
      return 30;
  }
}

export function derivePriority(opts: {
  kind: TaskShape["kind"];
  due: Date | null;
  now: Date;
  timeOfDay: DateGuess["timeOfDay"];
}): Priority {
  const { kind, due, now, timeOfDay } = opts;
  if (due) {
    const days = (due.getTime() - now.getTime()) / 86400000;
    if (days <= 1) return "urgent";
    if (days <= 3) return "high";
    if (days <= 7) return "medium";
    return "low";
  }
  if (timeOfDay === "night" || timeOfDay === "evening") return "high";
  if (kind === "study" || kind === "write") return "high";
  if (kind === "email" || kind === "errand") return "low";
  return "medium";
}

export function splitFragments(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+|,|;| and (?=[a-z])| then | also (?=[a-z])|\bplus\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && /[a-z]/i.test(s));
}
