"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  ListChecks,
  Brain,
  CalendarDays,
  Target,
  GraduationCap,
  Percent,
  BarChart3,
  Sparkles,
  Gamepad2,
  LogOut,
  Menu,
  X,
  Settings,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { cn, initials } from "@/lib/utils";
import { useAuth } from "@/lib/firebase/auth-context";
import { SearchTrigger } from "@/components/app/command-palette";

/**
 * Nav grouped by what the student is actually doing, rather than one flat list
 * of nine links: what's on today, the school side of it, and how it's going.
 * The AI Assistant sits on its own below — it's a tool, not a section.
 */
const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
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
      { href: "/school", label: "Courses", icon: GraduationCap },
      { href: "/grades", label: "Grades", icon: Percent },
      { href: "/practice", label: "Practice", icon: Gamepad2 },
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

const ASSISTANT = { href: "/assistant", label: "AI Assistant", icon: Sparkles };

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

export function Sidebar({
  user,
  plan,
}: {
  user: { name: string; email: string };
  plan: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout: signOutUser } = useAuth();
  const [open, setOpen] = useState(false);

  async function logout() {
    await signOutUser();
    router.replace("/login");
  }

  const planLabel = plan === "student_plus" ? "Student+" : "Free";

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/dashboard" onClick={() => setOpen(false)}>
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
            </div>
          </div>
        ))}
        <div className="mt-1 border-t border-white/[0.06] pt-3">
          <NavLink item={ASSISTANT} pathname={pathname} onNavigate={() => setOpen(false)} />
        </div>
      </nav>

      <div className="space-y-2 p-3">
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
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-background/70 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 border-r border-white/10 bg-card/95 backdrop-blur-xl animate-fade-in">
            {body}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-white/[0.06] bg-card/40 backdrop-blur-xl lg:block">
        <div className="sticky top-0 h-screen">{body}</div>
      </aside>
    </>
  );
}
