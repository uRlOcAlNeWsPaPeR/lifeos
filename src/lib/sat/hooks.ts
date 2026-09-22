"use client";

import { useCallback, useEffect, useState } from "react";
import { loadCatalog, loadGuides, loadVocab } from "./qbank";
import { commit, sat, saveQuietly } from "./store";
import { todayStr } from "./engine";
import type { Catalog, Guide } from "./types";

type Load<T> = { data: T | null; error: string | null; loading: boolean; retry: () => void };

function useLoad<T>(loader: () => Promise<T>): Load<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    loader()
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message || "Couldn't load"));
    return () => {
      alive = false;
    };
    // `loader` is a stable module function; `attempt` drives retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, loading: !data && !error, retry };
}

export const useCatalog = (): Load<Catalog> => useLoad(loadCatalog);
export const useGuides = (): Load<Guide[]> => useLoad(loadGuides);
export const useVocab = (): Load<[string, string][]> => useLoad(loadVocab);

/**
 * Count study time while this screen is open and the tab is visible — the
 * practice runner, an exam module and flashcards, as in ScoreClimb. Saves every
 * 15 seconds and when the page is hidden, without re-rendering the app.
 */
export function useStudyTimer(active = true) {
  useEffect(() => {
    if (!active) return;
    let ticks = 0;
    const id = setInterval(() => {
      const s = sat();
      if (!s.profile || document.hidden) return;
      const d = todayStr();
      s.study = s.study || {};
      s.study[d] = (s.study[d] || 0) + 1;
      if (++ticks % 15 === 0) saveQuietly();
    }, 1000);
    const flush = () => saveQuietly();
    addEventListener("pagehide", flush);
    return () => {
      clearInterval(id);
      removeEventListener("pagehide", flush);
      // Publish the final count so study totals elsewhere are current.
      commit();
    };
  }, [active]);
}

/** A clock that re-renders every second — for countdowns. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
