"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { wordCount } from "@/lib/writing/text-utils";
import { analyze } from "@/lib/writing/detector-analyze";
import { analyzeLocal, subscribeModelState, type ModelState } from "@/lib/writing/detector-client";
import { CATEGORY_LABELS } from "@/lib/writing/detector-core";
import { MODELS } from "@/lib/writing/detector-worker-source";
import { DETECTOR_SAMPLE } from "@/lib/writing/sample";
import { readFileText } from "@/lib/writing/file-upload";
import type { DetectorResult } from "@/lib/writing/detector-types";
import { Panel, PanelTitle, Chip, MetricBar, Note, Spinner } from "./ui";

const CATEGORY_NOTE: Record<string, string> = {
  insufficient:
    "There isn't enough text here for a reliable estimate of any kind — length matters more than any other factor for short documents.",
  likely_human:
    "Statistical and (where available) model-based signals both fall solidly in the human range.",
  probably_human:
    "Signals lean human overall, though a few passages or measures are less clear.",
  uncertain:
    "The evidence is mixed or the signals disagree with each other — this genuinely could go either way.",
  probably_ai: "Signals lean AI-typical overall, though not with full confidence.",
  likely_ai:
    "Statistical and model-based signals both sit well above the human range across most of the document.",
};

const PILL_TONE: Record<string, string> = {
  insufficient: "border-warning/40 bg-warning/10 text-warning",
  likely_human: "border-success/40 bg-success/10 text-success",
  probably_human: "border-success/40 bg-success/10 text-success",
  uncertain: "border-warning/40 bg-warning/10 text-warning",
  probably_ai: "border-destructive/40 bg-destructive/10 text-destructive",
  likely_ai: "border-destructive/40 bg-destructive/10 text-destructive",
};

function ringColor(cat: string) {
  if (cat === "likely_human" || cat === "probably_human") return "hsl(var(--success))";
  if (cat === "probably_ai" || cat === "likely_ai") return "hsl(var(--destructive))";
  return "hsl(var(--warning))";
}

export function DetectorPane({
  incomingText,
  onConsumed,
  onHumanize,
}: {
  incomingText: string | null;
  onConsumed: () => void;
  onHumanize: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<DetectorResult | null>(null);
  const [modelState, setModelState] = useState<ModelState>({ status: "idle", msg: "" });
  const runningRef = useRef(false);

  useEffect(() => subscribeModelState(setModelState), []);

  useEffect(() => {
    if (incomingText != null) {
      setText(incomingText);
      onConsumed();
      void runScan(incomingText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingText]);

  async function runScan(input?: string) {
    const src = (input ?? text).trim();
    if (!src || runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    setStatus("Starting…");
    setResult(null);
    let r: DetectorResult | null = null;
    try {
      r = await analyzeLocal(src, (m) => setStatus(m));
    } catch (e) {
      toast(
        "Detector models unavailable — showing the weaker offline estimate. " +
          String((e as Error).message).slice(0, 120),
        "error",
      );
      r = analyze(src);
    }
    setBusy(false);
    runningRef.current = false;
    setStatus("");
    if (r) setResult(r);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      setText(await readFileText(f));
    } catch (err) {
      toast(String((err as Error).message), "error");
    }
  }

  const wc = wordCount(text);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      {/* left: input + segment report */}
      <div className="flex flex-col gap-4">
        <Panel>
          <PanelTitle>Text to analyze</PanelTitle>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste an essay, article or paragraph here — or upload a .txt, .docx or .pdf file. 300+ words gives the most reliable score."
            className="min-h-[220px] w-full resize-y rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-primary/40"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => runScan()} disabled={busy || !text.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? "Analyzing…" : "Analyze text"}
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
            <button
              type="button"
              onClick={() => setText(DETECTOR_SAMPLE)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Load sample
            </button>
            <button
              type="button"
              onClick={() => {
                setText("");
                setResult(null);
              }}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">{wc} words</span>
          </div>
          {(busy || modelState.status === "loading") && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner />
              {status || modelState.msg || "Loading detector models (one-time ~277 MB download)…"}
            </p>
          )}
        </Panel>

        {result && result.items.length > 0 && (
          <Panel>
            <PanelTitle>Segment report</PanelTitle>
            <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <i className="h-2.5 w-2.5 rounded-sm bg-destructive/70" /> AI-generated
              </span>
              <span className="flex items-center gap-1">
                <i className="h-2.5 w-2.5 rounded-sm bg-warning/70" /> AI + paraphrased
              </span>
              <span className="flex items-center gap-1">
                <i className="h-2.5 w-2.5 rounded-sm bg-white/15" /> Human-written
              </span>
            </div>
            <p className="max-h-[380px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed scrollbar-thin">
              <SegmentText text={text} result={result} />
            </p>
          </Panel>
        )}
      </div>

      {/* right: result */}
      <div className="flex flex-col gap-4">
        {!result ? (
          <Panel className="flex min-h-[220px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
            {busy ? (
              <span className="flex items-center gap-2">
                <Spinner />
                {status || "Analyzing…"}
              </span>
            ) : (
              "Run an analysis to see the breakdown."
            )}
          </Panel>
        ) : (
          <ResultView result={result} onHumanize={() => onHumanize(text)} />
        )}

        <Note title="Not proof of anything" strong>
          AI-writing detection is probabilistic. It can be wrong in both directions — flagging
          genuine human writing (especially formal, well-edited, or ESL writing) and missing AI text
          that&rsquo;s been lightly edited. Treat this report as one input to a conversation, never as
          a verdict on its own.
        </Note>
      </div>
    </div>
  );
}

function SegmentText({ text, result }: { text: string; result: DetectorResult }) {
  const out: React.ReactNode[] = [];
  let prev = 0;
  result.items.forEach((it, i) => {
    if (it.start > prev) out.push(<span key={`g${i}`}>{text.slice(prev, it.start)}</span>);
    const flagged = it.p >= 0.5;
    out.push(
      <span
        key={`s${i}`}
        title={`${Math.round(it.p * 100)}% AI — ${it.reasons.slice(0, 3).join("; ")}`}
        className={cn(
          "rounded-sm",
          flagged && (it.para ? "bg-warning/20" : "bg-destructive/20"),
        )}
      >
        {text.slice(it.start, it.end)}
      </span>,
    );
    prev = it.end;
  });
  if (prev < text.length) out.push(<span key="tail">{text.slice(prev)}</span>);
  return <>{out}</>;
}

function ResultView({
  result,
  onHumanize,
}: {
  result: DetectorResult;
  onHumanize: () => void;
}) {
  const cat = result.combined.category;
  const conf = result.combined.confidence;
  const local = result.engine === "local";
  const C = 2 * Math.PI * 52;

  const bars = local
    ? [
        { label: "Combined AI probability", value: result.docP },
        { label: MODELS[0].name, value: result.perModel?.[0] ?? 0 },
        { label: MODELS[1].name, value: result.perModel?.[1] ?? 0 },
        { label: "Human-range signal", value: 1 - result.docP, tone: "success" as const },
      ]
    : [
        { label: "Predictability (weak proxy)", value: result.perp },
        { label: "Uniformity (low burstiness)", value: result.burst },
        { label: "AI phrasing & structure", value: result.pat },
        { label: "Human signals", value: result.human, tone: "success" as const },
      ];

  return (
    <>
      <Panel>
        <div className="flex items-center gap-5">
          <div className="relative h-[112px] w-[112px] shrink-0">
            <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
              <circle cx="56" cy="56" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
              <circle
                cx="56"
                cy="56"
                r="52"
                fill="none"
                stroke={ringColor(cat)}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - result.pct / 100)}
                style={{ transition: "stroke-dashoffset .7s cubic-bezier(.4,0,.2,1)" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums">{result.pct}%</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">AI</span>
            </div>
          </div>
          <div className="min-w-0">
            <span
              className={cn(
                "inline-block rounded-full border px-2.5 py-1 text-xs font-medium",
                PILL_TONE[cat],
              )}
            >
              {CATEGORY_LABELS[cat]}
            </span>
            {local && (
              <span className="ml-2 text-[11px] text-muted-foreground">Confidence: {conf}%</span>
            )}
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {CATEGORY_NOTE[cat]}
              {!local &&
                " This ran on the offline statistical fallback (no internet access to the primary transformer models) — treat it as a weaker signal."}
            </p>
          </div>
        </div>

        <div className="mt-4">
          {bars.map((b) => (
            <MetricBar key={b.label} label={b.label} value={b.value} tone={b.tone} />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip>Words {result.total}</Chip>
          <Chip>Segments {result.segments}</Chip>
          <Chip>Flagged {result.flagged}</Chip>
          {local ? (
            <>
              <Chip>Document score {Math.round(result.docP * 100)}%</Chip>
              <Chip>Statistical layer {Math.round(result.combined.componentScores.statistical * 100)}%</Chip>
              <Chip>Stylometric layer {Math.round(result.combined.componentScores.stylometric * 100)}%</Chip>
              <Chip tone="ok">Runs locally · no upload</Chip>
            </>
          ) : (
            <>
              {result.cv != null && <Chip>Burstiness CV {result.cv.toFixed(2)}</Chip>}
              {result.surp != null && <Chip>Avg surprisal {result.surp.toFixed(2)}</Chip>}
              <Chip tone="bad">Heuristic engine — unreliable</Chip>
            </>
          )}
        </div>

        <Button size="sm" variant="outline" className="mt-4 w-full" onClick={onHumanize}>
          Humanize this text
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </Panel>

      {(result.primarySignals.length > 0 || result.limitations.length > 0) && (
        <Panel>
          <PanelTitle>Why this result</PanelTitle>
          <p className="mb-1 text-[11px] font-semibold text-foreground/80">Primary signals</p>
          <ul className="mb-3 list-disc space-y-1 pl-4 text-xs text-muted-foreground marker:text-primary/60">
            {result.primarySignals.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <p className="mb-1 text-[11px] font-semibold text-foreground/80">Limitations</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground marker:text-warning/60">
            {result.limitations.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Panel>
      )}

      {result.paragraphReport.length > 1 && (
        <Panel>
          <PanelTitle>Paragraph-level analysis</PanelTitle>
          <div className="space-y-2">
            {result.paragraphReport.map((p) => (
              <div key={p.index} className="flex items-start gap-2.5 text-xs">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    p.category === "high" && "bg-destructive/15 text-destructive",
                    p.category === "uncertain" && "bg-warning/15 text-warning",
                    p.category === "low" && "bg-success/15 text-success",
                  )}
                >
                  {p.category === "high"
                    ? "High AI signal"
                    : p.category === "low"
                      ? "Low AI signal"
                      : "Uncertain"}
                </span>
                <div className="min-w-0">
                  <p className="text-muted-foreground">
                    Paragraph {p.index} · {p.words} words
                    {!p.reliable && " — too short to score alone"}
                    {p.merged && " (grouped with adjacent paragraph)"}
                  </p>
                  <p className="truncate text-foreground/70">{p.preview}…</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
