"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { binaryGrade, buildQueue, review, shuffle } from "@/lib/practice/srs";
import { cn } from "@/lib/utils";
import type { CardDTO } from "@/lib/types";
import { GameShell, GameSummary, fmtClock, type GameProps } from "./game-shell";

/** Pairs per board. Six is twelve tiles — a full grid that still fits a phone. */
const PAIRS = 6;

interface Tile {
  key: string;
  cardId: string;
  text: string;
  side: "front" | "back";
}

type TileState = "idle" | "selected" | "wrong" | "cleared";

/**
 * Match the terms to their definitions against the clock.
 *
 * The scoring side-effect matters as much as the game: clearing a pair on the
 * first try counts as a correct review, and a mismatch counts as a miss — so
 * playing Match genuinely moves the deck's spaced-repetition state.
 */
export function MatchGame({ cards, onFinish, onExit }: GameProps) {
  const [round, setRound] = useState(0);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [state, setState] = useState<Record<string, TileState>>({});
  const [picked, setPicked] = useState<Tile | null>(null);
  const [cleared, setCleared] = useState(0);
  const [tally, setTally] = useState({ right: 0, wrong: 0 });
  const [updates, setUpdates] = useState<Record<string, CardDTO>>({});
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  /** Cards already missed this round — a pair is only "first try" once. */
  const missed = useRef<Set<string>>(new Set());
  /** Ignore clicks during the brief wrong-pair flash. */
  const locked = useRef(false);

  const pool = useMemo(() => buildQueue(cards, new Date()).slice(0, PAIRS), [cards, round]); // eslint-disable-line react-hooks/exhaustive-deps

  const deal = useCallback(() => {
    const fronts: Tile[] = pool.map((c) => ({ key: `${c.id}-f`, cardId: c.id, text: c.front, side: "front" }));
    const backs: Tile[] = pool.map((c) => ({ key: `${c.id}-b`, cardId: c.id, text: c.back, side: "back" }));
    setTiles(shuffle([...fronts, ...backs]));
    setState({});
    setPicked(null);
    setCleared(0);
    missed.current = new Set();
    locked.current = false;
    setStartedAt(Date.now());
    setElapsed(0);
  }, [pool]);

  useEffect(() => { deal(); }, [deal]);

  // Tick the clock while the board is live.
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => clearInterval(id);
  }, [done, startedAt]);

  const finalCards = useMemo(() => cards.map((c) => updates[c.id] ?? c), [cards, updates]);

  function scoreCard(cardId: string, correct: boolean) {
    setUpdates((u) => {
      const base = u[cardId] ?? cards.find((c) => c.id === cardId);
      return base ? { ...u, [cardId]: review(base, binaryGrade(correct)) } : u;
    });
  }

  function pick(tile: Tile) {
    if (locked.current || state[tile.key] === "cleared" || done) return;

    // Tapping the selected tile again deselects it.
    if (picked?.key === tile.key) {
      setPicked(null);
      setState((s) => ({ ...s, [tile.key]: "idle" }));
      return;
    }

    if (!picked) {
      setPicked(tile);
      setState((s) => ({ ...s, [tile.key]: "selected" }));
      return;
    }

    // Two tiles from the same side can't be a pair — treat the second as a new
    // selection rather than a wrong answer.
    if (picked.side === tile.side) {
      setState((s) => ({ ...s, [picked.key]: "idle", [tile.key]: "selected" }));
      setPicked(tile);
      return;
    }

    if (picked.cardId === tile.cardId) {
      const firstTry = !missed.current.has(tile.cardId);
      scoreCard(tile.cardId, firstTry);
      setTally((t) => (firstTry ? { ...t, right: t.right + 1 } : t));
      setState((s) => ({ ...s, [picked.key]: "cleared", [tile.key]: "cleared" }));
      setPicked(null);

      const next = cleared + 1;
      setCleared(next);
      if (next === pool.length) {
        setElapsed(Date.now() - startedAt);
        setDone(true);
      }
      return;
    }

    // Wrong pair — flash both, count it against each card, then reset.
    missed.current.add(picked.cardId).add(tile.cardId);
    scoreCard(picked.cardId, false);
    scoreCard(tile.cardId, false);
    setTally((t) => ({ ...t, wrong: t.wrong + 1 }));
    setState((s) => ({ ...s, [picked.key]: "wrong", [tile.key]: "wrong" }));
    locked.current = true;
    const a = picked.key;
    const b = tile.key;
    setPicked(null);
    setTimeout(() => {
      setState((s) => ({ ...s, [a]: "idle", [b]: "idle" }));
      locked.current = false;
    }, 550);
  }

  function finish(abandoned = false) {
    onFinish({
      cards: finalCards,
      mode: "match",
      ...tally,
      elapsedMs: done ? elapsed : undefined,
      abandoned,
    });
  }

  if (!pool.length) {
    return (
      <GameShell title="Match" onExit={() => finish(true)}>
        <p className="py-16 text-center text-sm text-muted-foreground">
          Match needs at least two cards in the deck.
        </p>
      </GameShell>
    );
  }

  if (done) {
    return (
      <GameShell title="Match" onExit={() => finish(true)}>
        <GameSummary
          title="Board cleared"
          stats={[
            { label: "Time", value: fmtClock(elapsed), tone: "good" },
            { label: "First try", value: `${tally.right}/${pool.length}` },
            { label: "Misses", value: String(tally.wrong), tone: tally.wrong ? "bad" : "neutral" },
          ]}
          onReplay={() => { setDone(false); setTally({ right: 0, wrong: 0 }); setRound((r) => r + 1); }}
          onDone={() => finish()}
        />
      </GameShell>
    );
  }

  return (
    <GameShell
      title="Match"
      subtitle="Tap a term, then its definition"
      progress={cleared / pool.length}
      onExit={() => finish(true)}
      right={
        <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
          <Timer className="h-4 w-4" />
          {fmtClock(elapsed)}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        {tiles.map((t) => {
          const st = state[t.key] ?? "idle";
          return (
            <button
              key={t.key}
              onClick={() => pick(t)}
              disabled={st === "cleared"}
              className={cn(
                "flex min-h-[104px] items-center justify-center rounded-2xl border p-3 text-center text-sm leading-snug transition-all duration-200 sm:min-h-[120px] sm:p-4",
                st === "idle" && "border-white/[0.09] bg-white/[0.02] hover:-translate-y-[2px] hover:border-white/25",
                st === "selected" && "border-primary/60 bg-primary/10 text-foreground",
                st === "wrong" && "animate-shake border-destructive/60 bg-destructive/10",
                // Cleared tiles stay in place so the grid never reflows mid-game.
                st === "cleared" && "pointer-events-none border-transparent bg-transparent opacity-0",
              )}
            >
              <span className="line-clamp-4">{t.text}</span>
            </button>
          );
        })}
      </div>
    </GameShell>
  );
}
