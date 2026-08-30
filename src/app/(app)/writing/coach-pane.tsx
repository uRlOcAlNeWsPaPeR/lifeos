"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { authedApi, ApiClientError } from "@/lib/client";
import { useAppData } from "@/lib/store/app-data";
import { wordCount } from "@/lib/writing/text-utils";
import { readFileText } from "@/lib/writing/file-upload";
import type { EssayCoachResult, EssayHighlight } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import { Panel, PanelTitle, Chip, Note, Spinner } from "./ui";

type HState = "pending" | "active" | "accepted" | "rejected";

export function CoachPane() {
  const { data } = useAppData();
  const [essay, setEssay] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [highlights, setHighlights] = useState<(EssayHighlight & { state: HState })[]>([]);
  const [workingEssay, setWorkingEssay] = useState("");
  const runningRef = useRef(false);

  const limit = data.limits.essayCoachPerWeek;
  const used = data.limits.essayCoachUsedThisWeek;
  const atLimit = limit != null && used >= limit;

  async function run() {
    const src = essay.trim();
    if (src.length < 40 || runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    try {
      const r = await authedApi<EssayCoachResult>("/api/writing/coach", {
        method: "POST",
        body: { essay: src },
      });
      setSummary(r.summary);
      setScores(r.scores);
      setWorkingEssay(src);
      setHighlights(r.highlights.map((h) => ({ ...h, state: "pending" as HState })));
      if (!r.highlights.length && r.engine === "heuristic") toast(r.summary, "info");
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.message : "Couldn't reach the coach.";
      toast(msg, "error");
    }
    setBusy(false);
    runningRef.current = false;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      setEssay(await readFileText(f));
    } catch (err) {
      toast(String((err as Error).message), "error");
    }
  }

  function focusHighlight(idx: number) {
    setHighlights((hs) =>
      hs.map((h, i) => ({
        ...h,
        state:
          h.state === "accepted" || h.state === "rejected"
            ? h.state
            : i === idx
              ? "active"
              : "pending",
      })),
    );
  }

  function applyRevision(idx: number, revIdx: number) {
    setHighlights((hs) => {
      const h = hs[idx];
      const pos = workingEssay.indexOf(h.quote);
      if (pos > -1) {
        setWorkingEssay(
          workingEssay.slice(0, pos) + h.revisions[revIdx] + workingEssay.slice(pos + h.quote.length),
        );
      }
      return hs.map((x, i) => (i === idx ? { ...x, state: "accepted" as HState } : x));
    });
    toast("Revision applied to the essay view.", "success");
  }

  function dismiss(idx: number) {
    setHighlights((hs) => hs.map((x, i) => (i === idx ? { ...x, state: "rejected" as HState } : x)));
  }

  const essayNodes = useMemo(() => {
    const text = workingEssay;
    const matches: { start: number; end: number; idx: number }[] = [];
    highlights.forEach((h, idx) => {
      if (h.state === "accepted" || h.state === "rejected") return;
      const pos = text.indexOf(h.quote);
      if (pos < 0) return;
      matches.push({ start: pos, end: pos + h.quote.length, idx });
    });
    matches.sort((a, b) => a.start - b.start);
    const out: React.ReactNode[] = [];
    let cursor = 0;
    matches.forEach((m, k) => {
      if (m.start < cursor) return;
      if (m.start > cursor) out.push(<span key={`t${k}`}>{text.slice(cursor, m.start)}</span>);
      out.push(
        <mark
          key={`h${k}`}
          onClick={() => focusHighlight(m.idx)}
          className={cn(
            "cursor-pointer rounded px-0.5",
            highlights[m.idx].state === "active"
              ? "bg-primary/35 text-foreground"
              : "bg-warning/20 text-foreground hover:bg-warning/30",
          )}
        >
          {text.slice(m.start, m.end)}
        </mark>,
      );
      cursor = m.end;
    });
    if (cursor < text.length) out.push(<span key="tail">{text.slice(cursor)}</span>);
    return out;
  }, [workingEssay, highlights]);

  const openCount = highlights.filter((h) => h.state !== "accepted" && h.state !== "rejected").length;
  const wc = wordCount(essay);
  const hasResult = summary !== "" || highlights.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <textarea
          value={essay}
          onChange={(e) => setEssay(e.target.value)}
          placeholder="Paste your essay here — the coach will highlight sentences worth revising, without rewriting anything for you."
          className="min-h-[200px] w-full resize-y rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-primary/40"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={run} disabled={busy || atLimit || wc < 8}>
            {busy ? <Spinner /> : null}
            {busy ? "Reading your essay…" : "Coach my essay"}
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <Upload className="h-3.5 w-3.5" />
            Upload file
            <input
              type="file"
              accept=".txt,.md,.markdown,.docx,.pdf"
              className="hidden"
              onChange={onFile}
            />
          </label>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {wc} words
            {limit != null && (
              <>
                {" · "}
                {Math.max(0, limit - used)} coach run{limit - used === 1 ? "" : "s"} left this week
              </>
            )}
          </span>
        </div>
        {atLimit && (
          <p className="mt-2 text-xs text-warning">
            You&rsquo;ve used your {limit} Essay Coach runs this week.{" "}
            <Link href="/settings" className="font-medium text-primary hover:underline">
              Upgrade to Student+
            </Link>{" "}
            for more.
          </p>
        )}
      </Panel>

      {!hasResult ? (
        <Panel className="flex min-h-[160px] items-center justify-center text-center text-sm text-muted-foreground">
          Paste an essay above and click <b className="mx-1 text-foreground">Coach my essay</b>. The
          coach highlights sentences worth revising — you decide what to change.
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <Panel>
            <PanelTitle>Your essay</PanelTitle>
            <p className="max-h-[520px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed scrollbar-thin">
              {essayNodes}
            </p>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel>
              <PanelTitle>Overview</PanelTitle>
              {Object.keys(scores).length > 0 && (
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {Object.entries(scores).map(([k, v]) => (
                    <Chip key={k}>
                      {k.charAt(0).toUpperCase() + k.slice(1)} <b className="ml-0.5">{v}</b>
                    </Chip>
                  ))}
                </div>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">{summary}</p>
            </Panel>

            <Panel>
              <PanelTitle>
                Suggestions{" "}
                <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground">
                  ({openCount} open)
                </span>
              </PanelTitle>
              <div className="space-y-2.5">
                {highlights.map((h, idx) => {
                  if (h.state === "accepted")
                    return (
                      <div
                        key={idx}
                        className="rounded-lg border-l-2 border-success/60 bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground"
                      >
                        {h.issue} — applied ✓
                      </div>
                    );
                  if (h.state === "rejected")
                    return (
                      <div
                        key={idx}
                        className="rounded-lg border-l-2 border-white/15 bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground"
                      >
                        {h.issue} — dismissed
                      </div>
                    );
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-lg border-l-2 bg-white/[0.02] p-3 text-xs",
                        h.state === "active" ? "border-primary" : "border-white/15",
                      )}
                    >
                      <p className="font-semibold text-foreground">{h.issue}</p>
                      {h.why && <p className="mt-1 text-muted-foreground">{h.why}</p>}
                      {h.revisions.map((rev, ri) => (
                        <div key={ri} className="mt-2 rounded-md border border-white/10 bg-white/[0.02] p-2">
                          <p className="text-foreground/85">{rev}</p>
                          <button
                            onClick={() => applyRevision(idx, ri)}
                            className="mt-1.5 rounded-md bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25"
                          >
                            Use this revision
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => dismiss(idx)}
                        className="mt-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        Dismiss
                      </button>
                    </div>
                  );
                })}
                {highlights.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No specific sentences were flagged.
                  </p>
                )}
              </div>
            </Panel>
          </div>
        </div>
      )}

      <Note title="The coach won't write it for you">
        Every suggestion is a prompt to think, not a fix to paste. It highlights sentences and offers
        revision options — applying one edits your working copy here so you can see the change, but
        the words you turn in should be yours.
      </Note>
    </div>
  );
}
