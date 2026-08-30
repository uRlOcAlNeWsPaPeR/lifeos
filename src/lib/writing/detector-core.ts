/**
 * detector-core.ts — pure statistical / stylometric signal functions for the
 * AI-writing detector, plus the ensemble combination and category-mapping
 * logic. Ported verbatim from the standalone Klarity build.
 *
 * Everything here is a pure function (no DOM, no fetch, no globals). The
 * transformer classifiers (the two ONNX models) are the only component that
 * was actually trained on labeled AI/human text — everything in this file is
 * a hand-weighted statistical or stylometric heuristic, not fit on a
 * validation set. See comments for the "heuristic, not fitted" caveats.
 */
import { mean, sd, clamp, sig, logit } from "./text-utils";

export { mean, sd, clamp, sig, logit };

// ---------------------------------------------------------------
// Signal 1: burstiness (sentence-length rhythm)
// ---------------------------------------------------------------
export function burstiness(sentenceLens: number[]) {
  if (sentenceLens.length < 2) {
    return { msd: 0, cv: 0, shortRate: 0, uniformity: 0.5, reliable: false };
  }
  const mLen = mean(sentenceLens);
  const sLen = sd(sentenceLens);
  const cv = mLen > 0 ? sLen / mLen : 0;
  let msdSum = 0;
  for (let i = 1; i < sentenceLens.length; i++)
    msdSum += Math.abs(sentenceLens[i] - sentenceLens[i - 1]);
  const msd = mLen > 0 ? msdSum / (sentenceLens.length - 1) / mLen : 0;
  const shortRate = sentenceLens.filter((l) => l < 11).length / sentenceLens.length;

  const uMsd = clamp((0.42 - msd) / 0.36, 0, 1);
  const uCv = clamp((0.42 - cv) / 0.34, 0, 1);
  const uShort = clamp((0.22 - shortRate) / 0.22, 0, 1);
  const uniformity = clamp(0.42 * uMsd + 0.33 * uCv + 0.25 * uShort, 0, 1);
  return { msd, cv, shortRate, uniformity, reliable: true };
}

// ---------------------------------------------------------------
// Signal 2: vocabulary diversity (chunked type-token ratio)
// ---------------------------------------------------------------
export function vocabDiversity(wordsArr: string[]) {
  if (wordsArr.length < 20) return { avgTtr: 0.5, diversityDeficit: 0.5, reliable: false };
  const chunk = 50;
  const ttrs: number[] = [];
  for (let i = 0; i < wordsArr.length; i += chunk) {
    const slice = wordsArr.slice(i, i + chunk);
    if (slice.length < 10) continue;
    const uniq: Record<string, true> = {};
    slice.forEach((w) => {
      uniq[w] = true;
    });
    ttrs.push(Object.keys(uniq).length / slice.length);
  }
  const avgTtr = ttrs.length ? mean(ttrs) : 0.5;
  const diversityDeficit = clamp((0.55 - avgTtr) / 0.3, 0, 1);
  return { avgTtr, diversityDeficit, reliable: true };
}

// ---------------------------------------------------------------
// Signal 3: self-repetition (reused 3-grams)
// ---------------------------------------------------------------
export function selfRepetition(wordsArr: string[]) {
  if (wordsArr.length < 6) return { rep3: 0, score: 0 };
  const tri: Record<string, 1> = {};
  let rep3 = 0;
  for (let i = 0; i + 2 < wordsArr.length; i++) {
    const tk = wordsArr[i] + " " + wordsArr[i + 1] + " " + wordsArr[i + 2];
    if (tri[tk]) rep3++;
    tri[tk] = 1;
  }
  const rate = rep3 / wordsArr.length;
  return { rep3: rate, score: clamp(rate / 0.012, 0, 1) };
}

// ---------------------------------------------------------------
// Signal 4: stylometric — function-word profile
// ---------------------------------------------------------------
export const FUNCTION_WORDS = (
  "the of and a to in is you that it he was for on are as with his they i at be " +
  "this have from or one had by word but not what all were we when your can said there use an each " +
  "which she do how their if will up other about out many then them these so some her would make like " +
  "him into time has look two more write go see number no way could people my than first water been " +
  "call who oil its now find long down day did get come made may part"
).split(" ");

export function functionWordProfile(wordsArr: string[]) {
  if (wordsArr.length < 40) return { entropy: 0, evenness: 0.5, score: 0.5, reliable: false };
  const counts: Record<string, number> = {};
  let total = 0;
  for (let i = 0; i < wordsArr.length; i++) {
    if (FUNCTION_WORDS.indexOf(wordsArr[i]) > -1) {
      counts[wordsArr[i]] = (counts[wordsArr[i]] || 0) + 1;
      total++;
    }
  }
  if (total < 15) return { entropy: 0, evenness: 0.5, score: 0.5, reliable: false };
  const keys = Object.keys(counts);
  let ent = 0;
  keys.forEach((k) => {
    const p = counts[k] / total;
    ent -= p * Math.log2(p);
  });
  const maxEnt = Math.log2(keys.length || 1);
  const evenness = maxEnt > 0 ? ent / maxEnt : 0.5;
  const score = clamp((evenness - 0.78) / 0.16, 0, 1);
  return { entropy: ent, evenness, score, reliable: true };
}

// ---------------------------------------------------------------
// Signal 5: sentence-opener repetition
// ---------------------------------------------------------------
export function openerRepetition(openers: Record<string, number>) {
  const keys = Object.keys(openers);
  let total = 0;
  let ent = 0;
  keys.forEach((k) => {
    total += openers[k];
  });
  if (!total) return { evenness: 1, score: 0 };
  keys.forEach((k) => {
    const p = openers[k] / total;
    ent -= p * Math.log2(p);
  });
  const maxEnt = Math.log2(Math.max(2, total));
  const evenness = maxEnt > 0 ? ent / maxEnt : 1;
  return { evenness, score: clamp((0.95 - evenness) / 0.45, 0, 1) };
}

// ---------------------------------------------------------------
// Signal 6: discourse-marker density
// ---------------------------------------------------------------
export const TRANSITION_WORDS = [
  "however", "moreover", "furthermore", "therefore", "consequently", "additionally",
  "in addition", "similarly", "in contrast", "on the other hand", "for example", "for instance",
  "as a result", "in conclusion", "in summary", "finally", "meanwhile", "nevertheless",
  "nonetheless", "thus", "hence", "accordingly", "likewise", "indeed", "specifically", "overall",
];

export function discourseMarkerDensity(paragraphs: string[]) {
  if (paragraphs.length < 2) return { rate: 0, score: 0, reliable: false };
  let withMarker = 0;
  for (let i = 1; i < paragraphs.length; i++) {
    const opening = paragraphs[i].slice(0, 60).toLowerCase();
    if (TRANSITION_WORDS.some((t) => opening.indexOf(t) > -1)) withMarker++;
  }
  const rate = withMarker / (paragraphs.length - 1);
  return { rate, score: clamp((rate - 0.55) / 0.35, 0, 1), reliable: true };
}

// ---------------------------------------------------------------
// Signal 7: Markdown "listicle" structure density
// ---------------------------------------------------------------
export function markdownListicleDensity(text: string, wordCountN: number) {
  const boldLeadIns = (text.match(/\*\*[^*\n]{2,60}:\*\*/g) || []).length;
  const headers = (text.match(/^#{1,6}\s/gm) || []).length;
  const n = wordCountN > 0 ? wordCountN : 1;
  const perFiveHundred = ((boldLeadIns + headers * 0.5) / n) * 500;
  return { boldLeadIns, headers, perFiveHundred, score: clamp(perFiveHundred / 4, 0, 1) };
}

// ---------------------------------------------------------------
// Signal 8: within-document paragraph consistency
// ---------------------------------------------------------------
export function paragraphConsistency(paragraphStats: { ttr: number; meanSentLen: number }[]) {
  if (paragraphStats.length < 2)
    return { ttrCv: 0, lenCv: 0, consistent: true, reliable: false };
  const ttrs = paragraphStats.map((p) => p.ttr);
  const lens = paragraphStats.map((p) => p.meanSentLen);
  const ttrCv = mean(ttrs) > 0 ? sd(ttrs) / mean(ttrs) : 0;
  const lenCv = mean(lens) > 0 ? sd(lens) / mean(lens) : 0;
  return { ttrCv, lenCv, consistent: ttrCv < 0.35 && lenCv < 0.45, reliable: true };
}

// ---------------------------------------------------------------
// Word-count gating
// ---------------------------------------------------------------
export type WordCountTier = "insufficient" | "limited" | "standard";
export function wordCountTier(n: number): WordCountTier {
  if (n < 120) return "insufficient";
  if (n < 260) return "limited";
  return "standard";
}

// ---------------------------------------------------------------
// Ensemble combination
// ---------------------------------------------------------------
export type VerdictCategory =
  | "insufficient"
  | "likely_human"
  | "probably_human"
  | "uncertain"
  | "probably_ai"
  | "likely_ai";

export interface CombinedResult {
  probability: number;
  confidence: number;
  category: VerdictCategory;
  wordCountTier: WordCountTier;
  componentScores: { transformer: number | null; statistical: number; stylometric: number };
}

export interface Reliability {
  wordCount: number;
  modelsAgree: number | null;
  chunkReliableFraction: number | null;
}

export function combineSignals(
  transformerP: number | null,
  statisticalP: number,
  stylometricP: number,
  reliability: Reliability,
): CombinedResult {
  const haveTransformer = typeof transformerP === "number";
  const wT = haveTransformer ? 2.0 + 3.0 * Math.abs((transformerP as number) - 0.5) * 2 : 0;
  const wS = 1.0;
  const wY = 0.55;
  const totalW = wT + wS + wY;

  const z =
    (wT * (haveTransformer ? logit(transformerP as number) : 0) +
      wS * logit(statisticalP) +
      wY * logit(stylometricP)) /
    totalW;
  const probability = sig(z);

  // ---- confidence (0..100), never allowed to reach 100 ----
  let confidence = 68;
  const tier = wordCountTier(reliability.wordCount || 0);
  if (tier === "insufficient") confidence -= 35;
  else if (tier === "limited") confidence -= 15;
  else confidence += 8;

  if (haveTransformer && typeof reliability.modelsAgree === "number") {
    confidence += (reliability.modelsAgree - 0.5) * 40;
  }
  const statVsTransformerGap = haveTransformer
    ? Math.abs((transformerP as number) - statisticalP)
    : 0;
  confidence -= clamp(statVsTransformerGap - 0.25, 0, 0.6) * 45;

  if (typeof reliability.chunkReliableFraction === "number") {
    confidence += (reliability.chunkReliableFraction - 0.5) * 20;
  }
  confidence = clamp(Math.round(confidence), 5, 95);

  // ---- 6-category verdict ----
  let category: VerdictCategory;
  if (tier === "insufficient") {
    category = "insufficient";
  } else if (confidence < 38) {
    category = "uncertain";
  } else if (probability >= 0.8) {
    category = "likely_ai";
  } else if (probability >= 0.58) {
    category = "probably_ai";
  } else if (probability >= 0.38) {
    category = "uncertain";
  } else if (probability >= 0.18) {
    category = "probably_human";
  } else {
    category = "likely_human";
  }

  return {
    probability,
    confidence,
    category,
    wordCountTier: tier,
    componentScores: { transformer: transformerP, statistical: statisticalP, stylometric: stylometricP },
  };
}

export const CATEGORY_LABELS: Record<VerdictCategory, string> = {
  insufficient: "Insufficient text",
  likely_human: "Likely human-written",
  probably_human: "Probably human-written",
  uncertain: "Uncertain",
  probably_ai: "Probably AI-generated",
  likely_ai: "Likely AI-generated",
};
