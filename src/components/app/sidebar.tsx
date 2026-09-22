"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Gamepad2,
  GraduationCap,
  Headphones,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Library,
  ListChecks,
  LogOut,
  Menu,
  NotebookPen,
  PenLine,
  Percent,
  Puzzle,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { cn, initials } from "@/lib/utils";
import { useAuth } from "@/lib/firebase/auth-context";
import { SearchTrigger } from "@/components/app/command-palette";
import { useSat } from "@/lib/sat/store";

/**
 * Nav grouped by what the student is actually doing, rather than one flat list
 * of nine links: what's on today, the school side of it, and how it's going.
 * The AI Assistant sits on its own below — it's a tool, not a section.
 */
export const NAV_GROUPS: {
  label: string;
  items: { href: string; label: string; icon: typeof LayoutDashboard }[];
}[] = [
  {
    label: "Today",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/brain-dump", label: "Brain Dump", icon: Brain },
      { href: "/tasks", label: "Tasks", icon: ListChecks },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "School",
    items: [
      { href: "/school", label: "School", icon: GraduationCap },
      { href: "/study", label: "Study", icon: Timer },
      { href: "/grades", label: "Grades", icon: Percent },
      { href: "/practice", label: "Practice", icon: Gamepad2 },
      { href: "/podcast", label: "Podcast", icon: Headphones },
    ],
  },
  {
    label: "Progress",
    items: [
      { href: "/goals", label: "Goals", icon: Target },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
];

/**
 * SAT Prep is a section with its own sub-pages, so it gets a collapsible entry
 * rather than nine top-level links. Every item maps to a real SAT screen.
 * `exact` keeps Overview from lighting up on every /sat/* page.
 */
export const SAT_NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  items: { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[];
} = {
  href: "/sat",
  label: "SAT Prep",
  icon: NotebookPen,
  items: [
    { href: "/sat", label: "Overview", icon: LayoutGrid, exact: true },
    { href: "/sat/practice", label: "Practice", icon: PenLine },
    { href: "/sat/exams", label: "Practice exams", icon: ClipboardCheck },
    { href: "/sat/review", label: "Review mistakes", icon: RotateCcw },
    { href: "/sat/bank", label: "Question bank", icon: Library },
    { href: "/sat/flashcards", label: "Flashcards", icon: Layers },
    { href: "/sat/guides", label: "Study guides", icon: BookOpen },
    { href: "/sat/progress", label: "Progress", icon: TrendingUp },
    { href: "/sat/settings", label: "SAT settings", icon: SlidersHorizontal },
  ],
};

export const ASSISTANT = { href: "/assistant", label: "AI Assistant", icon: Sparkles };
export const BRAIN_GAME = { href: "/brain-game", label: "Brain Game", icon: Puzzle };
export const SETTINGS_NAV = { href: "/settings", label: "Settings", icon: Settings };

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: { href: string; label: string; icon: typeof LayoutDashboard };
  pathname: string;
  onNavigate: () => void;
}) {
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
        active
          ? "bg-gradient-to-r from-primary/20 via-primary/5 to-transparent text-foreground shadow-[inset_1px_0_0_hsl(var(--glow)/0.6)]"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
      )}
    >
      <item.icon className={cn("h-4 w-4 transition-colors", active && "text-primary")} />
      {item.label}
    </Link>
  );
}

function SatNavSection({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  const inSat = pathname === SAT_NAV.href || pathname.startsWith(SAT_NAV.href + "/");
  const [open, setOpen] = useState(inSat);
  const { s, ready } = useSat();

  // Arriving anywhere in SAT Prep opens the section.
  useEffect(() => {
    if (inSat) setOpen(true);
  }, [inSat]);

  // Only counts that tell the student something needs them.
  const examLive = ready && s.exam && s.exam.phase !== "done";
  const badges: Record<string, React.ReactNode> = {
    "/sat/review": ready && s.missed.length > 0 ? s.missed.length : null,
    "/sat/exams": examLive ? "Live" : null,
    "/sat/practice": ready && s.pausedQuiz ? "Paused" : null,
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center rounded-xl transition-colors",
          inSat ? "text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
        )}
      >
        <Link
          href={SAT_NAV.href}
          onClick={onNavigate}
          className="flex flex-1 items-center gap-3 px-3 py-2 text-sm font-medium"
        >
          <SAT_NAV.icon className={cn("h-4 w-4", inSat && "text-primary")} />
          {SAT_NAV.label}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="sat-subnav"
          aria-label={open ? "Collapse SAT Prep" : "Expand SAT Prep"}
          className="mr-1 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
        </button>
      </div>
      {open && (
        <div id="sat-subnav" className="ml-5 mt-1 space-y-0.5 border-l border-white/[0.08] pl-2">
          {SAT_NAV.items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            const badge = badges[item.href];
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-all",
                  active
                    ? "bg-gradient-to-r from-primary/20 via-primary/5 to-transparent font-medium text-foreground shadow-[inset_1px_0_0_hsl(var(--glow)/0.6)]"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                <item.icon className={cn("h-3.5 w-3.5", active && "text-primary")} />
                <span className="flex-1 truncate">{item.label}</span>
                {badge != null && (
                  <Badge tone={item.href === "/sat/review" ? "muted" : "primary"} className="px-1.5 py-0 text-[10px]">
                    {badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  user,
  plan,
  open: openProp,
  onOpenChange,
}: {
  user: { name: string; email: string };
  plan: string;
  /**
   * Controlled mode — e.g. the dashboard's own menu button opens this same
   * drawer instead of a separate reduced popup. When passed, the sidebar's
   * own mobile top bar and the persistent desktop rail are both suppressed
   * (the caller owns the trigger), and only the drawer itself renders.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout: signOutUser } = useAuth();
  const controlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlled ? openProp : internalOpen;
  const setOpen = controlled ? (onOpenChange ?? (() => {})) : setInternalOpen;

  // Lock the page behind the drawer + close it on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  async function logout() {
    await signOutUser();
    router.replace("/login");
  }

  const planLabel = plan === "student_plus" ? "Student+" : "Free";

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/" onClick={() => setOpen(false)} aria-label="LifeOS — landing page">
          <Logo />
        </Link>
        <button className="lg:hidden" onClick={() => setOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-3 pb-3">
        <SearchTrigger />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 scrollbar-thin">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={() => setOpen(false)}
                />
              ))}
              {group.label === "School" && (
                <SatNavSection pathname={pathname} onNavigate={() => setOpen(false)} />
              )}
            </div>
          </div>
        ))}
        <div className="mt-1 space-y-1 border-t border-white/[0.06] pt-3">
          <NavLink item={ASSISTANT} pathname={pathname} onNavigate={() => setOpen(false)} />
          <NavLink item={BRAIN_GAME} pathname={pathname} onNavigate={() => setOpen(false)} />
        </div>
      </nav>

      <div className="pb-safe space-y-2 p-3">
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center justify-between rounded-xl border border-border p-3 text-sm transition-colors hover:bg-secondary",
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials(user.name)}
            </span>
            <span className="truncate">
              <span className="block truncate font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </div>
          <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
        <div className="flex items-center justify-between px-1">
          <Badge tone={plan === "free" ? "muted" : "primary"} className="shrink-0 whitespace-nowrap">
            {planLabel} plan
          </Badge>
          <button
            onClick={logout}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-input text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar — the caller owns its own trigger in controlled mode */}
      {!controlled && (
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-background/70 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl lg:hidden">
          <Logo />
          <button onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Drawer — every screen size in controlled mode (the dashboard never
          shows a persistent rail), mobile-only otherwise (desktop gets the
          rail below instead). */}
      {open && (
        <div className={cn("fixed inset-0 z-50", !controlled && "lg:hidden")}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 border-r border-white/10 bg-card/95 backdrop-blur-xl animate-fade-in">
            {body}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      {!controlled && (
        <aside className="hidden w-64 shrink-0 border-r border-white/[0.06] bg-card/40 backdrop-blur-xl lg:block">
          <div className="sticky top-0 h-screen">{body}</div>
        </aside>
      )}
    </>
  );
}
