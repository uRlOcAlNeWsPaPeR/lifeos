"use client";

// One live copy of the student's SAT progress, shared by every SAT screen.
//
// Progress lives in localStorage under ScoreClimb's own key and schema, so a
// ScoreClimb backup restores straight into LifeOS. The state object is mutated
// in place (as ScoreClimb did) and a version counter tells React to re-render.

import { useSyncExternalStore } from "react";
import { STORAGE_KEY, defaultState, parseState } from "./engine";
import type { SatState } from "./types";

let state: SatState = defaultState();
let hydrated = false;
let version = 0;
const listeners = new Set<() => void>();

function read(): SatState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return parseState(raw ? JSON.parse(raw) : null);
  } catch {
    // Corrupted storage — start fresh rather than crash.
    return defaultState();
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("[sat] couldn't save progress", e);
  }
}

function notify() {
  version++;
  listeners.forEach((l) => l());
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  state = read();
  hydrated = true;
  // Another tab practicing updates this one too.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    state = read();
    notify();
  });
}

/** The live state. Safe to read anywhere on the client. */
export function sat(): SatState {
  hydrate();
  return state;
}

/** Mutate progress, persist it, and re-render every SAT screen. */
export function commit(mutate?: (s: SatState) => void): void {
  hydrate();
  mutate?.(state);
  persist();
  notify();
}

/** Save without re-rendering — for ticking clocks that save every few seconds. */
export function saveQuietly(): void {
  if (hydrated) persist();
}

/** Replace everything — used by restore-from-backup and reset. */
export function replaceState(next: SatState): void {
  hydrate();
  state = next;
  persist();
  notify();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Subscribe a component to SAT progress. Returns the state plus a `version`
 * that changes on every commit — use it as a memo dependency, since the state
 * object itself is mutated in place. `ready` is false during server render.
 */
export function useSat() {
  const v = useSyncExternalStore(
    subscribe,
    () => {
      hydrate();
      return version;
    },
    () => -1,
  );
  return { s: state, version: v, ready: v !== -1 };
}
