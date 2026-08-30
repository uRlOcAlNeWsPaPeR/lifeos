export interface PlanTier {
  id: "free" | "student_plus";
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
      "Unlimited tasks & calendar",
      "3 active goals · up to 8 courses",
      "AI priority picks on your dashboard",
      "5 Brain Dumps per week",
      "5 AI Assistant questions per day",
      "Connect Canvas — courses, assignments & deadlines",
      "This-week analytics snapshot",
    ],
  },
  {
    id: "student_plus",
    name: "Student+",
    price: "$12.99",
    cadence: "/month",
    tagline: "For students running their whole life in LifeOS.",
    cta: "Go Student+",
    featured: true,
    features: [
      "Everything in Free, plus:",
      "50 Brain Dumps per week",
      "150 AI Assistant questions per day",
      "100 active goals · 60 courses",
      "Full analytics — 6-week history & workload forecast",
      "Semester & long-term planning",
      "Priority access to new AI features",
    ],
  },
];

/** Feature-by-feature grid for the pricing page. `true`/`false` render as check/dash. */
export const PLAN_COMPARISON: {
  group: string;
  rows: { label: string; free: string | boolean; student_plus: string | boolean }[];
}[] = [
  {
    group: "Planning",
    rows: [
      { label: "Tasks & calendar", free: "Unlimited", student_plus: "Unlimited" },
      { label: "Active goals", free: "3", student_plus: "100" },
      { label: "Courses", free: "8", student_plus: "60" },
      { label: "AI priority picks", free: true, student_plus: true },
      { label: "Semester & long-term planning", free: false, student_plus: true },
    ],
  },
  {
    group: "AI",
    rows: [
      { label: "Brain Dumps", free: "5 / week", student_plus: "50 / week" },
      { label: "AI Assistant questions", free: "5 / day", student_plus: "150 / day" },
      { label: "Early access to new AI features", free: false, student_plus: true },
    ],
  },
  {
    group: "School",
    rows: [
      { label: "Canvas integration", free: true, student_plus: true },
      { label: "Assignment & grade tracking", free: true, student_plus: true },
    ],
  },
  {
    group: "Insight",
    rows: [
      { label: "This-week snapshot", free: true, student_plus: true },
      { label: "6-week history & completion rate", free: false, student_plus: true },
      { label: "Workload forecast & subject breakdown", free: false, student_plus: true },
    ],
  },
];
