"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowLeft, BookOpen, ClipboardCheck, Layers, LayoutGrid, NotebookPen, PenLine,
  RotateCcw, SlidersHorizontal, TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { flagCoreReform } from "@/lib/core-phase";
import { useSat } from "@/lib/sat/store";
import { cn } from "@/lib/utils";
import { SatStatus } from "./common";

/**
 * Every SAT screen, in the order a student moves through them: what's on
 * today, then the ways to practice, then how it's going, then setup.
 * `short` is the tab label; the long name is the page's own heading.
 */
export const SAT_SECTIONS: {
  href: string;
  short: string;
  label: string;
  icon: typeof LayoutGrid;
  exact?: boolean;
}[] = [
  { href: "/sat", short: "Overview", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/sat/practice", short: "Practice", label: "Practice", icon: PenLine },
  { href: "/sat/exams", short: "Exams", label: "Practice exams", icon: ClipboardCheck },
  { href: "/sat/review", short: "Review", label: "Review mistakes", icon: RotateCcw },
  { href: "/sat/flashcards", short: "Flashcards", label: "Flashcards", icon: Layers },
  { href: "/sat/guides", short: "Guides", label: "Study guides", icon: BookOpen },
  { href: "/sat/progress", short: "Progress", label: "Progress", icon: TrendingUp },
  { href: "/sat/settings", short: "Settings", label: "SAT settings", icon: SlidersHorizontal },
];

/**
 * SAT Prep's own top bar. There's no menu button: SAT is entered from the
 * Core's sphere, so the only way out is back to the Core, and its sections
 * live here in the open rather than behind a drawer.
 */
export function SatTopBar() {
  const pathname = usePathname();
  const { s, ready } = useSat();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Keep the current tab visible when the row scrolls on a phone.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  // Only counts that mean something needs the student.
  const badges: Record<string, React.ReactNode> = {
    "/sat/review": ready && s.missed.length > 0 ? s.missed.length : null,
    "/sat/exams": ready && s.exam && s.exam.phase !== "done" ? "Live" : null,
    "/sat/practice": ready && s.pausedQuiz ? "Paused" : null,
  };

  return (
    <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8 lg:px-10">
        <Link
          href="/dashboard"
          onClick={() => flagCoreReform("sat")}
          className="flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Core</span>
        </Link>
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <NotebookPen className="h-4 w-4 text-primary" />
          SAT Prep
        </span>
        <div className="ml-auto">
          <SatStatus />
        </div>
      </div>

      <nav
        aria-label="SAT Prep sections"
        className="mx-auto flex w-full max-w-[1600px] gap-1 overflow-x-auto px-4 pb-2 scrollbar-thin sm:px-8 lg:px-10"
      >
        {SAT_SECTIONS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          const badge = badges[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              ref={active ? activeRef : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <item.icon className={cn("h-4 w-4", active && "text-primary")} />
              {item.short}
              {badge != null && (
                <Badge tone={item.href === "/sat/review" ? "muted" : "primary"} className="px-1.5 py-0 text-[10px]">
                  {badge}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
