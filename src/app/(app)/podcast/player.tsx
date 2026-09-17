"use client";

import { useEffect, useRef } from "react";
import { Pause, Play, SkipBack, SkipForward, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { usePodcastPlayer } from "@/lib/podcast/speech";
import { formatDuration } from "@/lib/podcast/script";
import type { PodcastDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const RATES = [0.75, 1, 1.25, 1.5] as const;

/**
 * Playback plus a follow-along transcript. The line being spoken is
 * highlighted and scrolled into view, which is what makes an episode usable
 * for revision rather than just background noise.
 */
export function EpisodePlayer({
  episode,
  onPlayed,
}: {
  episode: PodcastDTO;
  onPlayed: () => void;
}) {
  const player = usePodcastPlayer(episode.segments, episode.voices);
  const transcriptRef = useRef<HTMLDivElement>(null);
  // A play is counted once per episode per mount, not once per segment.
  const counted = useRef(false);

  const currentSegment = player.current;
  useEffect(() => {
    transcriptRef.current
      ?.querySelector(`[data-seg="${currentSegment}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentSegment]);

  function start() {
    if (!counted.current) {
      counted.current = true;
      onPlayed();
    }
    player.play(0);
  }

  if (!player.supported) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm text-muted-foreground">
          This browser can&apos;t speak episodes aloud. The transcript below is the full episode —
          Chrome, Edge and Safari can all play it.
        </p>
        <Transcript episode={episode} current={-1} innerRef={transcriptRef} />
      </div>
    );
  }

  const playing = player.playing;
  const stopped = player.current < 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center gap-2">
          {stopped && !player.paused ? (
            <Button onClick={start}>
              <Play className="h-4 w-4" />
              Play episode
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => player.skip(-1)} aria-label="Previous segment">
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button onClick={() => (playing ? player.pause() : player.resume())}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {playing ? "Pause" : "Resume"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => player.skip(1)} aria-label="Next segment">
                <SkipForward className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={player.stop} aria-label="Stop">
                <Square className="h-4 w-4" />
              </Button>
            </>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Volume2 className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
            {RATES.map((r) => (
              <button
                key={r}
                onClick={() => player.setRate(r)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  player.rate === r
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r}×
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Progress value={player.progress * 100} className="flex-1" />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {stopped
              ? formatDuration(episode.estimatedSeconds)
              : `${player.current + 1} / ${episode.segments.length}`}
          </span>
        </div>
      </div>

      <Transcript episode={episode} current={player.current} innerRef={transcriptRef} />
    </div>
  );
}

function Transcript({
  episode,
  current,
  innerRef,
}: {
  episode: PodcastDTO;
  current: number;
  innerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const duo = episode.format === "duo";
  return (
    <div ref={innerRef} className="max-h-[420px] space-y-3 overflow-y-auto scrollbar-thin pr-1">
      {episode.segments.map((s, i) => (
        <div
          key={i}
          data-seg={i}
          className={cn(
            "rounded-xl border p-3 transition-colors",
            i === current
              ? "border-primary/40 bg-primary/[0.08]"
              : "border-transparent bg-white/[0.02]",
          )}
        >
          {duo && (
            <span
              className={cn(
                "mb-1 block text-[11px] font-medium uppercase tracking-wide",
                s.speaker === "cohost" ? "text-sky-400" : "text-primary",
              )}
            >
              {s.speaker === "cohost" ? "Co-host" : "Host"}
            </span>
          )}
          <p
            className={cn(
              "text-sm leading-relaxed",
              i === current ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {s.text}
          </p>
        </div>
      ))}
    </div>
  );
}
