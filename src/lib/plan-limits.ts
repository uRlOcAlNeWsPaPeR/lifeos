// Client-safe plan definitions. Server enforcement lives in lib/ai + the store.

// Two tiers. Every AI feature is capped on both plans except screenshot import
// on Student+, which is deliberately unlimited (Infinity).
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
    // No cap for Student+: a long gradebook takes several screenshots per class.
    // Still tracked per week, and the free plan stays off.
    screenshotImportsPerWeek: Infinity,
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
  "avyukth.satish@gmail.com",
  "neil.mallu@gmail.com",
]);

export function isCreator(email: string | null | undefined): boolean {
  return CREATOR_EMAILS.has(normEmail(email));
}

/** Any account granted the top tier by email — creator or comped. */
export function hasGrantedPlan(email: string | null | undefined): boolean {
  const e = normEmail(email);
  return CREATOR_EMAILS.has(e) || COMPED_EMAILS.has(e);
}

/**
 * Event switch (e.g. a hackathon): NEXT_PUBLIC_EVERYONE_PLUS="1" gives every
 * account Student+ so judges on brand-new accounts don't hit free-plan caps
 * mid-demo. NEXT_PUBLIC_ so the client and server agree; it's inlined at build
 * time, so flipping it needs a redeploy.
 */
export const EVERYONE_PLUS = /^(1|true|yes)$/i.test(
  (process.env.NEXT_PUBLIC_EVERYONE_PLUS ?? "").trim(),
);

/** The plan actually in force: event switch → email grant → stored plan → free fallback. */
export function effectivePlan(
  plan: string | null | undefined,
  email?: string | null,
): PlanId {
  if (EVERYONE_PLUS || hasGrantedPlan(email)) return "student_plus";
  if (plan === "pro") return "student_plus"; // legacy tier — folded into Student+
  return plan && plan in PLAN_LIMITS ? (plan as PlanId) : "free";
}

export function limitsFor(plan: string) {
  return PLAN_LIMITS[(plan as PlanId)] ?? PLAN_LIMITS.free;
}

export function planLabel(plan: string) {
  return effectivePlan(plan) === "student_plus" ? "Student+" : "Free";
}
