"use client";

import { useSyncExternalStore } from "react";
import type { NebulaInput } from "./nebula";

// Bridges the Dashboard Core (which computes a live, animated NebulaInput
// every render) to <PersistentNebula> (mounted once at the root layout, so
// it survives the Dashboard → SAT navigation instead of unmounting with
// CorePortal). Same useSyncExternalStore singleton shape as scene-store.ts,
// kept separate because it's a different concern (backdrop mood vs. Core
// anchor looks).
//
// CorePortal writes `input` (what the backdrop should look like) and reads
// `live` (whether the real 3D scene — vs. the still-image fallback — is what's
// on screen, to decide whether its own CSS cursor-glow should show). The
// backdrop side is the reverse: PersistentNebula reads `input` and writes
// `live`.

const DEFAULT_INPUT: NebulaInput = { stateHue: 150, energy: 0.45, appHue: null, phase: "home" };

let input: NebulaInput = DEFAULT_INPUT;
let live = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export const nebulaStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getInput: () => input,
  setInput(next: NebulaInput) {
    input = next;
    notify();
  },
  getLive: () => live,
  setLive(next: boolean) {
    if (live === next) return;
    live = next;
    notify();
  },
};

export function useNebulaInput(): NebulaInput {
  return useSyncExternalStore(nebulaStore.subscribe, nebulaStore.getInput, () => DEFAULT_INPUT);
}

export function useNebulaLive(): boolean {
  return useSyncExternalStore(nebulaStore.subscribe, nebulaStore.getLive, () => false);
}
