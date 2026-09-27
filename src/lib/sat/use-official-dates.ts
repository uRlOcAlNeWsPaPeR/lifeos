"use client";

import { useEffect, useState } from "react";
import { FALLBACK_DATES, type OfficialDates } from "./official-dates";

let cached: OfficialDates | null = null;
let inflight: Promise<OfficialDates> | null = null;

async function load(): Promise<OfficialDates> {
  if (cached) return cached;
  inflight ??= fetch("/api/sat/dates")
    .then((r) => (r.ok ? (r.json() as Promise<OfficialDates>) : Promise.reject(new Error(String(r.status)))))
    .then((d) => (cached = { sat: d.sat ?? [], psat: d.psat ?? [] }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * College Board's current test dates, refreshed by the server from their site.
 * Starts on the built-in fallback so a countdown never waits on the network,
 * and quietly stays on it if the request fails.
 */
export function useOfficialDates(): { dates: OfficialDates; live: boolean } {
  const [dates, setDates] = useState<OfficialDates>(cached ?? FALLBACK_DATES);
  const [live, setLive] = useState(Boolean(cached));
  useEffect(() => {
    let off = false;
    load()
      .then((d) => {
        if (off) return;
        setDates(d);
        setLive(true);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);
  return { dates, live };
}
