// Client-safe plan definitions. Server enforcement lives in lib/ai + the store.

// Two tiers. Every AI feature is capped on BOTH plans — nothing is unlimited, so
// no single user can run up the API bill.
export const PLAN_LIMITS = {
  free: {
    brainDumpsPerWeek: 5,
    assistantPerDay: 5,
    maxActiveGoals: 3,
    maxCourses: 8,
    maxDecks: 5,
    fullAnalytics: false,
    googleCalendarEnabled: false,
    screenshotImportEnabled: false,
    screenshotImportsPerWeek: 0,
  },
  student_plus: {
    brainDumpsPerWeek: 40,
    assistantPerDay: 60,
    maxActiveGoals: 100,
    maxCourses: 60,
    maxDecks: 200,
    fullAnalytics: true,
    googleCalendarEnabled: true,
    screenshotImportEnabled: true,
    // Vision calls are the priciest AI request LifeOS makes (image tokens on
    // top of the prompt) — its own weekly cap, separate from the Brain Dump
    // text budget, so one big screenshot session can't eat it.
    screenshotImportsPerWeek: 10,
  },
} as const;

export type PlanId = keyof typeof PLAN_LIMITS;

const normEmail = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

/**
 * Accounts that always resolve to the top tier regardless of what's stored in
 * Firestore — the people who build and run LifeOS. Compared case-insensitively.
 */
export const CREATOR_EMAILS = new Set([
  "lifeos3030@gmail.com",
]);

/**
 * Hand-granted Student+ — friends, testers, comped accounts. Same effect as a
 * stored `student_plus` plan, but it can't be lost to a plan reset and needs no
 * Firestore write. Compared case-insensitively.
 */
export const COMPED_EMAILS = new Set([
  "vijey7218@mydusd.org",
  "sid.khanuja@gmail.com",
]);

export function isCreator(email: string | null | undefined): boolean {
  return CREATOR_EMAILS.has(normEmail(email));
}

/** Any account granted the top tier by email — creator or comped. */
export function hasGrantedPlan(email: string | null | undefined): boolean {
  const e = normEmail(email);
  return CREATOR_EMAILS.has(e) || COMPED_EMAILS.has(e);
}

/** The plan actually in force: email grant → stored plan → free fallback. */
export function effectivePlan(
  plan: string | null | undefined,
  email?: string | null,
): PlanId {
  if (hasGrantedPlan(email)) return "student_plus";
  if (plan === "pro") return "student_plus"; // legacy tier — folded into Student+
  return plan && plan in PLAN_LIMITS ? (plan as PlanId) : "free";
}

export function limitsFor(plan: string) {
  return PLAN_LIMITS[(plan as PlanId)] ?? PLAN_LIMITS.free;
}

export function planLabel(plan: string) {
  return effectivePlan(plan) === "student_plus" ? "Student+" : "Free";
}
