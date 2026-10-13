"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Brain,
  ListTree,
  Network,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { useAppData } from "@/lib/store/app-data";
import { flagCoreReform } from "@/lib/core-phase";
import { collectMemories, type BrainDumpRecord } from "@/lib/brain/collect";
import { buildGraph, layoutGraph } from "@/lib/brain/graph";
import { resurface } from "@/lib/brain/recall";
import { recall } from "@/lib/brain/search";
import { DAY_MS } from "@/lib/brain/time";
import type { MemoryKind, MemoryNode } from "@/lib/brain/types";
import { cn } from "@/lib/utils";
import { AddMemory } from "./add-memory";
import { BrainWeb } from "./brain-web";
import { KIND_ORDER, KIND_STYLE, kindColor } from "./kind-style";
import { MemoryPanel, MemoryRow } from "./memory-panel";
import { Timeline } from "./timeline";

type TimePreset = "all" | "month" | "year" | "lastyear" | "older";

const PRESETS: { id: TimePreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "month", label: "Past month" },
  { id: "year", label: "This year" },
  { id: "lastyear", label: "Last year" },
  { id: "older", label: "Over a year ago" },
];

function presetRange(p: TimePreset, now: number) {
  const y = new Date(now).getFullYear();
  switch (p) {
    case "month":
      return { start: now - 31 * DAY_MS, end: now + DAY_MS };
    case "year":
      return { start: new Date(y, 0, 1).getTime(), end: now + DAY_MS };
    case "lastyear":
      return {
        start: new Date(y - 1, 0, 1).getTime(),
        end: new Date(y, 0, 1).getTime(),
      };
    case "older":
      return { start: -Infinity, end: now - 365 * DAY_MS };
    default:
      return null;
  }
}

export function BrainView() {
  const { data, deleteMemory, listBrainDumps } = useAppData();
  const [dumps, setDumps] = useState<BrainDumpRecord[]>([]);
  const [mode, setMode] = useState<"web" | "timeline">("web");
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<Set<MemoryKind>>(new Set());
  const [preset, setPreset] = useState<TimePreset>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const asideRef = useRef<HTMLDivElement>(null);

  // One moment per visit: "3 weeks ago" shouldn't tick while you're reading.
  const now = useMemo(() => Date.now(), []);

  // Brain dumps aren't held in the app store (they can be long); read them once.
  const loadDumps = useRef(listBrainDumps);
  loadDumps.current = listBrainDumps;
  useEffect(() => {
    let off = false;
    loadDumps
      .current()
      .then((d) => !off && setDumps(d))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);

  const all = useMemo(
    () =>
      collectMemories({
        memories: data.memories,
        tasks: data.tasks,
        assignments: data.assignments,
        goals: data.goals,
        decks: data.decks,
        podcasts: data.podcasts,
        courses: data.courses,
        dumps,
      }),
    [
      data.memories,
      data.tasks,
      data.assignments,
      data.goals,
      data.decks,
      data.podcasts,
      data.courses,
      dumps,
    ],
  );
  const byId = useMemo(() => new Map(all.map((n) => [n.id, n])), [all]);

  const deferred = useDeferredValue(query);
  const found = useMemo(() => recall(all, deferred, now), [all, deferred, now]);

  // What the web is *built from*: the kind chips and the time window. Search
  // words don't rebuild it — they light things up — so typing never reshuffles.
  const range = found.range ?? presetRange(preset, now);
  const rangeKey = range ? `${range.start}:${range.end}` : "";
  const scoped = useMemo(
    () =>
      all.filter(
        (n) =>
          (kinds.size === 0 || kinds.has(n.kind)) &&
          (!range || (n.at != null && n.at >= range.start && n.at < range.end)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, kinds, rangeKey],
  );
  const graph = useMemo(() => buildGraph(scoped), [scoped]);
  const positions = useMemo(() => layoutGraph(graph), [graph]);

  const searching = found.words.length > 0;
  const highlight = useMemo(
    () =>
      searching && found.scores
        ? new Set([...found.scores.keys()].filter((id) => graph.index.has(id)))
        : null,
    [searching, found.scores, graph],
  );
  const matches = useMemo(
    () =>
      searching && found.scores
        ? scoped
            .filter((n) => found.scores!.has(n.id))
            .sort((a, b) => found.scores!.get(b.id)! - found.scores!.get(a.id)!)
        : [],
    [searching, found.scores, scoped],
  );

  const counts = useMemo(() => {
    const c: Partial<Record<MemoryKind, number>> = {};
    for (const n of all) c[n.kind] = (c[n.kind] ?? 0) + 1;
    return c;
  }, [all]);
  const nudges = useMemo(() => resurface(all, now), [all, now]);

  // A picked memory that's been filtered away shouldn't linger in the panel.
  useEffect(() => {
    if (selectedId && !graph.index.has(selectedId)) setSelectedId(null);
  }, [graph, selectedId]);

  // On a phone the panel sits below the web — bring it into view when one is picked.
  useEffect(() => {
    if (
      selectedId &&
      typeof window !== "undefined" &&
      window.innerWidth < 1024
    ) {
      asideRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedId]);

  const selected: MemoryNode | null = useMemo(() => {
    if (!selectedId) return null;
    if (selectedId.startsWith("hub:")) {
      const i = graph.index.get(selectedId);
      if (i == null) return null;
      return {
        id: selectedId,
        kind: "course",
        title: graph.nodes[i].title,
        text: "",
        at: null,
        hubKey: null,
        hubLabel: null,
        tags: [],
        href: null,
        storedId: null,
      };
    }
    return byId.get(selectedId) ?? null;
  }, [selectedId, graph, byId]);

  function toggleKind(k: MemoryKind) {
    setKinds((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function remove(storedId: string) {
    setSelectedId(null);
    await deleteMemory(storedId);
  }

  const listed = searching ? matches : scoped;
  const presentKinds = KIND_ORDER.filter((k) => counts[k]);

  return (
    <div className="flex min-h-[100svh] flex-col">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8 lg:px-10">
          <Link
            href="/dashboard"
            onClick={() => flagCoreReform("brain")}
            className="flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Core</span>
          </Link>
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <Brain
              className="h-4 w-4"
              style={{ color: kindColor("note", 1, 72) }}
            />
            Brain
          </span>

          <div className="ml-auto flex items-center gap-2">
            <div
              className="flex rounded-full border border-white/10 p-0.5"
              role="group"
              aria-label="View"
            >
              {(
                [
                  { id: "web", label: "Web", icon: Network },
                  { id: "timeline", label: "Timeline", icon: ListTree },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={mode === v.id}
                  onClick={() => setMode(v.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    mode === v.id
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <v.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add memory</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-6 pt-4 sm:px-8 lg:px-10">
        {all.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="Your Brain is empty — for now"
            description="Everything you add to LifeOS lands here: notes, tasks, assignments, study decks, podcasts, brain dumps and the questions you ask the assistant. Add a memory to get started — it can be from any time."
            action={
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" />
                Add your first memory
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1 sm:max-w-md">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Recall something — try "fractions last year"`}
                  aria-label="Search your memories"
                  className="h-10 w-full rounded-full border border-white/10 bg-white/[0.04] pl-10 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/50"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Select
                value={preset}
                onChange={(e) => setPreset(e.target.value as TimePreset)}
                aria-label="Time"
                className="h-10 w-auto rounded-full py-0 text-sm"
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {presentKinds.map((k) => {
                const on = kinds.has(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleKind(k)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                      on
                        ? "border-white/25 bg-white/[0.08] text-foreground"
                        : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: kindColor(k) }}
                    />
                    {KIND_STYLE[k].plural}
                    <span className="tabular-nums opacity-60">{counts[k]}</span>
                  </button>
                );
              })}
              {kinds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setKinds(new Set())}
                  className="px-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
              {found.range && (
                <span className="ml-auto flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                  Showing {found.range.label}
                  <button
                    type="button"
                    aria-label="Remove time filter"
                    onClick={() => setQuery(found.words)}
                    className="hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>

            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="relative h-[62svh] min-h-[420px] lg:h-[calc(100svh-12.5rem)]">
                {scoped.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-muted-foreground">
                    Nothing in that time window or filter.
                  </div>
                ) : mode === "web" ? (
                  <>
                    <BrainWeb
                      graph={graph}
                      positions={positions}
                      selectedId={selectedId}
                      highlight={highlight}
                      now={now}
                      onSelect={setSelectedId}
                    />
                    {graph.truncated > 0 && (
                      <p className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-md">
                        Showing the newest{" "}
                        {graph.nodes.filter((n) => !n.hub).length} of{" "}
                        {graph.nodes.filter((n) => !n.hub).length +
                          graph.truncated}{" "}
                        — narrow by time to reach older ones.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="h-full overflow-y-auto pr-1 scrollbar-thin">
                    <Timeline
                      nodes={listed}
                      now={now}
                      selectedId={selectedId}
                      onPick={setSelectedId}
                    />
                  </div>
                )}
              </div>

              <div
                ref={asideRef}
                className="space-y-4 lg:h-[calc(100svh-12.5rem)] lg:overflow-y-auto lg:pr-1 scrollbar-thin"
              >
                {searching && mode === "web" && !selected && (
                  <Card className="p-3">
                    <p className="mb-2 px-1 text-sm font-medium">
                      {matches.length}{" "}
                      {matches.length === 1 ? "match" : "matches"}
                    </p>
                    {matches.length === 0 ? (
                      <p className="px-1 pb-1 text-xs text-muted-foreground">
                        Nothing in your Brain about that
                        {found.range ? ` from ${found.range.label}` : ""}.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {matches.slice(0, 30).map((n) => (
                          <MemoryRow
                            key={n.id}
                            node={n}
                            now={now}
                            onPick={setSelectedId}
                          />
                        ))}
                      </div>
                    )}
                  </Card>
                )}
                {/* While searching with nothing picked, the results above are the
                    panel — the overview underneath would only be noise. */}
                {(selected || !searching || mode === "timeline") && (
                  <MemoryPanel
                    node={selected}
                    graph={graph}
                    byId={byId}
                    all={all}
                    now={now}
                    nudges={searching ? [] : nudges}
                    counts={counts}
                    onPick={setSelectedId}
                    onClose={() => setSelectedId(null)}
                    onDelete={remove}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <AddMemory open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
