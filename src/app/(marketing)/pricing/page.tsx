import type { Metadata } from "next";
import { PricingTable } from "@/components/marketing/pricing-table";
import { PlanComparison } from "@/components/marketing/plan-comparison";

export const metadata: Metadata = { title: "Pricing — LifeOS" };

const FAQ = [
  [
    "Is there really a free plan?",
    "Yes. Unlimited tasks, the calendar and up to 3 goals are free forever, plus 3 Brain Dumps and 5 AI Assistant questions a day.",
  ],
  [
    "What's the difference between Pro and Student+?",
    "Pro lifts the day-to-day caps — unlimited Brain Dumps, 100 Assistant questions a day, 25 goals, 15 courses, and full analytics. Student+ removes the caps entirely and adds semester planning and early access to new AI features.",
  ],
  [
    "Are payments live?",
    "Not in this MVP. Upgrading flips your plan instantly in demo mode so you can try Pro and Student+ features. Real checkout will be added with a billing provider.",
  ],
  [
    "What about Canvas and Infinite Campus?",
    "Those integrations are on the roadmap and will use official APIs or district-approved access. LifeOS will never ask for your school password.",
  ],
  [
    "Can I switch plans later?",
    "Any time, up or down. Your data stays exactly where it is.",
  ],
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">Pricing</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Simple pricing for students
        </h1>
        <p className="mt-3 text-muted-foreground">
          Start free. Upgrade when LifeOS is running your week.
        </p>
      </div>

      <div className="mt-14">
        <PricingTable />
      </div>

      <div className="mx-auto mt-20 max-w-4xl">
        <PlanComparison />
      </div>

      <div className="mx-auto mt-20 max-w-2xl">
        <h2 className="text-center text-2xl font-semibold tracking-tight">Questions</h2>
        <div className="mt-8 divide-y divide-border rounded-2xl border border-border">
          {FAQ.map(([q, a]) => (
            <div key={q} className="p-5">
              <p className="font-medium">{q}</p>
              <p className="mt-1 text-sm text-muted-foreground">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
