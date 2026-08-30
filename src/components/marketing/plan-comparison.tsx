import { Fragment } from "react";
import { Check, Minus } from "lucide-react";
import { PLAN_COMPARISON } from "@/lib/pricing";

const COLS = [
  { key: "free", label: "Free" },
  { key: "student_plus", label: "Student+" },
] as const;

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-success" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  return <span className="text-sm">{value}</span>;
}

export function PlanComparison() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            <th className="w-2/5 pb-3 text-sm font-medium text-muted-foreground">Compare plans</th>
            {COLS.map((c) => (
              <th key={c.key} className="pb-3 text-center text-sm font-semibold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLAN_COMPARISON.map((group) => (
            <Fragment key={group.group}>
              <tr>
                <td
                  colSpan={COLS.length + 1}
                  className="border-t border-border pt-4 pb-1.5 text-xs font-semibold uppercase tracking-wide text-primary"
                >
                  {group.group}
                </td>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.label} className="align-middle">
                  <td className="py-2 pr-4 text-sm text-muted-foreground">{row.label}</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="py-2 text-center">
                      <Cell value={row[c.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
