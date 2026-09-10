// Spaced repetition — the scheduler behind every Practice game.
//
// A trimmed SM-2: each card carries an `ease` (how easy the student finds it)
// and a `streak` (how many times running they've got it right). A correct answer
// pushes the next review further out; a miss drops it back to minutes from now.
// Pure functions over plain objects — no clock, no storage, no React.

import type { CardDTO, Grade, Mastery } from "@/lib/types";

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
export const DEFAULT_EASE = 2.5;

/**
 * Base interval in days for each streak length. Past the end of the table the
 * last gap keeps multiplying by the card's ease, so a well-known card drifts
 * out to months instead of stopping at five weeks.
 */
const INTERVALS = [1, 3, 7, 16, 35];

/**
 * Ceiling on a review gap. Compounding by ease overflows to Infinity around a
 * 40-long streak, which produces an invalid Date — and past a school year the
 * spacing has stopped meaning anything anyway.
 */
const MAX_INTERVAL_DAYS = 365;

const MINUTE = 60_000;
const DAY = 86_400_000;

const clampEase = (e: number) => Math.min(MAX_EASE, Math.max(MIN_EASE, e));

/** A fresh card, ready to be stored in a deck. */
export function newCard(front: string, back: string, hint: string | null = null): Omit<CardDTO, "id"> {
  return {
    front: front.trim(),
    back: back.trim(),
    hint: hint?.trim() || null,
    streak: 0,
    ease: DEFAULT_EASE,
    dueAt: null,
    lapses: 0,
    seen: 0,
    correct: 0,
  };
}

/** Repair a card read back from Firestore, where any field may be missing. */
export function hydrateCard(raw: Partial<CardDTO> & { id: string }): CardDTO {
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    id: raw.id,
    front: String(raw.front ?? ""),
    back: String(raw.back ?? ""),
    hint: raw.hint ? String(raw.hint) : null,
    streak: Math.max(0, num(raw.streak, 0)),
    ease: clampEase(num(raw.ease, DEFAULT_EASE)),
    dueAt: raw.dueAt ? String(raw.dueAt) : null,
    lapses: Math.max(0, num(raw.lapses, 0)),
    seen: Math.max(0, num(raw.seen, 0)),
    correct: Math.max(0, num(raw.correct, 0)),
  };
}

/**
 * Apply one answer to a card and return the updated copy.
 *
 * `now` is injected so the caller (and the tests) control the clock.
 */
export function review(card: CardDTO, grade: Grade, now: Date = new Date()): CardDTO {
  const correct = grade !== "again";
  const seen = card.seen + 1;

  if (!correct) {
    return {
      ...card,
      seen,
      streak: 0,
      lapses: card.lapses + 1,
      ease: clampEase(card.ease - 0.2),
      // Back into the queue in ten minutes — inside this session, not tomorrow.
      dueAt: new Date(now.getTime() + 10 * MINUTE).toISOString(),
    };
  }

  const easeDelta = grade === "hard" ? -0.15 : grade === "easy" ? 0.15 : 0;
  const ease = clampEase(card.ease + easeDelta);
  // "hard" holds the card at its current step; "easy" skips one ahead. The floor
  // of 1 matters on a card's first outing: without it, "hard" would leave the
  // streak at 0 and schedule the same 10 minutes as "again" — so getting a card
  // right, with effort, would look identical to drawing a blank.
  const streak = Math.max(1, card.streak + (grade === "hard" ? 0 : grade === "easy" ? 2 : 1));

  return {
    ...card,
    seen,
    correct: card.correct + 1,
    streak,
    ease,
    dueAt: new Date(now.getTime() + intervalDays(streak, ease) * DAY).toISOString(),
  };
}

/** Days until the next review of a card at this streak and ease. */
export function intervalDays(streak: number, ease: number): number {
  if (streak <= 0) return 0;
  if (streak <= INTERVALS.length) return INTERVALS[streak - 1];
  const extra = streak - INTERVALS.length;
  const grown = INTERVALS[INTERVALS.length - 1] * Math.pow(ease, extra);
  return Math.min(MAX_INTERVAL_DAYS, Math.round(grown));
}

/** Grade shorthand for the games that only know right/wrong. */
export const binaryGrade = (correct: boolean): Grade => (correct ? "good" : "again");

export function mastery(card: CardDTO): Mastery {
  if (card.seen === 0) return "new";
  if (card.streak >= 5) return "mastered";
  if (card.streak >= 3) return "familiar";
  return "learning";
}

/** 0–100 across a deck. A card counts fully once it's mastered. */
export function deckMastery(cards: CardDTO[]): number {
  if (!cards.length) return 0;
  const score = cards.reduce((sum, c) => sum + Math.min(c.streak, 5) / 5, 0);
  return Math.round((score / cards.length) * 100);
}

export function dueCount(cards: CardDTO[], now: Date = new Date()): number {
  return cards.filter((c) => !c.dueAt || Date.parse(c.dueAt) <= now.getTime()).length;
}

/**
 * Order a deck for study: cards that are due first (most overdue leading),
 * then cards never seen, then everything else by how shaky it is.
 *
 * `limit` caps the session — a 300-card deck shouldn't mean a 300-card sitting.
 */
export function buildQueue(cards: CardDTO[], now: Date = new Date(), limit = Infinity): CardDTO[] {
  const t = now.getTime();
  const rank = (c: CardDTO) => {
    if (c.seen === 0) return 1; // new — after anything genuinely overdue
    if (c.dueAt && Date.parse(c.dueAt) <= t) return 0; // due
    return 2; // ahead of schedule
  };
  return [...cards]
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      // Within a band: longest overdue first, then weakest streak.
      const da = a.dueAt ? Date.parse(a.dueAt) : Infinity;
      const dbb = b.dueAt ? Date.parse(b.dueAt) : Infinity;
      return da - dbb || a.streak - b.streak;
    })
    .slice(0, limit);
}

/**
 * Deterministic-free shuffle (Fisher–Yates). Used by every game that deals a
 * random hand, so the order isn't the same on every replay.
 */
export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
