// Client-safe plan definitions. Server enforcement lives in lib/ai + the store.

export const PLAN_LIMITS = {
  free: {
    brainDumpsPerDay: 3,
    assistantPerDay: 5,
    maxActiveGoals: 3,
    maxCourses: 4,
    fullAnalytics: false,
  },
  pro: {
    brainDumpsPerDay: Infinity,
    assistantPerDay: 100,
    maxActiveGoals: 25,
    maxCourses: 15,
    fullAnalytics: true,
  },
  student_plus: {
    brainDumpsPerDay: Infinity,
    assistantPerDay: Infinity,
    maxActiveGoals: Infinity,
    maxCourses: Infinity,
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
  return plan && plan in PLAN_LIMITS ? (plan as PlanId) : "free";
}

export function limitsFor(plan: string) {
  return PLAN_LIMITS[(plan as PlanId)] ?? PLAN_LIMITS.free;
}

export function planLabel(plan: string) {
  return plan === "student_plus" ? "Student+" : plan === "pro" ? "Pro" : "Free";
}
