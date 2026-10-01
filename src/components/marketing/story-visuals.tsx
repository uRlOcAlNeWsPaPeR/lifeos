import { CalendarClock, Check, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A still of a LifeOS morning — illustrative tasks, not a real student's.
 * Tilted in 3D and faded at its outer edge so it reads as a glimpse of the
 * app rather than a screenshot.
 */
export function TodayStill({ className }: { className?: string }) {
  const tasks = [
    { title: "Finish lab report draft", course: "Chemistry", due: "Today", tone: "warning", done: false },
    { title: "Read ch. 7 + notes", course: "US History", due: "Tomorrow", tone: "primary", done: false },
    { title: "Problem set 4", course: "Calculus", due: "Thursday", tone: "primary", done: true },
  ] as const;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "[mask-image:linear-gradient(to_right,transparent,#000_22%)] [perspective:1400px]",
        className,
      )}
    >
      <div className="card-surface p-5 [transform:rotateY(16deg)_rotateX(5deg)] sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Thursday</p>
            <p className="mt-1 text-lg font-semibold tracking-tight">Today</p>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary">
            3 to focus on
          </span>
        </div>
        <div className="mt-5 space-y-2">
          {tasks.map((t) => (
            <div
              key={t.title}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3"
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  t.done ? "border-primary bg-primary/20 text-primary" : "border-white/20",
                )}
              >
                {t.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm", t.done && "text-muted-foreground line-through")}>
                  {t.title}
                </span>
                <span className="block text-xs text-muted-foreground">{t.course}</span>
              </span>
              <span className={cn("shrink-0 text-xs font-medium", t.tone === "warning" ? "text-warning" : "text-primary")}>
                {t.due}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-primary" /> Study block · 4:00 PM
          </span>
          <span className="flex items-center gap-1.5">
            <Moon className="h-3.5 w-3.5 text-primary" /> Bedtime 11:00 PM
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The Core as LifeOS's emblem — pure CSS (no WebGL), so it's cheap on phones.
 * Echoes the Dashboard's 3D glass orb: a lit sphere with a faint orbit ring.
 */
export function CoreEmblem({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative mx-auto h-44 w-44 sm:h-52 sm:w-52", className)}>
      <div className="absolute inset-[-40%] rounded-full bg-[radial-gradient(circle,hsl(var(--glow)/0.22),transparent_62%)] motion-safe:animate-glow-breathe" />
      <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle_at_34%_30%,hsl(150_80%_80%/0.95),hsl(152_70%_46%/0.9)_32%,hsl(158_60%_18%)_72%,hsl(160_40%_8%))] shadow-[0_0_60px_-6px_hsl(var(--glow)/0.7),inset_0_-10px_30px_hsl(160_50%_4%/0.8)] motion-safe:animate-float-y" />
      <div className="absolute inset-[4%] rounded-full border border-primary/25 [transform:rotateX(72deg)_rotateZ(-14deg)]" />
      <div className="absolute inset-[-6%] rounded-full border border-white/[0.06] [transform:rotateX(72deg)_rotateZ(18deg)]" />
    </div>
  );
}
