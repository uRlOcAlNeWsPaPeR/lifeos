"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  ListChecks,
  CalendarDays,
  Brain,
  Target,
  GraduationCap,
  BarChart3,
  ArrowUpRight,
  Gamepad2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ICONS = {
  tasks: ListChecks,
  calendar: CalendarDays,
  brain: Brain,
  goals: Target,
  school: GraduationCap,
  analytics: BarChart3,
  practice: Gamepad2,
};

/**
 * "Physical controls" for the major LifeOS sections. Each is a real <Link>
 * (prefetched) so a click navigates immediately — the tilt/press is CSS only
 * and never blocks. Local pointer tilt on hover.
 */
export function NavDeck({ items }: { items: NavItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((it) => (
        <NavControl key={it.href} item={it} />
      ))}
    </div>
  );
}

function NavControl({ item }: { item: NavItem }) {
  const ref = useRef<HTMLAnchorElement>(null);

  function onMove(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--tx", px.toFixed(3));
    el.style.setProperty("--ty", py.toFixed(3));
  }
  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tx", "0");
    el.style.setProperty("--ty", "0");
  }

  const Icon = item.icon;

  return (
    <Link
      ref={ref}
      href={item.href}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className={cn(
        "group relative block overflow-hidden rounded-2xl border border-white/[0.07] bg-card/70 p-4 backdrop-blur-xl",
        "[transform-style:preserve-3d] [perspective:800px] transition-[transform,box-shadow,border-color] duration-300",
        "hover:border-primary/40 hover:shadow-[0_20px_50px_-20px_hsl(var(--glow)/0.4)] active:scale-[0.97]",
      )}
      style={{
        transform:
          "rotateX(calc(var(--ty,0)*-9deg)) rotateY(calc(var(--tx,0)*11deg)) translateZ(0)",
      }}
    >
      {/* moving sheen */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(180px circle at calc(50% + var(--tx,0)*100%) calc(50% + var(--ty,0)*100%), hsl(var(--glow)/0.16), transparent 70%)",
        }}
      />
      <span className="pointer-events-none absolute right-3 top-3 text-muted-foreground/40 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:text-primary">
        <ArrowUpRight className="h-4 w-4" />
      </span>

      <span
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary transition-colors group-hover:bg-primary/15"
        style={{ transform: "translateZ(28px)" }}
      >
        <Icon className="h-5 w-5" />
      </span>

      <p
        className="mt-3 text-sm font-semibold uppercase tracking-wider"
        style={{ transform: "translateZ(18px)" }}
      >
        {item.label}
      </p>
      <p
        className="mt-0.5 text-xs text-muted-foreground"
        style={{ transform: "translateZ(12px)" }}
      >
        {item.sub}
      </p>
    </Link>
  );
}
