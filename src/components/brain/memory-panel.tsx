"use client";

import Link from "next/link";
import { ExternalLink, History, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BrainGraph } from "@/lib/brain/graph";
import { neighboursOf } from "@/lib/brain/graph";
import type { MemoryKind, MemoryNode } from "@/lib/brain/types";
import { ageLabel, fullDate } from "@/lib/brain/time";
import { cn } from "@/lib/utils";
import { KIND_ORDER, KIND_STYLE, kindColor } from "./kind-style";

export function KindDot({ kind, className }: { kind: MemoryKind; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)} style={{ background: kindColor(kind) }} />;
}

/** One memory as a row — shared by the timeline, search results and the nudges. */
export function MemoryRow({
  node,
  now,
  active,
  onPick,
}: {
  node: MemoryNode;
  now: number;
  active?: boolean;
  onPick: (id: string) => void;
}) {
  const style = KIND_STYLE[node.kind];
  return (
    <button
      type="button"
      onClick={() => onPick(node.id)}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        active ? "border-primary/40 bg-primary/[0.08]" : "border-transparent bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]",
      )}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: kindColor(node.kind, 0.16), color: kindColor(node.kind, 1, 72) }}>
        <style.icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{node.title}</span>
        {node.text && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{node.text}</span>}
        <span className="mt-1 block text-[11px] text-muted-foreground/80">
          {style.label} · {ageLabel(node.at, now)}
          {node.hubLabel ? ` · ${node.hubLabel}` : ""}
        </span>
      </span>
    </button>
  );
}

/**
 * The right-hand side of the Brain. With nothing picked it's an overview — how
 * much is in here, what it's made of, and a few old memories to jog recall.
 * With a memory picked it's that memory in full, plus what it's connected to.
 */
export function MemoryPanel({
  node,
  graph,
  byId,
  all,
  now,
  nudges,
  counts,
  onPick,
  onClose,
  onDelete,
}: {
  node: MemoryNode | null;
  /** Set when a course/subject hub is picked rather than a memory. */
  graph: BrainGraph;
  byId: Map<string, MemoryNode>;
  all: MemoryNode[];
  now: number;
  nudges: MemoryNode[];
  counts: Partial<Record<MemoryKind, number>>;
  onPick: (id: string) => void;
  onClose: () => void;
  onDelete: (storedId: string) => void;
}) {
  if (!node) {
    const dated = all.filter((n) => n.at != null);
    const oldest = dated.length ? Math.min(...dated.map((n) => n.at as number)) : null;
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <p className="text-sm font-medium">
            {all.length} {all.length === 1 ? "memory" : "memories"}
          </p>
          {oldest != null && <p className="mt-0.5 text-xs text-muted-foreground">Going back {ageLabel(oldest, now).replace(" ago", "")}.</p>}
          <ul className="mt-3 space-y-1.5">
            {KIND_ORDER.filter((k) => counts[k]).map((k) => (
              <li key={k} className="flex items-center gap-2 text-xs text-muted-foreground">
                <KindDot kind={k} />
                {KIND_STYLE[k].plural}
                <span className="ml-auto tabular-nums text-foreground/80">{counts[k]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground/80">Brighter dots are newer. Lines join memories that share a topic; rings are your courses and subjects.</p>
        </Card>

        {nudges.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Remember this?
            </p>
            <div className="space-y-1.5">
              {nudges.map((n) => (
                <MemoryRow key={n.id} node={n} now={now} onPick={onPick} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const hub = graph.nodes.find((g) => g.id === node.id)?.hub;
  const style = KIND_STYLE[node.kind];
  const links = neighboursOf(graph, node.id)
    .map((l) => ({ ...l, node: byId.get(l.id) }))
    .filter((l): l is typeof l & { node: MemoryNode } => !!l.node);
  const hubTitle = (() => {
    const hubs = neighboursOf(graph, node.id).filter((l) => l.hub && l.id.startsWith("hub:"));
    return hubs.length ? graph.nodes[graph.index.get(hubs[0].id)!].title : null;
  })();

  return (
    <Card className="p-4">
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: kindColor(node.kind, 0.16), color: kindColor(node.kind, 1, 72) }}>
          <style.icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-snug">{node.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hub
              ? `${links.length} ${links.length === 1 ? "memory" : "memories"}`
              : `${style.label} · ${fullDate(node.at)} · ${ageLabel(node.at, now)}`}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {(hubTitle || node.tags.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {hubTitle && <Badge tone="primary">{hubTitle}</Badge>}
          {node.tags.map((t) => (
            <Badge key={t} tone="muted">
              #{t}
            </Badge>
          ))}
        </div>
      )}

      {node.text && <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 scrollbar-thin">{node.text}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {node.href && (
          <Link
            href={node.href}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/15 px-3.5 text-xs font-medium transition-colors hover:border-white/25 hover:bg-white/5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </Link>
        )}
        {node.storedId && (
          <Button size="sm" variant="ghost" onClick={() => onDelete(node.storedId!)} className="text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        )}
      </div>

      <div className="mt-4 border-t border-white/[0.07] pt-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {hub ? `In ${node.title}` : "Connected memories"}
        </p>
        {links.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing else shares a topic with this yet.</p>
        ) : (
          <div className="space-y-1.5">
            {links.slice(0, hub ? 24 : 8).map((l) => (
              <MemoryRow key={l.id} node={l.node} now={now} onPick={onPick} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

