/**
 * Offline statistical detector (`analyze`) + the shared multi-signal
 * combination helpers + paragraph-aware chunking. Ported verbatim from Klarity.
 *
 * `analyze()` is the instant, no-network fallback: shown immediately and used
 * when the transformer models can't load. It is a WEAKER signal than the
 * transformer path (`analyzeLocal` in detector-client.ts).
 */
import {
  clamp,
  sig,
  mean,
  sd,
  words,
  wordCount,
  splitSentences,
  splitParagraphs,
  splitParagraphSpans,
  surprisal,
  syllables,
  freqRankOf,
  type Span,
} from "./text-utils";
import {
  burstiness,
  vocabDiversity,
  selfRepetition,
  functionWordProfile,
  openerRepetition,
  discourseMarkerDensity,
  markdownListicleDensity,
  combineSignals,
} from "./detector-core";
import {
  aiLexScore,
  humanScore,
  hedgeRate,
  specificityRate,
  FORMAL_OPENERS,
} from "./detector-lex";
import type { DetectorResult, SegmentItem, ParagraphReportRow } from "./detector-types";

/* ---------- chunking ---------- */
export function chunkBySentence(text: string, maxChars: number): Span[] {
  const segs = splitSentences(text);
  const chunks: Span[] = [];
  let cur = 0;
  if (!segs.length) return text.trim() ? [{ start: 0, end: text.length }] : [];
  for (let i = 0; i < segs.length; i++) {
    const end = i + 1 < segs.length ? segs[i + 1].start : text.length;
    if (end - cur > maxChars && end > cur) {
      chunks.push({ start: cur, end: segs[i].end });
      cur = segs[i].end;
    }
  }
  if (cur < text.length) chunks.push({ start: cur, end: text.length });
  return chunks;
}

export interface AnalysisChunk {
  start: number;
  end: number;
  paras: number;
}

export function chunkForAnalysis(text: string, maxChars: number): AnalysisChunk[] {
  const MIN_CHUNK_WORDS = 120;
  const paras = splitParagraphSpans(text);
  if (!paras.length) return [];

  const wc = (c: { start: number; end: number }) => wordCount(text.slice(c.start, c.end));

  const merged: AnalysisChunk[] = [];
  let cur: AnalysisChunk = { start: paras[0].start, end: paras[0].end, paras: 1 };
  for (let i = 1; i < paras.length; i++) {
    if (wc(cur) < MIN_CHUNK_WORDS) {
      cur.end = paras[i].end;
      cur.paras++;
    } else {
      merged.push(cur);
      cur = { start: paras[i].start, end: paras[i].end, paras: 1 };
    }
  }
  merged.push(cur);

  while (merged.length > 1 && wc(merged[merged.length - 1]) < 40) {
    const runt = merged.pop()!;
    merged[merged.length - 1].end = runt.end;
    merged[merged.length - 1].paras += runt.paras;
  }

  const final: AnalysisChunk[] = [];
  merged.forEach((c) => {
    if (c.end - c.start > maxChars * 1.5) {
      const subs: AnalysisChunk[] = [];
      chunkBySentence(text.slice(c.start, c.end), maxChars).forEach((s) => {
        subs.push({ start: c.start + s.start, end: c.start + s.end, paras: 1 });
      });
      while (subs.length > 1 && wc(subs[subs.length - 1]) < MIN_CHUNK_WORDS) {
        const t = subs.pop()!;
        subs[subs.length - 1].end = t.end;
      }
      subs.forEach((x) => final.push(x));
    } else final.push(c);
  });
  return final;
}

/* ---------- shared multi-signal combination inputs ---------- */
export function computeStatStyloSignals(
  text: string,
  allWords: string[],
  sentenceLens: number[],
  paragraphs: string[],
  openers: Record<string, number>,
) {
  const burst = burstiness(sentenceLens);
  const vocab = vocabDiversity(allWords);
  const rep = selfRepetition(allWords);
  const docSurp = surprisal(allWords);
  const uElev = clamp((docSurp - 7.4) / 1.3, 0, 1);

  const statisticalP = clamp(
    0.34 * burst.uniformity + 0.24 * vocab.diversityDeficit + 0.22 * rep.score + 0.2 * uElev,
    0,
    1,
  );

  const fw = functionWordProfile(allWords);
  const openerStat = openerRepetition(openers);
  const discourse = discourseMarkerDensity(paragraphs);
  const md = markdownListicleDensity(text, allWords.length);
  const stylometricP = clamp(
    0.42 * fw.score + 0.25 * openerStat.score + 0.18 * discourse.score + 0.15 * md.score,
    0,
    1,
  );

  return {
    statisticalP,
    stylometricP,
    detail: { burst, vocab, rep, uElev, fw, openerStat, discourse, md, docSurp },
  };
}

export function computeParagraphReport(
  text: string,
  chunks: { start: number; end: number }[],
  chunkPs: number[],
  chunkReliableFlags: boolean[],
  chunkParaCounts: number[],
): ParagraphReportRow[] {
  const spans = splitParagraphSpans(text);
  const out: ParagraphReportRow[] = [];
  let ci = 0;
  for (let i = 0; i < spans.length; i++) {
    while (ci < chunks.length - 1 && spans[i].start >= chunks[ci].end) ci++;
    const p = chunkPs[ci];
    const reliable = chunkReliableFlags[ci];
    const merged = chunkParaCounts[ci] > 1;
    const cat: ParagraphReportRow["category"] = !reliable
      ? "uncertain"
      : p >= 0.65
        ? "high"
        : p >= 0.35
          ? "uncertain"
          : "low";
    out.push({
      index: i + 1,
      words: wordCount(text.slice(spans[i].start, spans[i].end)),
      probability: p,
      category: cat,
      reliable,
      merged,
      preview: text.slice(spans[i].start, spans[i].end).trim().slice(0, 90),
    });
  }
  return out;
}

/* ---------- offline analyze() ---------- */
interface RawItem {
  start: number;
  end: number;
  raw: string;
  lower: string;
  ws: string[];
  n: number;
  opener: string;
}

export function analyze(text: string): DetectorResult | null {
  const segs = splitSentences(text);
  const allW = words(text);
  const total = allW.length;

  const items: RawItem[] = [];
  const lens: number[] = [];
  const openers: Record<string, number> = {};
  for (let i = 0; i < segs.length; i++) {
    const raw = text.slice(segs[i].start, segs[i].end);
    const lower = raw.toLowerCase();
    const ws = words(raw);
    if (!ws.length) continue;
    lens.push(ws.length);
    const op = ws[0];
    openers[op] = (openers[op] || 0) + 1;
    items.push({ start: segs[i].start, end: segs[i].end, raw, lower, ws, n: ws.length, opener: op });
  }
  if (!items.length) return null;

  const mLen = mean(lens);
  const sLen = sd(lens);
  const burstCV = mLen > 0 ? sLen / mLen : 0;
  const docSurp = surprisal(allW);

  let msd = 0;
  for (let i = 1; i < lens.length; i++) msd += Math.abs(lens[i] - lens[i - 1]);
  msd = lens.length > 1 && mLen > 0 ? msd / (lens.length - 1) / mLen : 0;
  const shortRate = lens.filter((l) => l < 11).length / lens.length;

  const commaCounts: number[] = [];
  for (let k2 = 0; k2 < items.length; k2++)
    commaCounts.push((items[k2].raw.match(/,/g) || []).length);
  const commaMean = mean(commaCounts);

  const tri: Record<string, 1> = {};
  let rep3 = 0;
  for (let i = 0; i + 2 < allW.length; i++) {
    const tk = allW[i] + " " + allW[i + 1] + " " + allW[i + 2];
    if (tri[tk]) rep3++;
    tri[tk] = 1;
  }
  rep3 = allW.length > 0 ? rep3 / allW.length : 0;

  const okeys = Object.keys(openers);
  let ent = 0;
  for (let i = 0; i < okeys.length; i++) {
    const p = openers[okeys[i]] / items.length;
    ent -= p * Math.log2(p);
  }
  const maxEnt = Math.log2(Math.max(2, items.length));
  const openerVar = maxEnt > 0 ? ent / maxEnt : 1;

  let puncTypes = 0;
  [/,/, /;/, /:/, /\(/, /"|“/, /!/, /\?/, /—|--/, /‘|'/].forEach((r) => {
    if (r.test(text)) puncTypes++;
  });
  const emRate = (text.match(/—|\s--\s/g) || []).length / Math.max(1, items.length);
  const semiRate = (text.match(/;/g) || []).length / Math.max(1, items.length);

  const seen: Record<string, 1> = {};
  let uniq = 0;
  for (let i = 0; i < allW.length; i++) {
    if (!seen[allW[i]]) {
      seen[allW[i]] = 1;
      uniq++;
    }
  }
  const ttr = total > 0 ? uniq / Math.sqrt(2 * total) : 0;

  const docAI = aiLexScore(text.toLowerCase(), allW);
  const docHum = humanScore(text.toLowerCase(), allW, text);
  const aiPer100 = total > 0 ? (docAI.score / total) * 100 : 0;

  const uComma = clamp((commaMean - 0.55) / 1.2, 0, 1);
  const uRep3 = clamp(rep3 / 0.012, 0, 1);
  const uElev = clamp((docSurp - 7.4) / 1.3, 0, 1);
  const perpScore = clamp(0.45 * uComma + 0.25 * uRep3 + 0.3 * uElev, 0, 1);

  const uMsd = clamp((0.42 - msd) / 0.36, 0, 1);
  const uCv = clamp((0.42 - burstCV) / 0.34, 0, 1);
  const uShort = clamp((0.22 - shortRate) / 0.22, 0, 1);
  const burstScore = clamp(0.42 * uMsd + 0.33 * uCv + 0.25 * uShort, 0, 1);

  let patScore =
    clamp(aiPer100 / 6.5, 0, 1) * 0.58 +
    clamp((0.95 - openerVar) / 0.45, 0, 1) * 0.14 +
    clamp(emRate / 0.55, 0, 1) * 0.12 +
    clamp(semiRate / 0.5, 0, 1) * 0.05 +
    clamp((7 - puncTypes) / 5, 0, 1) * 0.11;
  patScore = clamp(patScore, 0, 1);

  const docHedge = hedgeRate(text, total);
  const docSpec = specificityRate(text, total);
  const humPer100 = total > 0 ? (docHum.score / total) * 100 : 0;
  const humanish = clamp(
    0.5 * clamp(humPer100 / 5.0, 0, 1) +
      0.32 * clamp(docHedge / 3.2, 0, 1) +
      0.28 * clamp(docSpec / 1.6, 0, 1),
    0,
    1,
  );

  const docZ =
    -1.3 +
    2.3 * perpScore +
    3.0 * burstScore +
    3.4 * patScore -
    4.2 * humanish +
    0.55 * clamp((0.72 - ttr) / 0.32, 0, 1);
  const docP = sig(docZ);

  let flagged = 0;
  let aiWords = 0;
  let paraWords = 0;
  const outItems: SegmentItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const sSurp = surprisal(it.ws);
    const ai = aiLexScore(it.lower, it.ws);
    const hu = humanScore(it.lower, it.ws, it.raw);

    const sComma = clamp(((it.raw.match(/,/g) || []).length - 1) / 2, 0, 1);
    const sElev = clamp((sSurp - 7.5) / 1.4, 0, 1);
    const lenDev = mLen > 0 ? Math.abs(it.n - mLen) / mLen : 0;
    const sUnif = clamp((0.45 - lenDev) / 0.45, 0, 1);
    const band = it.n >= 16 && it.n <= 32 ? 1 : clamp(1 - Math.abs(it.n - 23) / 20, 0, 1);
    const sAI = clamp(ai.score / (Math.max(6, it.n) / 9), 0, 1);
    const sHum = clamp(hu.score / (Math.max(6, it.n) / 7), 0, 1);
    const sHedge = clamp(hedgeRate(it.raw, it.n) / 3.2, 0, 1);
    const sSpec = clamp(specificityRate(it.raw, it.n) / 1.6, 0, 1);
    const sEm = /—|\s--\s/.test(it.raw) ? 1 : 0;
    const sTri = /\b\w+,\s+\w+[\w\s]{0,18},\s+and\s+\w+/.test(it.raw) ? 1 : 0;
    const sNot = /not only[\s\S]{0,60}but also/i.test(it.raw) ? 1 : 0;
    const sOpen = FORMAL_OPENERS.indexOf(it.opener) > -1 ? 1 : 0;
    const sLongW = mean(it.ws.map((w) => w.length));
    const sCplx = clamp((sLongW - 4.3) / 1.9, 0, 1);
    const sSyl = clamp((mean(it.ws.map(syllables)) - 1.42) / 0.55, 0, 1);

    const z =
      -1.6 +
      1.3 * sComma +
      0.6 * sElev +
      1.15 * sUnif +
      0.75 * band +
      3.3 * sAI +
      0.7 * sEm +
      0.65 * sTri +
      0.85 * sNot +
      0.8 * sOpen +
      0.7 * sCplx +
      0.55 * sSyl -
      3.45 * sHum -
      1.7 * sHedge -
      1.5 * sSpec;

    let p = sig(0.62 * z + 0.38 * (docZ * 1.05));
    if (it.n < 8) p = 0.35 * p + 0.65 * docP * 0.85;

    let oov = 0;
    for (let k = 0; k < it.ws.length; k++) if (freqRankOf(it.ws[k]) === undefined) oov++;
    const oovR = oov / it.n;
    const paraSig =
      (sComma > 0.3 || sAI > 0.15) && oovR > 0.32 && (lenDev > 0.3 || sHum > 0.12);

    const reasons: string[] = [];
    if (sComma > 0.45) reasons.push("stacked subordinate clauses");
    if (sElev > 0.5) reasons.push("elevated, predictable register");
    if (sUnif > 0.6) reasons.push("uniform sentence length");
    if (ai.detail.length) reasons.push("AI phrasing: " + ai.detail.slice(0, 3).join(", "));
    if (sEm) reasons.push("em dash");
    if (sTri) reasons.push("rule-of-three list");
    if (sNot) reasons.push('"not only... but also"');
    if (sOpen) reasons.push("formal transition opener");
    if (sSyl > 0.6) reasons.push("long, multi-syllable words");
    if (sHedge > 0.4) reasons.push("human: hedging");
    if (sSpec > 0.4) reasons.push("human: concrete specifics");
    if (hu.detail.length) reasons.push("human: " + hu.detail.join(", "));
    if (!reasons.length) reasons.push("baseline statistical profile");

    const clampedP = clamp(p, 0.01, 0.99);
    if (clampedP >= 0.5) {
      flagged++;
      if (paraSig) paraWords += it.n;
      else aiWords += it.n;
    }
    outItems.push({
      start: it.start,
      end: it.end,
      raw: it.raw,
      n: it.n,
      p: clampedP,
      para: paraSig,
      reasons,
    });
  }
  void aiWords;
  void paraWords;

  const sentenceLens2 = items.map((it) => it.n);
  const paragraphs2 = splitParagraphs(text);
  const sig2b = computeStatStyloSignals(text, allW, sentenceLens2, paragraphs2, openers);
  const combined = combineSignals(null, sig2b.statisticalP, sig2b.stylometricP, {
    wordCount: total,
    modelsAgree: null,
    chunkReliableFraction: paragraphs2.length ? 1 : 0,
  });
  const pct = Math.round(combined.probability * 100);

  const primarySignals: string[] = [];
  if (sig2b.detail.burst.uniformity > 0.6)
    primarySignals.push("Sentence lengths are unusually uniform (low burstiness)");
  if (sig2b.detail.burst.uniformity < 0.3)
    primarySignals.push("Sentence lengths vary naturally (human-typical burstiness)");
  if (sig2b.detail.vocab.diversityDeficit > 0.55)
    primarySignals.push("Vocabulary is more repetitive than typical writing");
  if (sig2b.detail.rep.score > 0.4)
    primarySignals.push("Noticeable reuse of the same short phrases");
  if (aiPer100 > 2)
    primarySignals.push("Some phrasing common in AI writing (weak signal on its own)");
  if (!primarySignals.length)
    primarySignals.push("No single signal dominates — this is a blend of small effects");
  const limitations = [
    "This is the offline statistical fallback (no internet access to the transformer models) — treat it as a weaker signal than the primary detector",
    "This is a statistical estimate, not proof of AI use — treat it as one input among several",
  ];
  if (combined.wordCountTier !== "standard")
    limitations.push("Document is on the short side, which lowers confidence for any detector");

  return {
    engine: "heuristic",
    items: outItems,
    total,
    segments: items.length,
    flagged,
    pct,
    docP,
    perp: perpScore,
    burst: burstScore,
    pat: patScore,
    human: humanish,
    surp: docSurp,
    cv: burstCV,
    mLen,
    sLen,
    msd,
    commaMean,
    reliable: total >= 150,
    combined,
    paragraphReport: [],
    primarySignals,
    limitations,
  };
}
