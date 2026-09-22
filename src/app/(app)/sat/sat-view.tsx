"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, RotateCw } from "lucide-react";

// ScoreClimb is its own standalone app (static site, own storage, own weekly
// College Board question sync) — this just frames it inside LifeOS. Nothing
// about ScoreClimb's deploy or sync routine changes; this page only embeds it.
const SCORECLIMB_URL = "https://singular-klepon-be59b4.netlify.app/";

export function SatView() {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-[600px] flex-col gap-4 sm:h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Back to LifeOS"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">SAT Prep</h1>
            <p className="text-xs text-muted-foreground">Powered by ScoreClimb</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            aria-label="Reload SAT Prep"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <a
            href={SCORECLIMB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            Open in new tab
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="card-surface min-h-0 flex-1 overflow-hidden">
        <iframe
          key={reloadKey}
          src={SCORECLIMB_URL}
          title="ScoreClimb — SAT Prep"
          className="h-full w-full border-0"
          allow="clipboard-write"
        />
      </div>
    </div>
  );
}
