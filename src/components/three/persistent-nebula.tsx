"use client";

import { usePathname } from "next/navigation";
import { NebulaBackdrop } from "./nebula-backdrop";
import { useNebulaInput, nebulaStore } from "@/lib/scene/nebula-input";
import type { NebulaInput } from "@/lib/scene/nebula";

// Steady, idle look for the SAT overview — no Core, no detonation, just SAT's
// own blue (227, matching its Core sphere hue in lib/apps.ts) continuing on
// from whatever the Dashboard nebula was already showing when you clicked in.
// `phase: "home"` keeps it at full brightness/speed (the dim-and-slow-down
// treatment is only for the Dashboard's own console view).
const SAT_STEADY_INPUT: NebulaInput = { stateHue: 150, energy: 0.45, appHue: 227, phase: "home" };

// Only these two routes get the nebula at all — everywhere else keeps the
// lighter <AmbientScene/> (see route-mood.ts). Exact match only: SAT's own
// sub-pages (practice, exams, settings, …) are deliberately NOT included
// here, so the nebula doesn't follow you past the overview.
const ROUTES_WITH_NEBULA = new Set(["/dashboard", "/sat"]);

/**
 * Mounted once at the root layout (next to <AmbientScene/>) so the same
 * canvas instance survives the Dashboard → SAT navigation instead of
 * unmounting with CorePortal and handing off to a different background —
 * that hand-off was the "looks like it's going to another page" cut. On
 * `/dashboard` this plays whatever CorePortal is currently pushing (the full
 * interactive, animated nebula); on `/sat` it settles into the fixed steady
 * blue above. Everywhere else it renders nothing.
 */
export function PersistentNebula() {
  const pathname = usePathname();
  const dashboardInput = useNebulaInput();

  if (!ROUTES_WITH_NEBULA.has(pathname)) return null;

  const input = pathname === "/dashboard" ? dashboardInput : SAT_STEADY_INPUT;
  return <NebulaBackdrop input={input} onLiveChange={nebulaStore.setLive} />;
}
