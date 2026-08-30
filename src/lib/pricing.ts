export interface PlanTier {
  id: "free" | "pro" | "student_plus";
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  cta: string;
  featured?: boolean;
  features: string[];
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "Everything you need to get organized.",
    cta: "Start for free",
    features: [
      "Unlimited tasks, calendar & 3 active goals",
      "AI priority picks on your dashboard",
      "3 Brain Dumps per day",
      "5 AI Assistant questions per day",
      "Up to 4 courses",
      "This-week analytics snapshot",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$7.99",
    cadence: "/month",
    tagline: "Serious planning for a full course load.",
    cta: "Upgrade to Pro",
    featured: true,
    features: [
      "Everything in Free, plus:",
      "Unlimited Brain Dumps",
      "100 AI Assistant questions per day",
      "Up to 25 active goals & 15 courses",
      "Full analytics — 6-week history, workload forecast",
      "School assignment & grade tracking",
      "Future Canvas integration",
    ],
  },
  {
    id: "student_plus",
    name: "Student+",
    price: "$12.99",
    cadence: "/month",
    tagline: "For students running their whole life in LifeOS.",
    cta: "Go Student+",
    features: [
      "Everything in Pro, plus:",
      "Unlimited AI Assistant",
      "Unlimited goals & courses",
      "Semester & long-term planning",
      "Priority access to new AI features",
      "Future district & school integrations",
    ],
  },
];

/** Feature-by-feature grid for the pricing page. `true`/`false` render as check/dash. */
export const PLAN_COMPARISON: {
  group: string;
  rows: { label: string; free: string | boolean; pro: string | boolean; student_plus: string | boolean }[];
}[] = [
  {
    group: "Planning",
    rows: [
      { label: "Tasks & calendar", free: "Unlimited", pro: "Unlimited", student_plus: "Unlimited" },
      { label: "Active goals", free: "3", pro: "25", student_plus: "Unlimited" },
      { label: "Courses", free: "4", pro: "15", student_plus: "Unlimited" },
      { label: "AI priority picks", free: true, pro: true, student_plus: true },
      { label: "Semester & long-term planning", free: false, pro: false, student_plus: true },
    ],
  },
  {
    group: "AI",
    rows: [
      { label: "Brain Dumps", free: "3 / day", pro: "Unlimited", student_plus: "Unlimited" },
      { label: "AI Assistant questions", free: "5 / day", pro: "100 / day", student_plus: "Unlimited" },
      { label: "Early access to new AI features", free: false, pro: false, student_plus: true },
    ],
  },
  {
    group: "Insight",
    rows: [
      { label: "This-week snapshot", free: true, pro: true, student_plus: true },
      { label: "6-week history & completion rate", free: false, pro: true, student_plus: true },
      { label: "Workload forecast & subject breakdown", free: false, pro: true, student_plus: true },
      { label: "School assignment & grade tracking", free: false, pro: true, student_plus: true },
    ],
  },
];
