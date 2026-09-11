"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Search, LayoutDashboard, Brain, ListChecks, CalendarDays, GraduationCap,
  Percent, Gamepad2, Target, BarChart3, Sparkles, Settings, Layers, FileText,
  Timer, CornerDownLeft, ArrowUp, ArrowDown,
} from "lucide-react";
import { useAppData } from "@/lib/store/app-data";
import { searchAll, PAGES, KIND_LABEL, type ResultKind, type SearchResult } from "@/lib/search";
import { cn } from "@/lib/utils";

/** Icon per destination, so a result is recognisable before you read it. */
const PAGE_ICONS: Record<string, typeof Search> = {
  "/dashboard": LayoutDashboard,
  "/brain-dump": Brain,
  "/tasks": ListChecks,
  "/study": Timer,
  "/calendar": CalendarDays,
  "/school": GraduationCap,
  "/grades": Percent,
  "/practice": Gamepad2,
  "/goals": Target,
  "/analytics": BarChart3,
  "/assistant": Sparkles,
  "/settings": Settings,
};

const KIND_ICONS: Record<ResultKind, typeof Search> = {
  page: FileText,
  task: ListChecks,
  assignment: FileText,
  course: GraduationCap,
  deck: Layers,
  goal: Target,
  event: CalendarDays,
};

function iconFor(r: SearchResult) {
  return r.kind === "page" ? (PAGE_ICONS[r.href] ?? FileText) : KIND_ICONS[r.kind];
}

/* -------------------------------------------------------------------------- *
 * Open/close is module-level so anything can trigger it — the sidebar button,
 * the dashboard, a keyboard shortcut — without threading state through the tree.
 * Same approach the existing toaster and undo bar use.
 * -------------------------------------------------------------------------- */

let openPalette: (() => void) | null = null;

export function showCommandPalette() {
  openPalette?.();
}

export function CommandPalette() {
  const router = useRouter();
  const { data } = useAppData();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    openPalette = () => {
      setQuery("");
      setActive(0);
      setOpen(true);
    };
    return () => { openPalette = null; };
  }, []);

  // With no query, offer every page — the palette doubles as a site map, so
  // opening it always shows what exists rather than an empty box.
  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) {
      return PAGES.map((p) => ({
        id: p.href, kind: "page" as const, title: p.label,
        subtitle: p.group, href: p.href, score: 0,
      }));
    }
    return searchAll(query, data).slice(0, 24);
  }, [query, data]);

  const go = useCallback(
    (r: SearchResult) => {
      setOpen(false);
      router.push(r.href);
    },
    [router],
  );

  // ⌘K / Ctrl+K from anywhere. Registered once, independent of `open`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) { setQuery(""); setActive(0); }
          return !o;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lock the page behind the palette while it's up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Keep the highlighted row in view as the selection moves.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open || !mounted) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[active];
      if (hit) go(hit);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fade-in"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search LifeOS"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-popover/95 shadow-glow-lg backdrop-blur-xl animate-scale-in"
      >
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search pages, tasks, classes, decks…"
            aria-label="Search LifeOS"
            className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2 scrollbar-thin">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            results.map((r, i) => {
              const Icon = iconFor(r);
              return (
                <button
                  key={`${r.kind}-${r.id}`}
                  data-index={i}
                  onClick={() => go(r)}
                  onMouseMove={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    i === active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.07]",
                      i === active ? "bg-primary/15 text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.title}</span>
                    {r.subtitle && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.subtitle}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground/60">
                    {KIND_LABEL[r.kind]}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-white/[0.07] px-4 py-2.5 text-[11px] text-muted-foreground sm:flex">
          <span className="inline-flex items-center gap-1">
            <ArrowUp className="h-3 w-3" />
            <ArrowDown className="h-3 w-3" /> navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" /> open
          </span>
          <span className="ml-auto">
            {query.trim() ? `${results.length} result${results.length === 1 ? "" : "s"}` : "All pages"}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The visible way in — a palette nobody knows about helps nobody. */
export function SearchTrigger({ className }: { className?: string }) {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);

  return (
    <button
      onClick={showCommandPalette}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="hidden shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] sm:block">
        {isMac ? "⌘" : "Ctrl "}K
      </kbd>
    </button>
  );
}
