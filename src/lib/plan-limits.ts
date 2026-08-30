// Client-safe plan definitions. Server enforcement lives in lib/ai + the store.

// Two tiers. Every AI feature is capped on BOTH plans — nothing is unlimited, so
// no single user can run up the API bill.
export const PLAN_LIMITS = {
  free: {
    brainDumpsPerWeek: 5,
    assistantPerDay: 5,
    essayCoachPerWeek: 5,
    maxActiveGoals: 3,
    maxCourses: 8,
    fullAnalytics: false,
  },
  student_plus: {
    brainDumpsPerWeek: 50,
    assistantPerDay: 150,
    essayCoachPerWeek: 50,
    maxActiveGoals: 100,
    maxCourses: 60,
    fullAnalytics: true,
  },
} as const;

export type PlanId = keyof typeof PLAN_LIMITS;

/**
 * Accounts that always resolve to the top tier regardless of what's stored in
 * Firestore — the people who build and run LifeOS. Compared case-insensitively.
 */
export const CREATOR_EMAILS = new Set([
  "lifeos3030@gmail.com",
]);

export function isCreator(email: string | null | undefined): boolean {
  return !!email && CREATOR_EMAILS.has(email.trim().toLowerCase());
}

/** The plan actually in force: creator override → stored plan → free fallback. */
export function effectivePlan(
  plan: string | null | undefined,
  email?: string | null,
): PlanId {
  if (isCreator(email)) return "student_plus";
  if (plan === "pro") return "student_plus"; // legacy tier — folded into Student+
  return plan && plan in PLAN_LIMITS ? (plan as PlanId) : "free";
}

export function limitsFor(plan: string) {
  return PLAN_LIMITS[(plan as PlanId)] ?? PLAN_LIMITS.free;
}

export function planLabel(plan: string) {
  return effectivePlan(plan) === "student_plus" ? "Student+" : "Free";
}
