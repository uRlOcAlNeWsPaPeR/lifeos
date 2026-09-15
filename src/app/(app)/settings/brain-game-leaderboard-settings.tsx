"use client";

import { useState } from "react";
import Link from "next/link";
import { Trophy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { confirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { useBrainGameLeaderboard } from "@/lib/brain-game-leaderboard";

/**
 * Settings → account controls for the Brain Game's weekly Competitive
 * leaderboard: change the name shown on the board, or drop off it entirely.
 * Nothing here affects Casual play — that never touches the leaderboard.
 */
export function BrainGameLeaderboardSettings() {
  const lb = useBrainGameLeaderboard();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (lb.loading) {
    return <p className="text-sm text-muted-foreground">Checking your leaderboard status…</p>;
  }

  if (!lb.own) {
    return (
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
          <Trophy className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium">Not on this week's board yet</p>
          <p className="text-sm text-muted-foreground">
            Play a{" "}
            <Link href="/brain-game" className="font-medium text-primary hover:underline">
              Competitive round
            </Link>{" "}
            in the Brain Game and choose to join when you finish.
          </p>
        </div>
      </div>
    );
  }

  function startEdit() {
    setName(lb.own!.name);
    setEditing(true);
  }

  async function saveName() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await lb.rename(name);
      setEditing(false);
      toast("Leaderboard name updated", "success");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const yes = await confirm({
      title: "Delete your leaderboard progress?",
      body: "Your entry and score for this week's Brain Game leaderboard are removed. You can rejoin any time by playing another Competitive round.",
      confirmLabel: "Delete progress",
      destructive: true,
    });
    if (!yes) return;
    setDeleting(true);
    try {
      await lb.deleteEntry();
      toast("Leaderboard progress deleted", "success");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <p className="flex items-center gap-2 font-medium">
              {lb.own.name}
              <Badge tone="success">On the board</Badge>
            </p>
            <p className="text-xs text-muted-foreground">Best this week: {lb.own.points} correct</p>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={40}
            className="max-w-xs"
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            autoFocus
          />
          <Button size="sm" onClick={saveName} loading={saving} disabled={!name.trim()}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="h-4 w-4" /> Change name
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} loading={deleting}>
            <Trash2 className="h-4 w-4" /> Delete my progress
          </Button>
        </div>
      )}
    </div>
  );
}
