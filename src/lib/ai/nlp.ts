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
  /^(i\s+)?(have to|have a|need to|needa|gotta|got to|must|should|want to|wanna|plan to|remember to|don'?t forget to|make sure to|also)\s+/i;

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
    const subject = titleCase(raw);
    const label = subject ? `Study for ${subject}` : titleCase(t);
    return { title: label, kind: "study" };
  }
  if (/\b(essay|paper|report|write|writing|draft)\b/.test(lower)) {
    return { title: titleCase(stripLeadVerb(t)), kind: "write" };
  }
  if (/\bemail\b|\breach out\b|\bmessage\b|\btext\b(?! book)/.test(lower)) {
    return { title: titleCase(t), kind: "email" };
  }
  if (/\bpractice\b|\brehears/.test(lower)) {
    // "practice cricket" / "cricket practice" -> "Cricket practice"
    const noun = lower.replace(/\bpractice\b/g, "").replace(/\btonight\b|\btoday\b|\bfor .*/g, "").trim();
    return { title: noun ? `${titleCase(noun)} practice` : titleCase(t), kind: "practice" };
  }
  if (/\bread\b|\bchapter\b|\bpages?\b/.test(lower)) {
    return { title: titleCase(stripLeadVerb(t)), kind: "read" };
  }
  if (/\bproject\b|\bbuild\b|\bcode\b|\bapp\b|\bwebsite\b|\bwork on\b/.test(lower)) {
    return { title: titleCase(stripLeadVerb(t)), kind: "project" };
  }
  if (/\bmeet\b|\bmeeting\b|\bappointment\b|\bcall\b/.test(lower)) {
    return { title: titleCase(t), kind: "meeting" };
  }
  if (/\bbuy\b|\bpick up\b|\bgroceries\b|\blaundry\b|\bclean\b|\breturn\b/.test(lower)) {
    return { title: titleCase(t), kind: "errand" };
  }
  return { title: titleCase(t), kind: "generic" };
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
