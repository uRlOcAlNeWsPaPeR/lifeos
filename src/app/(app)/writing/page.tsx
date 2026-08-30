"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  ScanSearch,
  Wand2,
  GraduationCap,
  CircleDot,
  Menu as MenuIcon,
  LogOut,
  Settings as SettingsIcon,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { Modal } from "@/components/ui/modal";
import { LifeosCore } from "@/components/dashboard/lifeos-core";
import { useAuth } from "@/lib/firebase/auth-context";
import { cn } from "@/lib/utils";
import { Overview, type WritingTool } from "./overview";
import { DetectorPane } from "./detector-pane";
import { HumanizerPane } from "./humanizer-pane";
import { CoachPane } from "./coach-pane";

// Writing's sphere hue — matches the orbit entry (BoomFx hue={app.hue}).
const HUE = 170;

type View = "home" | WritingTool;

const TABS: { id: View; label: string; icon: typeof ScanSearch }[] = [
  { id: "home", label: "Overview", icon: LayoutGrid },
  { id: "detector", label: "AI Detector", icon: ScanSearch },
  { id: "humanizer", label: "AI Humanizer", icon: Wand2 },
  { id: "coach", label: "Essay Coach", icon: GraduationCap },
];

const isTool = (v: string | null): v is WritingTool =>
  v === "detector" || v === "humanizer" || v === "coach";

export default function WritingPage() {
  const [view, setView] = useState<View>("home");
  const [menu, setMenu] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [toHumanizer, setToHumanizer] = useState<string | null>(null);
  const [toDetector, setToDetector] = useState<string | null>(null);
  const router = useRouter();
  const { logout } = useAuth();
  const exitTimer = useRef<number | null>(null);

  // Sync `view` to the URL so the browser Back button returns to Overview
  // (and Back from Overview leaves Writing for the hub).
  useEffect(() => {
    const read = () => {
      const t = new URLSearchParams(window.location.search).get("t");
      setView(isTool(t) ? t : "home");
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const go = useCallback((next: View) => {
    setView(next);
    setMenu(false);
    const url = next === "home" ? "/writing" : `/writing?t=${next}`;
    if (window.location.pathname + window.location.search !== url) {
      window.history.pushState(null, "", url);
    }
  }, []);

  const reduced = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Leaving Writing for the hub — reverse of the orbit's tinted detonation.
  const toHub = useCallback(() => {
    setMenu(false);
    if (exiting) return;
    if (reduced()) {
      router.push("/dashboard");
      return;
    }
    setExiting(true);
    exitTimer.current = window.setTimeout(() => router.push("/dashboard"), 720);
  }, [exiting, router]);

  useEffect(() => () => {
    if (exitTimer.current) window.clearTimeout(exitTimer.current);
  }, []);

  async function doLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen" style={{ ["--core-hue" as string]: String(HUE) }}>
      <div style={{ animation: exiting ? "core-implode 340ms ease forwards" : undefined }}>
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
          {/* top bar — same format as the dashboard: full-bleed, ends flush */}
          <div className="flex items-center justify-between px-5 py-3 sm:px-8">
            <Link
              href="/"
              aria-label="LifeOS home"
              className="opacity-90 transition-opacity hover:opacity-100"
            >
              <Logo />
            </Link>
            <div className="flex items-center gap-1.5">
              <button
                onClick={toHub}
                className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-foreground/90 transition-colors hover:border-primary/40 hover:text-primary"
              >
                <CircleDot className="h-4 w-4" />
                <span className="hidden sm:inline">Core</span>
              </button>
              <button
                onClick={() => setMenu(true)}
                aria-label="Menu"
                className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-foreground/90 transition-colors hover:bg-white/[0.08]"
              >
                <MenuIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Menu</span>
              </button>
            </div>
          </div>
          {/* tab bar */}
          <div className="flex gap-1 overflow-x-auto px-3 pb-2 sm:px-6">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => go(t.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    view === t.id
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </header>

        <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
          <div className={view === "home" ? "" : "hidden"}>
            <Overview onOpen={go} />
          </div>
          <div className={view === "detector" ? "" : "hidden"}>
            <DetectorPane
              incomingText={toDetector}
              onConsumed={() => setToDetector(null)}
              onHumanize={(text) => {
                setToHumanizer(text);
                go("humanizer");
              }}
            />
          </div>
          <div className={view === "humanizer" ? "" : "hidden"}>
            <HumanizerPane
              incomingText={toHumanizer}
              onConsumed={() => setToHumanizer(null)}
              onRecheck={(text) => {
                setToDetector(text);
                go("detector");
              }}
            />
          </div>
          <div className={view === "coach" ? "" : "hidden"}>
            <CoachPane />
          </div>
        </main>
      </div>

      {/* exit — the sphere reassembles as you drop back to the hub */}
      {exiting && (
        <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center">
          <span
            className="absolute h-40 w-40 rounded-full"
            style={{
              border: `2px solid hsl(${HUE} 80% 62%)`,
              animation: "core-shock 640ms cubic-bezier(0.7,0,0.5,1) reverse both",
            }}
          />
          <span
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 50% 50%, #ffffff, hsl(${HUE} 100% 70%) 22%, hsl(${HUE + 2} 70% 44% / 0.35) 48%, transparent 72%)`,
              animation: "core-flash 560ms ease-in-out 40ms forwards",
            }}
          />
          <div style={{ animation: "core-reform 640ms cubic-bezier(0.22,1,0.36,1) 60ms both" }}>
            <span className="pointer-events-none block">
              <LifeosCore variant="hero" hueOverride={HUE} motif="writing" />
            </span>
          </div>
        </div>
      )}

      <Modal open={menu} onClose={() => setMenu(false)} title="Writing">
        <div className="grid grid-cols-2 gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                  view === t.id
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-white/10 bg-white/[0.03] hover:border-primary/40 hover:text-primary",
                )}
              >
                <Icon className="h-4 w-4 text-primary" />
                {t.label}
              </button>
            );
          })}
          <Link
            href="/settings"
            onClick={() => setMenu(false)}
            className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-medium hover:border-primary/40 hover:text-primary"
          >
            <SettingsIcon className="h-4 w-4 text-primary" />
            Settings
          </Link>
          <button
            onClick={toHub}
            className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-medium hover:border-primary/40 hover:text-primary"
          >
            <Logo showText={false} />
            Core
          </button>
        </div>
        <button
          onClick={doLogout}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-2.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </Modal>
    </div>
  );
}
