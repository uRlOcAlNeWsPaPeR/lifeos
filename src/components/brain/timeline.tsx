"use client";

import type { MemoryNode } from "@/lib/brain/types";
import { groupTimeline } from "@/lib/brain/recall";
import { MemoryRow } from "./memory-panel";

/**
 * The same memories as the web, laid out by when they happened: newest year
 * first, then months. This is the "go back" view — a lesson from 2016 is a
 * scroll away — and, being plain text in a list, it's also the accessible
 * alternative to the canvas.
 */
export function Timeline({
  nodes,
  now,
  selectedId,
  onPick,
}: {
  nodes: MemoryNode[];
  now: number;
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const years = groupTimeline(nodes);
  if (years.length === 0) {
    return <p className="px-2 py-10 text-center text-sm text-muted-foreground">Nothing matches that.</p>;
  }
  return (
    <div className="space-y-8 pb-6">
      {years.map((y) => (
        <section key={y.label} aria-label={y.label}>
          <h2 className="sticky top-[var(--brain-sticky,0px)] z-10 -mx-1 mb-2 flex items-baseline gap-2 bg-background/80 px-1 py-1.5 backdrop-blur-md">
            <span className="text-lg font-semibold tracking-tight">{y.label}</span>
            <span className="text-xs text-muted-foreground">
              {y.count} {y.count === 1 ? "memory" : "memories"}
            </span>
          </h2>
          <div className="space-y-4 border-l border-white/[0.08] pl-4">
            {y.months.map((m) => (
              <div key={m.key}>
                {y.year != null && <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.label}</p>}
                <div className="space-y-1.5">
                  {m.nodes.map((n) => (
                    <MemoryRow key={n.id} node={n} now={now} active={n.id === selectedId} onPick={onPick} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
