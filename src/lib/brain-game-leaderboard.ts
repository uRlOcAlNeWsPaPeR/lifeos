"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteDoc, limit, onSnapshot, orderBy, query, setDoc, getDoc } from "firebase/firestore";
import {
  leaderboardEntriesCol,
  leaderboardEntryDoc,
  leaderboardSkipDoc,
  weekKey,
  type LeaderboardEntryDoc,
} from "@/lib/firebase/schema";
import { useAuth } from "@/lib/firebase/auth-context";

const TOP_N = 100;

/**
 * The Brain Game's weekly Competitive leaderboard. Purely score-driven —
 * nothing here reads tasks or any other app data. A student's `points` is
 * their best 30-second Competitive score this week; joining is opt-in
 * (name + confirm), and it's fine to just skip and watch instead.
 */
export function useBrainGameLeaderboard() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  // Stable for the life of the tab — a genuine week rollover mid-session is
  // rare enough that "refresh to see the new board" is a fine trade for not
  // re-subscribing every render.
  const week = useMemo(() => weekKey(), []);

  const [entries, setEntries] = useState<LeaderboardEntryDoc[]>([]);
  const [own, setOwn] = useState<LeaderboardEntryDoc | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [loadingJoinState, setLoadingJoinState] = useState(true);

  // The ranked board itself — live, so everyone's rank updates as scores come in.
  useEffect(() => {
    const q = query(leaderboardEntriesCol(week), orderBy("points", "desc"), limit(TOP_N));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map((d) => d.data() as LeaderboardEntryDoc));
        setLoadingBoard(false);
      },
      () => setLoadingBoard(false),
    );
    return unsub;
  }, [week]);

  // This student's own entry — live, so a better score on another
  // tab/device reflects here without a refresh.
  useEffect(() => {
    if (!uid) {
      setOwn(null);
      return;
    }
    const unsub = onSnapshot(leaderboardEntryDoc(week, uid), (snap) => {
      setOwn(snap.exists() ? (snap.data() as LeaderboardEntryDoc) : null);
    });
    return unsub;
  }, [week, uid]);

  // Whether they've already declined this week — a one-time read is enough;
  // it only ever matters before they've joined.
  useEffect(() => {
    if (!uid) {
      setLoadingJoinState(false);
      return;
    }
    let alive = true;
    getDoc(leaderboardSkipDoc(week, uid))
      .then((snap) => {
        if (alive) {
          setSkipped(snap.exists());
          setLoadingJoinState(false);
        }
      })
      .catch(() => alive && setLoadingJoinState(false));
    return () => {
      alive = false;
    };
  }, [week, uid]);

  /** First-time opt-in: creates the entry with this round's score. */
  const join = useCallback(
    async (name: string, score: number) => {
      if (!uid) return;
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) return;
      await setDoc(leaderboardEntryDoc(week, uid), {
        uid,
        name: trimmed,
        points: score,
        updatedAt: new Date().toISOString(),
      });
    },
    [uid, week],
  );

  const skip = useCallback(async () => {
    if (!uid) return;
    await setDoc(leaderboardSkipDoc(week, uid), { skippedAt: new Date().toISOString() });
    setSkipped(true);
  }, [uid, week]);

  /** Already joined — bump their score only if this round beat their
   *  existing best. Silent; no re-prompting once they're in. */
  const submitScore = useCallback(
    async (score: number) => {
      if (!uid || !own || score <= own.points) return;
      await setDoc(
        leaderboardEntryDoc(week, uid),
        { uid, name: own.name, points: score, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    },
    [uid, own, week],
  );

  /** Settings → change the name shown on the board, keeping the same score. */
  const rename = useCallback(
    async (name: string) => {
      if (!uid || !own) return;
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) return;
      await setDoc(
        leaderboardEntryDoc(week, uid),
        { uid, name: trimmed, points: own.points, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    },
    [uid, own, week],
  );

  /** Settings → "delete my progress" — drops off this week's board entirely.
   *  Doesn't touch the skip flag, so playing again offers the join prompt
   *  fresh rather than assuming they still want to be left out. */
  const deleteEntry = useCallback(async () => {
    if (!uid) return;
    await deleteDoc(leaderboardEntryDoc(week, uid));
  }, [uid, week]);

  return {
    week,
    loading: loadingBoard || loadingJoinState,
    entries,
    own,
    skipped,
    join,
    skip,
    submitScore,
    rename,
    deleteEntry,
  };
}
