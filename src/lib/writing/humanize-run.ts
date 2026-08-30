"use client";

/**
 * Targeted rewriting: detect first, then rewrite ONLY the sections the detector
 * flagged and splice them back into the original text around the untouched
 * parts. Best-of-N against the live detector. Ported from Klarity's runHumanize.
 */
import { wordCount } from "./text-utils";
import { analyze } from "./detector-analyze";
import { analyzeLocal, scorePassage, ensureModels, MODEL_STATE } from "./detector-client";
import { humanize, diffTokens, type HumanizeOptions, type HumanizeStats, type DiffToken } from "./humanize";

export type HumanizeScope = "flagged" | "all";

export interface HumanizeRunResult {
  before: number;
  after: number;
  edits: number;
  totals: HumanizeStats;
  regions: number;
  untouchedPct: number;
  skippedShort: number;
  skippedMerged: number;
  modelsReady: boolean;
  diff: DiffToken[];
  text: string;
  /** true when nothing was flagged and the text was left completely alone. */
  untouched: boolean;
}

async function scoreCandidate(t: string): Promise<number> {
  try {
    await ensureModels();
    const s = await scorePassage(t);
    return Math.round(s.mean * 100);
  } catch {
    const h = analyze(t);
    return h ? h.pct : 100;
  }
}

export async function runHumanize(
  src: string,
  baseOpt: Omit<HumanizeOptions, "seed">,
  scope: HumanizeScope,
  seed: number,
  onStatus?: (msg: string) => void,
): Promise<HumanizeRunResult> {
  const strength = baseOpt.strength;

  let det = null;
  try {
    det = await analyzeLocal(src, onStatus);
  } catch {
    det = null;
  }

  const totalWords = wordCount(src);
  const before = det ? Math.round(det.docP * 100) : await scoreCandidate(src);

  const regions: { start: number; end: number; chunk: number }[] = [];
  let prevFlagged = false;
  let skippedShort = 0;
  let skippedMerged = 0;
  const seenSkip: Record<string, 1> = {};

  if (scope === "all") {
    regions.push({ start: 0, end: src.length, chunk: -1 });
  } else if (det) {
    for (let i = 0; i < det.items.length; i++) {
      const it = det.items[i];
      const wantsRewrite = it.p >= 0.5;
      const eligible = wantsRewrite && it.chunkIsolated === true;
      if (wantsRewrite && !eligible) {
        const key = "c" + it.chunkIndex;
        if (!seenSkip[key]) {
          seenSkip[key] = 1;
          if (it.chunkReliable === false) skippedShort++;
          else skippedMerged++;
        }
      }
      if (eligible) {
        const sameSection =
          prevFlagged &&
          regions.length > 0 &&
          regions[regions.length - 1].chunk === it.chunkIndex;
        if (sameSection) regions[regions.length - 1].end = it.end;
        else regions.push({ start: it.start, end: it.end, chunk: it.chunkIndex! });
      }
      prevFlagged = eligible;
    }
  } else {
    regions.push({ start: 0, end: src.length, chunk: -1 });
  }

  const totals: HumanizeStats = {
    vocab: 0, filler: 0, contract: 0, punct: 0, split: 0, merge: 0, trans: 0, casual: 0,
    passive: 0, openers: 0,
  };

  if (!regions.length) {
    return {
      before,
      after: before,
      edits: 0,
      totals,
      regions: 0,
      untouchedPct: 100,
      skippedShort,
      skippedMerged,
      modelsReady: MODEL_STATE.status === "ready",
      diff: [{ text: src, added: false }],
      text: src,
      untouched: true,
    };
  }

  const tries = MODEL_STATE.status === "ready" ? (strength === 3 ? 5 : 3) : 1;
  let totalEdits = 0;
  let rewrittenWords = 0;
  const pieces: string[] = [];

  for (let r = 0; r < regions.length; r++) {
    const regionText = src.slice(regions[r].start, regions[r].end);
    rewrittenWords += wordCount(regionText);
    let best: { text: string; edits: number; stats: HumanizeStats; score: number } | null = null;
    for (let i = 0; i < tries; i++) {
      const opt: HumanizeOptions = { ...baseOpt, seed: (seed + r * 104729 + i * 7919) >>> 0 };
      const cand = humanize(regionText, opt);
      onStatus?.(`Section ${r + 1} of ${regions.length}, variant ${i + 1} of ${tries}...`);
      const sc = await scoreCandidate(cand.text);
      if (!best || sc < best.score)
        best = { text: cand.text, edits: cand.edits, stats: cand.stats, score: sc };
      if (sc <= 5) break;
    }
    pieces.push(best!.text);
    totalEdits += best!.edits;
    for (const k in totals) totals[k as keyof HumanizeStats] += best!.stats[k as keyof HumanizeStats];
  }

  let outText = "";
  let prev = 0;
  for (let r = 0; r < regions.length; r++) {
    outText += src.slice(prev, regions[r].start);
    outText += pieces[r];
    prev = regions[r].end;
  }
  outText += src.slice(prev);

  let after = before;
  try {
    const post = await analyzeLocal(outText, () => {});
    if (post) after = Math.round(post.docP * 100);
  } catch {
    after = await scoreCandidate(outText);
  }

  const untouchedPct = totalWords > 0 ? Math.round((1 - rewrittenWords / totalWords) * 100) : 0;

  return {
    before,
    after,
    edits: totalEdits,
    totals,
    regions: regions.length,
    untouchedPct,
    skippedShort,
    skippedMerged,
    modelsReady: MODEL_STATE.status === "ready",
    diff: diffTokens(src, outText),
    text: outText,
    untouched: false,
  };
}
