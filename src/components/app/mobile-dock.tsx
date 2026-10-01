"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, GraduationCap, ListChecks, Orbit, Plus } from "lucide-react";
import { QUICK_ADD_ACTIONS, QuickAddSheets, type QuickAddSheet } from "@/components/dashboard/quick-add";
import { resetCoreToHome } from "@/lib/core-phase";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Core", icon: Orbit },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  null, // quick add
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/school", label: "School", icon: GraduationCap },
] as const;

/**
 * Phone-only floating glass dock: the most-used pages one tap away, with
 * quick add in the middle. The sidebar drawer (top bar menu) still has
 * everything else. Hidden from `lg` up, where the rail is always visible.
 */
export function MobileDock() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<QuickAddSheet>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Lets fixed-bottom UI (toasts, undo bar) sit above the dock — see
  // `--dock-offset` in globals.css.
  useEffect(() => {
    document.documentElement.setAttribute("data-dock", "");
    return () => document.documentElement.removeAttribute("data-dock");
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen]);

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <>
      <div
        ref={ref}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2 lg:hidden"
      >
        {menuOpen && (
          <div className="card-surface flex flex-col gap-0.5 p-1.5 animate-slide-up">
            {QUICK_ADD_ACTIONS.map((a) => (
              <button
                key={a.key}
                onClick={() => {
                  setSheet(a.key);
                  setMenuOpen(false);
                }}
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
              >
                <a.icon className="h-4 w-4 text-primary" />
                {a.label}
              </button>
            ))}
          </div>
        )}

        <nav
          aria-label="Quick navigation"
          className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-card/80 p-1.5 shadow-[0_18px_50px_-20px_hsl(0_0%_0%/0.9)] backdrop-blur-xl"
        >
          {ITEMS.map((item) => {
            if (!item) {
              return (
                <button
                  key="add"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label={menuOpen ? "Close quick add" : "Quick add"}
                  aria-expanded={menuOpen}
                  className="mx-0.5 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-gradient-brand text-white shadow-glow-sm transition-transform active:scale-95"
                >
                  <Plus
                    className={cn("h-5 w-5 transition-transform duration-200", menuOpen && "rotate-45")}
                    strokeWidth={2.4}
                  />
                </button>
              );
            }
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={item.href === "/dashboard" ? () => resetCoreToHome() : undefined}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200",
                  active
                    ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--glow)/0.3)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="h-5 w-5" />
              </Link>
            );
          })}
        </nav>
      </div>

      <QuickAddSheets sheet={sheet} onClose={() => setSheet(null)} />
    </>
  );
}
