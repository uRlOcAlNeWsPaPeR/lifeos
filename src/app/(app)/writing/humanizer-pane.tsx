"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { wordCount } from "@/lib/writing/text-utils";
import { runHumanize, type HumanizeScope, type HumanizeRunResult } from "@/lib/writing/humanize-run";
import { readFileText } from "@/lib/writing/file-upload";
import { Panel, PanelTitle, Chip, Segmented, Note, Spinner } from "./ui";

const TRANSFORMS: { key: keyof ToggleState; label: string; hint: string }[] = [
  { key: "vocab", label: "Swap AI vocabulary", hint: "delve, leverage, robust, pivotal → plain equivalents" },
  { key: "filler", label: "Cut filler phrases", hint: "“It is important to note that”, “In today's world”" },
  { key: "contract", label: "Add contractions", hint: "do not → don't, it is → it's" },
  { key: "punct", label: "Fix robotic punctuation", hint: "Removes em dashes and semicolon chains" },
  { key: "burst", label: "Vary sentence length", hint: "Splits long sentences, merges short ones" },
  { key: "trans", label: "Rewrite formal transitions", hint: "Furthermore → Also, However → But" },
  { key: "passive", label: "Convert passive to active", hint: "“was built by the team” → “the team built”" },
  { key: "openers", label: "Vary repeated openers", hint: "Breaks up “The X… The Y… The Z…” runs" },
  { key: "casual", label: "Add casual markers", hint: "Occasional “Honestly,” openers — adds words, review first" },
];

interface ToggleState {
  vocab: boolean;
  filler: boolean;
  contract: boolean;
  punct: boolean;
  burst: boolean;
  trans: boolean;
  passive: boolean;
  openers: boolean;
  casual: boolean;
}

const STRENGTH_NOTE: Record<number, string> = {
  1: "Light — conservative. Only the clearest AI vocabulary and punctuation tells are touched.",
  2: "Balanced — swaps AI vocabulary, fixes punctuation and varies sentence length while keeping the original tone.",
  3: "Aggressive — applies every enabled transformation. Rewrites read looser and more casual; check the output.",
};

export function HumanizerPane({
  incomingText,
  onConsumed,
  onRecheck,
}: {
  incomingText: string | null;
  onConsumed: () => void;
  onRecheck: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [scope, setScope] = useState<HumanizeScope>("flagged");
  const [strength, setStrength] = useState<1 | 2 | 3>(2);
  const [toggles, setToggles] = useState<ToggleState>({
    vocab: true, filler: true, contract: true, punct: true, burst: true, trans: true,
    passive: true, openers: true, casual: false,
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [res, setRes] = useState<HumanizeRunResult | null>(null);
  const seedRef = useRef(1337);
  const runningRef = useRef(false);

  useEffect(() => {
    if (incomingText != null) {
      setText(incomingText);
      onConsumed();
      seedRef.current = 1337;
      void go(incomingText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingText]);

  async function go(input?: string) {
    const src = (input ?? text).trim();
    if (!src || runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    setStatus("Finding flagged sections…");
    try {
      const r = await runHumanize(
        src,
        { strength, ...toggles },
        scope,
        seedRef.current,
        (m) => setStatus(m),
      );
      setRes(r);
    } catch (e) {
      toast(String((e as Error).message).slice(0, 160), "error");
    }
    setBusy(false);
    setStatus("");
    runningRef.current = false;
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
      <div className="flex flex-col gap-4">
        <Panel>
          <PanelTitle>Original text</PanelTitle>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the AI-sounding text you want rewritten."
            className="min-h-[220px] w-full resize-y rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-primary/40"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                seedRef.current = 1337;
                void go();
              }}
              disabled={busy || !text.trim()}
            >
              {busy ? <Spinner /> : null}
              {busy ? "Humanizing…" : "Humanize"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !text.trim()}
              onClick={() => {
                seedRef.current = Math.floor(Math.random() * 1e9);
                void go();
              }}
            >
              Re-roll
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Upload className="h-3.5 w-3.5" />
              Upload
              <input
                type="file"
                accept=".txt,.md,.markdown,.docx,.pdf"
                className="hidden"
                onChange={onFile}
              />
            </label>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">{wc} words</span>
          </div>
          {busy && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner />
              {status}
            </p>
          )}
        </Panel>

        {res && (
          <Panel>
            <PanelTitle>Humanized output</PanelTitle>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
                <p className="text-lg font-semibold text-destructive tabular-nums">{res.before}%</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Before</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
                <p
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    res.after >= 55
                      ? "text-destructive"
                      : res.after >= 30
                        ? "text-warning"
                        : "text-success",
                  )}
                >
                  {res.after}%
                </p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">After</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
                <p className="text-lg font-semibold tabular-nums">{res.edits}</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Edits</p>
              </div>
            </div>

            <p className="max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm leading-relaxed scrollbar-thin">
              {res.diff.map((t, i) =>
                t.added ? (
                  <mark key={i} className="rounded bg-primary/25 text-foreground">
                    {t.text}
                  </mark>
                ) : (
                  <span key={i}>{t.text}</span>
                ),
              )}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(res.text);
                  toast("Copied", "success");
                }}
              >
                Copy result
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRecheck(res.text)}>
                Re-check
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {res.untouched ? (
                <Chip tone="ok">No AI-flagged sections — your text was left untouched</Chip>
              ) : (
                <>
                  <Chip tone="ok">Sections rewritten {res.regions}</Chip>
                  <Chip tone="ok">Your text left untouched {res.untouchedPct}%</Chip>
                  {res.skippedShort > 0 && (
                    <Chip tone="bad">{res.skippedShort} too short to judge — left alone</Chip>
                  )}
                  {res.skippedMerged > 0 && (
                    <Chip tone="bad">
                      {res.skippedMerged} couldn&rsquo;t be isolated — left alone
                    </Chip>
                  )}
                  <Chip>Vocabulary {res.totals.vocab}</Chip>
                  <Chip>Filler cut {res.totals.filler}</Chip>
                  <Chip>Contractions {res.totals.contract}</Chip>
                  <Chip>Punctuation {res.totals.punct}</Chip>
                  <Chip>Split {res.totals.split}</Chip>
                  <Chip>Transitions {res.totals.trans}</Chip>
                  <Chip>Passive → active {res.totals.passive}</Chip>
                  {!res.modelsReady && (
                    <Chip tone="bad">Detector unavailable — rewrote everything</Chip>
                  )}
                </>
              )}
            </div>
          </Panel>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Panel>
          <PanelTitle>Rewrite scope</PanelTitle>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: "flagged", label: "Flagged only" },
              { value: "all", label: "Entire text" },
            ]}
          />
          <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
            {scope === "flagged" ? (
              <>
                <b className="text-foreground">Flagged only</b> — the detector runs first, and
                anything it reads as human is copied through unchanged.
              </>
            ) : (
              <>
                <b className="text-foreground">Entire text</b> — every sentence goes through the
                rewriter. Your original wording is not preserved anywhere. On one mixed document this
                made the score go <b>up</b> (69→97%): this detector was adversarially trained to catch
                mechanically-paraphrased text.
              </>
            )}
          </p>
        </Panel>

        <Panel>
          <PanelTitle>Rewrite strength</PanelTitle>
          <Segmented
            value={String(strength) as "1" | "2" | "3"}
            onChange={(v) => setStrength(Number(v) as 1 | 2 | 3)}
            options={[
              { value: "1", label: "Light" },
              { value: "2", label: "Balanced" },
              { value: "3", label: "Aggressive" },
            ]}
          />
          <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
            {STRENGTH_NOTE[strength]}
          </p>
        </Panel>

        <Panel>
          <PanelTitle>Transformations</PanelTitle>
          <div className="space-y-2">
            {TRANSFORMS.map((t) => (
              <label key={t.key} className="flex cursor-pointer items-start gap-2.5 text-xs">
                <input
                  type="checkbox"
                  checked={toggles[t.key]}
                  onChange={(e) => setToggles((s) => ({ ...s, [t.key]: e.target.checked }))}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                />
                <span>
                  <span className="font-medium text-foreground">{t.label}</span>
                  <span className="block text-muted-foreground">{t.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Panel>

        <Note title="What this actually does — and its real limit">
          Every transformation here is lexical, structural or punctuation-level — nothing is invented.
          Measured against the current detector, that moves the score by roughly <b>1 point</b>, not
          50. The model doing the scoring was trained with adversarial hard-negative mining
          specifically to resist this kind of surface rewriting. Read the output before using it, and
          remember that passing a detector is not the same as the text being yours.
        </Note>
      </div>
    </div>
  );
}
