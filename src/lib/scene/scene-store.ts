"use client";

import { useSyncExternalStore } from "react";

// A tiny store between the DOM dashboard and the 3D Core. The DOM stays the
// source of truth: CorePortal registers the elements a Core is drawn over
// ("anchors") plus how each should look, and the 3D scene reads them inside
// its animation loop. Nothing per-frame goes through React — the scene polls
// `getScene()` from useFrame, and React only hears about the two things that
// change what's mounted: the status, and which anchors exist.

/**
 * - `off`: no 3D (not supported, reduced motion, opted out, or not mounted)
 * - `loading`: the canvas exists but hasn't drawn a frame yet
 * - `ready`: drawing — the CSS Core can hide
 * - `failed`: WebGL broke or the device was too slow — the CSS Core shows
 */
export type SceneStatus = "off" | "loading" | "ready" | "failed";

/** What a Core over an anchor should look like. */
export interface AnchorLook {
  /** Hue in degrees, same scale as the CSS Core's `--core-hue`. */
  hue: number;
  /** 0–1: how agitated the energy inside is (clear → heavy). */
  energy: number;
  /** `orbit` = an app sphere on the hub; `hero` = the big Core mid-detonation. */
  kind: "orbit" | "hero";
  /** The centred / focal one gets rings, particles and hover. */
  active: boolean;
}

const DEFAULT_LOOK: AnchorLook = { hue: 150, energy: 0.45, kind: "orbit", active: false };

interface SceneState {
  status: SceneStatus;
  reason: string | null;
  els: Map<string, HTMLElement>;
  looks: Map<string, AnchorLook>;
}

const state: SceneState = { status: "off", reason: null, els: new Map(), looks: new Map() };
const listeners = new Set<() => void>();
let anchorKey = "";

function notify() {
  listeners.forEach((l) => l());
}

function syncKey() {
  const next = [...state.els.keys()].sort().join(",");
  if (next === anchorKey) return;
  anchorKey = next;
  notify();
}

export const sceneStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Read-only view for the render loop. */
  getScene(): Readonly<SceneState> {
    return state;
  },

  setStatus(status: SceneStatus, reason: string | null = null) {
    if (state.status === status && state.reason === reason) return;
    state.status = status;
    state.reason = reason;
    notify();
  },

  /** Register (or with null, remove) the element a Core is drawn over. */
  setAnchor(id: string, el: HTMLElement | null) {
    if (el) state.els.set(id, el);
    else state.els.delete(id);
    syncKey();
  },

  /** Set how an anchor's Core looks. Read every frame — never notifies. */
  setLook(id: string, look: Partial<AnchorLook>) {
    state.looks.set(id, { ...(state.looks.get(id) ?? DEFAULT_LOOK), ...look });
  },

  lookOf(id: string): AnchorLook {
    return state.looks.get(id) ?? DEFAULT_LOOK;
  },

  /** Comma-joined ids of the registered anchors — stable while the set is. */
  anchorKey(): string {
    return anchorKey;
  },

  /** Tests only. */
  reset() {
    state.status = "off";
    state.reason = null;
    state.els.clear();
    state.looks.clear();
    anchorKey = "";
  },
};

/** Re-renders only when the status changes. */
export function useSceneStatus(): SceneStatus {
  return useSyncExternalStore(
    sceneStore.subscribe,
    () => state.status,
    () => "off",
  );
}

/** Re-renders only when an anchor is added or removed. */
export function useAnchorKey(): string {
  return useSyncExternalStore(
    sceneStore.subscribe,
    () => anchorKey,
    () => "",
  );
}

/** The CSS Core's state colours, and how busy the energy looks in each. */
export const STATE_LOOK = {
  clear: { hue: 152, energy: 0.25 },
  steady: { hue: 150, energy: 0.45 },
  busy: { hue: 84, energy: 0.7 },
  heavy: { hue: 38, energy: 0.95 },
} as const;
