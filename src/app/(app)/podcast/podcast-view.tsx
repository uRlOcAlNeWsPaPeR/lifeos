"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Folder, Headphones, Mic, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { useAppData } from "@/lib/store/app-data";
import { groupBySubject, formatDuration } from "@/lib/podcast/script";
import { timeAgo } from "@/lib/format";
import { CreateEpisode } from "./create-episode";
import { EpisodePlayer } from "./player";
import type { PodcastDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The library: every episode filed into a folder per subject, with the player
 * opening inline under whichever episode is selected.
 */
export function PodcastView() {
  const { data, deletePodcast, markPodcastPlayed } = useAppData();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const folders = useMemo(
    () => groupBySubject(data.podcasts, data.courses),
    [data.podcasts, data.courses],
  );

  const totalSeconds = useMemo(
    () => data.podcasts.reduce((n, p) => n + p.estimatedSeconds, 0),
    [data.podcasts],
  );

  async function remove(ep: PodcastDTO) {
    const yes = await confirm({
      title: `Delete “${ep.title}”?`,
      body: "The episode and its transcript go with it. You can undo straight after.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!yes) return;
    if (openId === ep.id) setOpenId(null);
    await deletePodcast(ep.id);
  }

  return (
    <>
      <PageHeader
        title="Podcast"
        description="Turn your notes into episodes you can listen to on the bus, on a walk, or anywhere you can't be reading."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New episode
          </Button>
        }
      />

      {data.podcasts.length === 0 ? (
        <EmptyState
          icon={Headphones}
          title="No episodes yet"
          description="Paste a set of notes and LifeOS will turn them into a narrated episode — pick the voices, pick how long, and it files itself under the subject."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Mic className="h-4 w-4" />
              Make your first episode
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <div className="flex flex-wrap gap-2">
            <Badge>{data.podcasts.length} episode{data.podcasts.length === 1 ? "" : "s"}</Badge>
            <Badge>{folders.length} folder{folders.length === 1 ? "" : "s"}</Badge>
            <Badge>{formatDuration(totalSeconds)} total</Badge>
          </div>

          {folders.map((folder) => {
            const isCollapsed = collapsed[folder.key];
            return (
              <section key={folder.key}>
                <button
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [folder.key]: !c[folder.key] }))
                  }
                  className="mb-3 flex w-full items-center gap-2 text-left"
                >
                  <Folder className="h-4 w-4 shrink-0 text-primary" />
                  <h2 className="text-base font-semibold tracking-tight">{folder.label}</h2>
                  <span className="text-xs text-muted-foreground">
                    {folder.episodes.length}
                  </span>
                  <ChevronDown
                    className={cn(
                      "ml-auto h-4 w-4 text-muted-foreground transition-transform",
                      isCollapsed && "-rotate-90",
                    )}
                  />
                </button>

                {!isCollapsed && (
                  <div className="space-y-3">
                    {folder.episodes.map((ep) => (
                      <Card key={ep.id} className="overflow-hidden p-0">
                        <div className="flex items-start gap-3 p-4">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
                            <Headphones className="h-4 w-4" />
                          </span>

                          <button
                            onClick={() => setOpenId(openId === ep.id ? null : ep.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-sm font-medium">{ep.title}</p>
                            {ep.summary && (
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {ep.summary}
                              </p>
                            )}
                            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <span>{formatDuration(ep.estimatedSeconds)}</span>
                              <span>·</span>
                              <span>{ep.format === "duo" ? "Two hosts" : "One host"}</span>
                              <span>·</span>
                              <span>
                                {ep.lastPlayedAt
                                  ? `Played ${timeAgo(ep.lastPlayedAt)}`
                                  : `Made ${timeAgo(ep.createdAt)}`}
                              </span>
                              {ep.source === "offline" && (
                                <>
                                  <span>·</span>
                                  <span>Offline engine</span>
                                </>
                              )}
                            </p>
                          </button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(ep)}
                            aria-label={`Delete ${ep.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {openId === ep.id && (
                          <div className="border-t border-white/[0.07] p-4">
                            <EpisodePlayer
                              episode={ep}
                              onPlayed={() => markPodcastPlayed(ep.id)}
                            />
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <CreateEpisode open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
