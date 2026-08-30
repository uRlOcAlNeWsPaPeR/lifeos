"use client";

/**
 * Browser-side orchestration for the AI detector: spins up the worker, loads
 * the models on first use, scores passages, and assembles the full
 * document-level report (`analyzeLocal`). Ported from Klarity.
 *
 * The transformer path is a stronger signal than the offline `analyze()` in
 * detector-analyze.ts — but it needs a one-time ~277 MB model download.
 */
import {
  clamp,
  mean,
  words,
  wordCount,
  splitSentences,
  splitParagraphs,
  stripMarkdownForScoring,
  CHUNK_CHARS,
  MAX_CHUNKS,
  MIN_CHUNK_WORDS,
} from "./text-utils";
import { sig, combineSignals } from "./detector-core";
import {
  chunkForAnalysis,
  computeStatStyloSignals,
  computeParagraphReport,
} from "./detector-analyze";
import { MODELS, workerSource, type DetectorModel } from "./detector-worker-source";
import type { DetectorResult, SegmentItem } from "./detector-types";

export type ModelStatus = "idle" | "loading" | "ready" | "error";
export interface ModelState {
  status: ModelStatus;
  msg: string;
}

const listeners = new Set<(s: ModelState) => void>();
export const MODEL_STATE: ModelState = { status: "idle", msg: "" };

function emit() {
  listeners.forEach((fn) => fn({ ...MODEL_STATE }));
}
export function subscribeModelState(fn: (s: ModelState) => void): () => void {
  listeners.add(fn);
  fn({ ...MODEL_STATE });
  return () => listeners.delete(fn);
}
function setStatus(msg: string) {
  MODEL_STATE.msg = msg;
  emit();
}

type Job = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (done: number, total: number) => void;
};

interface DetectorWorker extends Worker {
  onStatus?: ((msg: string) => void) | null;
}

let WORKER: DetectorWorker | null = null;
let WORKER_SEQ = 0;
const WORKER_JOBS: Record<number, Job> = {};
let MODEL_PROMISE: Promise<boolean> | null = null;

function spawnWorker(): DetectorWorker {
  const url = URL.createObjectURL(new Blob([workerSource()], { type: "text/javascript" }));
  const w = new Worker(url, { type: "module" }) as DetectorWorker;
  w.onmessage = (ev: MessageEvent) => {
    const d = ev.data;
    const job = WORKER_JOBS[d.id];
    if (d.type === "status") {
      WORKER?.onStatus?.(d.msg);
      return;
    }
    if (d.type === "progress") {
      job?.onProgress?.(d.done, d.total);
      return;
    }
    if (d.type === "ready") {
      if (job) {
        delete WORKER_JOBS[d.id];
        job.resolve(true);
      }
      return;
    }
    if (d.type === "scored") {
      if (job) {
        delete WORKER_JOBS[d.id];
        job.resolve(d.out);
      }
      return;
    }
    if (d.type === "error") {
      if (job) {
        delete WORKER_JOBS[d.id];
        job.reject(new Error(d.err));
      } else {
        MODEL_STATE.status = "error";
        setStatus(d.err);
      }
      return;
    }
  };
  w.onerror = (ev: ErrorEvent) => {
    const msg = "Worker failed: " + (ev.message || "unknown");
    Object.keys(WORKER_JOBS).forEach((k) => {
      WORKER_JOBS[+k].reject(new Error(msg));
      delete WORKER_JOBS[+k];
    });
    MODEL_STATE.status = "error";
    setStatus(msg);
  };
  return w;
}

function workerSend(
  msg: Record<string, unknown>,
  onProgress?: (done: number, total: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++WORKER_SEQ;
    WORKER_JOBS[id] = { resolve, reject, onProgress };
    msg.id = id;
    WORKER!.postMessage(msg);
  });
}

export function ensureModels(onStatus?: (msg: string) => void): Promise<boolean> {
  if (MODEL_STATE.status === "ready") return Promise.resolve(true);
  if (MODEL_PROMISE) return MODEL_PROMISE;
  MODEL_STATE.status = "loading";
  emit();
  MODEL_PROMISE = (async () => {
    try {
      if (onStatus) onStatus("Starting detector...");
      setStatus("Starting detector...");
      WORKER = spawnWorker();
      WORKER.onStatus = (m: string) => {
        setStatus(m);
        onStatus?.(m);
      };
      await workerSend({ cmd: "load", ids: MODELS.map((m) => m.id) });
      MODEL_STATE.status = "ready";
      setStatus("Models ready");
      return true;
    } catch (e) {
      MODEL_STATE.status = "error";
      setStatus(String((e as Error).message || e).slice(0, 220));
      MODEL_PROMISE = null;
      WORKER = null;
      throw e;
    }
  })();
  return MODEL_PROMISE;
}

function recentre(model: DetectorModel, p: number): number {
  return model.hot ? sig((p - 0.72) / 0.07) : p;
}

export async function scoreMany(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ per: number[]; mean: number }[]> {
  if (!texts.length) return [];
  await ensureModels();
  const raw = (await workerSend({ cmd: "score", texts }, onProgress)) as number[][];
  const totalW = MODELS.reduce((a, m) => a + m.weight, 0);
  return raw.map((per) => {
    const adj = per.map((p, i) => recentre(MODELS[i], p));
    let blended = 0;
    for (let i = 0; i < adj.length; i++) blended += adj[i] * MODELS[i].weight;
    blended /= totalW;
    return { per: adj, mean: blended };
  });
}

export async function scorePassage(txt: string): Promise<{ per: number[]; mean: number }> {
  const r = await scoreMany([txt]);
  return r[0];
}

export async function analyzeLocal(
  text: string,
  onStatus?: (msg: string) => void,
): Promise<DetectorResult | null> {
  await ensureModels(onStatus);
  if (onStatus && WORKER) WORKER.onStatus = (m) => onStatus(m);

  const segs = splitSentences(text);
  const items: SegmentItem[] = [];
  for (let i = 0; i < segs.length; i++) {
    const raw = text.slice(segs[i].start, segs[i].end);
    if (!wordCount(raw)) continue;
    items.push({
      start: segs[i].start,
      end: segs[i].end,
      raw,
      n: wordCount(raw),
      p: 0,
      para: false,
      reasons: [],
    });
  }
  if (!items.length) return null;

  const chunkChars = Math.max(CHUNK_CHARS, Math.ceil(text.length / MAX_CHUNKS));
  const chunks = chunkForAnalysis(text, chunkChars).filter((c) =>
    text.slice(c.start, c.end).trim(),
  );
  const chunkTexts = chunks.map((c) => stripMarkdownForScoring(text.slice(c.start, c.end)));

  if (onStatus)
    onStatus(`Scoring ${chunks.length} passage${chunks.length === 1 ? "" : "s"}...`);
  const scores = await scoreMany(chunkTexts, (done, tot) => {
    if (onStatus) onStatus(`Scoring passage ${done} of ${tot}...`);
  });

  const w = chunkTexts.map((t) => wordCount(t));
  const tot = w.reduce((a, b) => a + b, 0) || 1;
  let docP = 0;
  const dPer0: number[] = [];
  const dPer1: number[] = [];
  const chunkPs: number[] = [];
  const chunkReliableFlags: boolean[] = [];
  const chunkParaCounts: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    docP += (scores[i].mean * w[i]) / tot;
    dPer0.push(scores[i].per[0]);
    dPer1.push(scores[i].per[1]);
    chunkPs.push(clamp(scores[i].mean, 0.01, 0.99));
    chunkReliableFlags.push(w[i] >= MIN_CHUNK_WORDS);
    chunkParaCounts.push(chunks[i].paras || 1);
  }
  const modelGap = mean(dPer0.map((p0, idx) => Math.abs(p0 - dPer1[idx])));
  const modelsAgree = clamp(1 - modelGap / 0.5, 0, 1);
  const reliableChunkFraction = chunkReliableFlags.length
    ? chunkReliableFlags.filter(Boolean).length / chunkReliableFlags.length
    : 0;

  let ci = 0;
  const total = wordCount(text);
  let flagged = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    while (ci < chunks.length - 1 && it.start >= chunks[ci].end) ci++;
    const s = scores[ci];
    it.p = clamp(s.mean, 0.01, 0.99);
    it.chunkWords = w[ci];
    it.chunkIndex = ci;
    it.chunkParas = chunks[ci].paras || 1;
    it.chunkReliable = w[ci] >= MIN_CHUNK_WORDS;
    it.chunkIsolated = it.chunkReliable && it.chunkParas === 1;
    it.reasons = [
      MODELS[0].name + ": " + Math.round(s.per[0] * 100) + "% AI",
      MODELS[1].name + ": " + Math.round(s.per[1] * 100) + "% AI",
    ];
    if (!it.chunkReliable)
      it.reasons.push("section is only " + w[ci] + " words — too short to score reliably");
    else if (it.chunkParas > 1)
      it.reasons.push(
        "scored together with " +
          (it.chunkParas - 1) +
          " adjacent paragraph" +
          (it.chunkParas > 2 ? "s" : "") +
          " — too short to score alone",
      );
    if (Math.abs(s.per[0] - s.per[1]) > 0.4)
      it.reasons.push("models disagree — treat with caution");
    it.para = Math.abs(s.per[0] - s.per[1]) > 0.4 && it.p >= 0.5;
    if (it.p >= 0.5) flagged++;
  }

  const allWords = words(text);
  const sentenceLens = items.map((it) => it.n);
  const paragraphs = splitParagraphs(text);
  const openers: Record<string, number> = {};
  items.forEach((it) => {
    const op = words(it.raw)[0];
    if (op) openers[op] = (openers[op] || 0) + 1;
  });
  const sig2 = computeStatStyloSignals(text, allWords, sentenceLens, paragraphs, openers);

  const combined = combineSignals(docP, sig2.statisticalP, sig2.stylometricP, {
    wordCount: total,
    modelsAgree,
    chunkReliableFraction: reliableChunkFraction,
  });

  const paragraphReport = computeParagraphReport(
    text,
    chunks,
    chunkPs,
    chunkReliableFlags,
    chunkParaCounts,
  );

  const primarySignals: string[] = [];
  const limitations: string[] = [];
  if (docP >= 0.6)
    primarySignals.push(
      `Transformer classifiers read most passages as AI-typical (${Math.round(docP * 100)}% average)`,
    );
  if (docP < 0.4)
    primarySignals.push(
      `Transformer classifiers read most passages as human-typical (${Math.round((1 - docP) * 100)}% human-range)`,
    );
  if (sig2.detail.burst.uniformity > 0.6)
    primarySignals.push("Sentence lengths are unusually uniform (low burstiness)");
  if (sig2.detail.burst.uniformity < 0.3)
    primarySignals.push("Sentence lengths vary naturally (human-typical burstiness)");
  if (sig2.detail.vocab.diversityDeficit > 0.55)
    primarySignals.push("Vocabulary is more repetitive than typical writing");
  if (sig2.detail.rep.score > 0.4)
    primarySignals.push("Noticeable reuse of the same short phrases");
  if (sig2.detail.fw.reliable && sig2.detail.fw.score > 0.5)
    primarySignals.push("Function-word usage is unusually even/predictable");
  if (sig2.detail.discourse.reliable && sig2.detail.discourse.score > 0.4)
    primarySignals.push("Heavy, mechanical use of transition words at paragraph starts");
  if (sig2.detail.md.score > 0.4)
    primarySignals.push(
      'Heavy use of bolded lead-in terms and headers — a common AI "listicle" structuring pattern',
    );
  if (!primarySignals.length)
    primarySignals.push("No single signal dominates — this is a blend of small effects");

  if (combined.wordCountTier !== "standard")
    limitations.push("Document is on the short side, which lowers confidence for any detector");
  if (modelGap > 0.3)
    limitations.push("The two transformer models disagree with each other on parts of this text");
  if (paragraphs.length < 2)
    limitations.push("Single paragraph — no cross-paragraph consistency check was possible");
  if (reliableChunkFraction < 1)
    limitations.push(
      "One or more sections were too short to score independently and were grouped with neighbors",
    );
  limitations.push(
    "This is a statistical estimate, not proof of AI use — treat it as one input among several",
  );

  return {
    engine: "local",
    items,
    total,
    segments: items.length,
    flagged,
    pct: Math.round(combined.probability * 100),
    docP,
    perModel: [mean(dPer0), mean(dPer1)],
    windows: chunks.length,
    perp: clamp(docP, 0, 1),
    burst: clamp(docP, 0, 1),
    pat: clamp(mean(dPer0), 0, 1),
    human: clamp(1 - docP, 0, 1),
    reliable: total >= 200,
    combined,
    paragraphReport,
    primarySignals,
    limitations,
  };
}
