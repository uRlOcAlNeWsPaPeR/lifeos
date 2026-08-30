/**
 * Rule-based Humanizer. Every transformation is lexical, structural or
 * punctuation-level — nothing is invented. Ported verbatim from Klarity.
 *
 * Measured against the current detector this moves the score by roughly a
 * point, not fifty — the models were adversarially trained to resist surface
 * rewriting. Read the output before using it.
 */
import { words, wordCount, fixCaps, splitSentences } from "./text-utils";
import {
  VOCAB,
  FILLER,
  CONTRACT,
  TRANSITIONS,
  CASUAL,
  OPENER_VARY,
  GENERIC_OPENERS,
  HAS_OPENER,
  BY_NOT_AGENT,
  AGENT_TRAILER_RISK,
  SING_PRONOUN,
  PLURAL_PRONOUN,
  OBJ_TO_SUBJ_PRONOUN,
  AUXV,
  PLURAL_VERB,
} from "./humanize-data";

export interface HumanizeOptions {
  seed?: number;
  strength: 1 | 2 | 3;
  vocab: boolean;
  filler: boolean;
  contract: boolean;
  punct: boolean;
  burst: boolean;
  trans: boolean;
  casual: boolean;
  passive: boolean;
  openers: boolean;
}

export interface HumanizeStats {
  vocab: number;
  filler: number;
  contract: number;
  punct: number;
  split: number;
  merge: number;
  trans: number;
  casual: number;
  passive: number;
  openers: number;
}

export interface HumanizeResult {
  text: string;
  edits: number;
  stats: HumanizeStats;
}

/* ---------- helpers ---------- */
export function rng(seed?: number): () => number {
  let s = (seed ?? 0) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function matchCase(src: string, rep: string): string {
  if (!rep) return rep;
  if (/^[A-Z][a-z]/.test(src) || /^[A-Z]$/.test(src))
    return rep.charAt(0).toUpperCase() + rep.slice(1);
  if (/^[A-Z]+$/.test(src) && src.length > 1) return rep.toUpperCase();
  return rep;
}

function reEsc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toObjectCase(np: string): string {
  const w = np.match(/\S+/g) || [];
  if (w.length >= 2 && /^[A-Z]/.test(w[0] ?? "") && /^[A-Z]/.test(w[1] ?? "")) return np;
  return np.charAt(0).toLowerCase() + np.slice(1);
}
function toSubjectCase(np: string): string {
  return np.charAt(0).toUpperCase() + np.slice(1);
}

function agreeHas(agentPhrase: string): string {
  const w = words(agentPhrase);
  const last = (w[w.length - 1] || "").toLowerCase();
  if (SING_PRONOUN.test(last)) return "has";
  if (PLURAL_PRONOUN.test(last)) return "have";
  if (/s$/.test(last) && !/(ss|us|is)$/.test(last)) return "have";
  return "has";
}

function normalizeAgentPronoun(agent: string): string {
  const key = agent.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(OBJ_TO_SUBJ_PRONOUN, key)
    ? OBJ_TO_SUBJ_PRONOUN[key]
    : agent;
}

function tryActive(sent: string): string | null {
  let m: RegExpMatchArray | null;
  let agent: string;

  m = sent.match(
    /^([A-Z][^,.!?;:]{2,60}?)\s+(?:was|were)\s+(\w+ed)\s+by\s+([A-Za-z][^,.!?;:]{1,50}?)([.!?]["'”)\]]?)\s*$/,
  );
  if (
    m &&
    !BY_NOT_AGENT.test(m[3]) &&
    !AGENT_TRAILER_RISK.test(m[3]) &&
    wordCount(m[1]) <= 8 &&
    wordCount(m[3]) <= 6
  ) {
    agent = normalizeAgentPronoun(m[3]);
    return toSubjectCase(agent) + " " + m[2] + " " + toObjectCase(m[1]) + m[4];
  }

  m = sent.match(
    /^([A-Z][^,.!?;:]{2,60}?)\s+(has|have|had)\s+been\s+(\w+)\s+by\s+([A-Za-z][^,.!?;:]{1,50}?)([.!?]["'”)\]]?)\s*$/i,
  );
  if (
    m &&
    !BY_NOT_AGENT.test(m[4]) &&
    !AGENT_TRAILER_RISK.test(m[4]) &&
    wordCount(m[1]) <= 8 &&
    wordCount(m[4]) <= 6
  ) {
    agent = normalizeAgentPronoun(m[4]);
    const helper = /^had$/i.test(m[2]) ? "had" : agreeHas(agent);
    return toSubjectCase(agent) + " " + helper + " " + m[3] + " " + toObjectCase(m[1]) + m[5];
  }

  return null;
}

function verbish(w: string): boolean {
  return AUXV.test(w) || /(?:ed|es|s)$/.test(w);
}
function pronounFor(verb: string): string {
  return PLURAL_VERB.test(verb || "") ? "They " : "It ";
}

function joinSplit(head: string, lead: string, tail: string, tr: string): string {
  head = head.replace(/[\s,]+$/, "");
  if (!/[.!?]$/.test(head)) head += ".";
  tail = tail.replace(/^\s+/, "");
  let second = lead
    ? lead + tail.charAt(0).toLowerCase() + tail.slice(1)
    : tail.charAt(0).toUpperCase() + tail.slice(1);
  second = second.charAt(0).toUpperCase() + second.slice(1);
  if (!/[.!?]["'”)]?$/.test(second)) second += ".";
  return head + " " + second + tr;
}

function trySplit(t: string, rand: () => number): string | null {
  const body = t.replace(/\s+$/, "");
  const trail = t.slice(body.length);
  const commas = (body.match(/,/g) || []).length;
  let m: RegExpMatchArray | null;

  if (commas < 2) {
    m = body.match(/^([\s\S]{30,}?[a-z0-9)"'”]),\s+(and|but|so|yet)\s+([\s\S]{25,})$/i);
    if (m && wordCount(m[3]) >= 7) {
      const leadA = { and: "", but: "But ", so: "So ", yet: "Still, " }[
        m[2].toLowerCase() as "and" | "but" | "so" | "yet"
      ];
      return joinSplit(m[1], leadA, m[3], trail);
    }
  }

  m = body.match(/^([\s\S]{30,}?[a-z0-9)"'”]),\s+which\s+([\s\S]{14,})$/i);
  if (m && wordCount(m[2]) >= 4 && verbish(words(m[2])[0] || "")) {
    return joinSplit(m[1], pronounFor(words(m[2])[0] || ""), m[2], trail);
  }

  m = body.match(/^([\s\S]{28,}?[a-z0-9)"'”]),\s+where\s+([\s\S]{14,})$/i);
  if (m && wordCount(m[2]) >= 4) {
    return joinSplit(m[1], "There, ", m[2], trail);
  }

  m = body.match(/^([\s\S]{35,}?[a-z0-9)"'”])\s+that\s+((?:\w+ly\s+)?[\s\S]{18,})$/i);
  if (m && wordCount(m[1]) >= 9 && wordCount(m[2]) >= 6) {
    const w0 = words(m[2]);
    if (verbish(w0[0] || "") || (/ly$/.test(w0[0] || "") && verbish(w0[1] || ""))) {
      const vb = /ly$/.test(w0[0] || "") ? w0[1] : w0[0];
      return joinSplit(m[1], pronounFor(vb), m[2], trail);
    }
  }

  m = body.match(/^([\s\S]{30,}?[a-z0-9)"'”]),\s+(while|although|though|whereas)\s+([\s\S]{18,})$/i);
  if (m && wordCount(m[3]) >= 6) {
    const leadB = {
      while: "Meanwhile, ",
      although: "That said, ",
      though: "That said, ",
      whereas: "By contrast, ",
    }[m[2].toLowerCase() as "while" | "although" | "though" | "whereas"];
    return joinSplit(m[1], leadB, m[3], trail);
  }

  m = body.match(/^([\s\S]{25,}?[a-z0-9)"'”]),\s+(?:including|such as)\s+([\s\S]{12,})$/i);
  if (m && wordCount(m[2]) >= 4) {
    const leadC = rand() < 0.5 ? "Among them: " : "Things like ";
    return joinSplit(m[1], leadC, m[2], trail);
  }

  m = body.match(/^([\s\S]{30,}?[a-z0-9)"'”]),\s+(?:because|since)\s+([\s\S]{18,})$/i);
  if (m && wordCount(m[2]) >= 6) {
    return joinSplit(m[1], "That is because ", m[2], trail);
  }

  return null;
}

/* ---------- main ---------- */
export function humanize(text: string, opt: HumanizeOptions): HumanizeResult {
  const rand = rng(opt.seed);
  let edits = 0;
  const stats: HumanizeStats = {
    vocab: 0, filler: 0, contract: 0, punct: 0, split: 0, merge: 0, trans: 0, casual: 0,
    passive: 0, openers: 0,
  };
  let out = text;
  const pApply = opt.strength === 1 ? 0.55 : opt.strength === 2 ? 0.85 : 1.0;

  /* 1. filler phrase removal */
  if (opt.filler) {
    const pFill = opt.strength === 1 ? 0.75 : 1.0;
    FILLER.forEach((r) => {
      out = out.replace(r, (m) => {
        if (rand() > pFill) return m;
        stats.filler++;
        edits++;
        return "";
      });
    });
    out = fixCaps(out);
  }

  /* 2. vocabulary swaps (longest phrases first) */
  if (opt.vocab) {
    const pVocab = opt.strength === 1 ? 0.72 : 1.0;
    const sorted = VOCAB.slice().sort((a, b) => b[0].length - a[0].length);
    const vocabLastPick: Record<string, string> = {};
    sorted.forEach((pair) => {
      const re = new RegExp("\\b" + reEsc(pair[0]).replace(/\\?-/g, "[- ]") + "\\b", "gi");
      out = out.replace(re, (m) => {
        if (rand() > pVocab) return m;
        const opts = pair[1];
        const choices =
          opts.length > 1 ? opts.filter((o) => o !== vocabLastPick[pair[0]]) : opts;
        const pick = choices[Math.floor(rand() * choices.length)];
        if (pick === undefined) return m;
        vocabLastPick[pair[0]] = pick;
        if (pick === "") {
          stats.vocab++;
          edits++;
          return "";
        }
        stats.vocab++;
        edits++;
        return matchCase(m, pick);
      });
    });
    out = out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/,\s*,/g, ",");
  }

  /* 3. transitions */
  if (opt.trans) {
    const pTrans = opt.strength === 1 ? 0.7 : 1.0;
    const transLastPick: Record<string, string> = {};
    TRANSITIONS.forEach((t) => {
      out = out.replace(t[0], (m) => {
        if (rand() > pTrans) return m;
        const opts = t[1];
        const choices =
          opts.length > 1 ? opts.filter((o) => o !== transLastPick[t[0].source]) : opts;
        const pick = choices[Math.floor(rand() * choices.length)];
        transLastPick[t[0].source] = pick;
        stats.trans++;
        edits++;
        return pick;
      });
    });
    out = fixCaps(out);
  }

  /* 4. punctuation cleanup */
  if (opt.punct) {
    out = out.replace(/\s*—\s*/g, () => {
      stats.punct++;
      edits++;
      return rand() < 0.5 ? ", " : " ";
    });
    out = out.replace(/\s+--\s+/g, () => {
      stats.punct++;
      edits++;
      return ", ";
    });
    out = out.replace(/;\s*/g, () => {
      stats.punct++;
      edits++;
      return rand() < 0.6 ? ". " : ", ";
    });
    out = fixCaps(out);
    out = out.replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ");
  }

  /* 5. passive → active */
  if (opt.passive) {
    const pvSegs = splitSentences(out);
    let pvBuf = "";
    let pvPrev = 0;
    for (let pv = 0; pv < pvSegs.length; pv++) {
      pvBuf += out.slice(pvPrev, pvSegs[pv].start);
      let pvSent = out.slice(pvSegs[pv].start, pvSegs[pv].end);
      if (rand() <= pApply) {
        const pvConv = tryActive(pvSent);
        if (pvConv) {
          pvSent = pvConv;
          stats.passive++;
          edits++;
        }
      }
      pvBuf += pvSent;
      pvPrev = pvSegs[pv].end;
    }
    out = pvBuf + out.slice(pvPrev);
  }

  /* 6. contractions */
  if (opt.contract) {
    CONTRACT.forEach((c) => {
      out = out.replace(c[0], (m) => {
        if (rand() > pApply * 0.92) return m;
        stats.contract++;
        edits++;
        return matchCase(m, c[1]);
      });
    });
  }

  /* 7. burstiness */
  if (opt.burst) {
    const segs = splitSentences(out);
    const pieces: { text: string; gap: string }[] = [];
    for (let i = 0; i < segs.length; i++) {
      const s = out.slice(segs[i].start, segs[i].end);
      const gapEnd = i + 1 < segs.length ? segs[i + 1].start : out.length;
      pieces.push({ text: s, gap: out.slice(segs[i].end, gapEnd) });
    }
    const minSplit = opt.strength === 1 ? 22 : opt.strength === 2 ? 18 : 15;
    for (let i = 0; i < pieces.length; i++) {
      if (wordCount(pieces[i].text) < minSplit) continue;
      if (rand() > pApply) continue;
      const sp = trySplit(pieces[i].text, rand);
      if (sp) {
        pieces[i].text = sp;
        stats.split++;
        edits++;
      }
    }
    for (let i = 0; i < pieces.length - 1; i++) {
      const a = pieces[i].text;
      const b = pieces[i + 1].text;
      if (
        wordCount(a) >= 4 &&
        wordCount(a) <= 9 &&
        wordCount(b) >= 4 &&
        wordCount(b) <= 13 &&
        /[.]$/.test(a.trim()) &&
        !/\n/.test(pieces[i].gap) &&
        rand() < pApply * 0.6
      ) {
        const joiner = rand() < 0.5 ? ", and " : ", so ";
        const merged = a.trim().replace(/\.$/, "") + joiner + b.charAt(0).toLowerCase() + b.slice(1);
        pieces[i].text = merged;
        pieces[i].gap = pieces[i + 1].gap;
        pieces.splice(i + 1, 1);
        stats.merge++;
        edits++;
      }
    }
    if (opt.openers) {
      const openerUsed: Record<string, 1> = {};
      let openerLast = -9;
      for (let i = 1; i < pieces.length; i++) {
        const w0 = words(pieces[i].text)[0] || "";
        const w0prev = words(pieces[i - 1].text)[0] || "";
        if (!w0 || w0.toLowerCase() !== w0prev.toLowerCase()) continue;
        if (!GENERIC_OPENERS.test(w0)) continue;
        if (i - openerLast < 2) continue;
        if (wordCount(pieces[i].text) <= 6) continue;
        if (HAS_OPENER.test(pieces[i].text)) continue;
        if (rand() > pApply) continue;
        let openerPool = OPENER_VARY.filter((c) => !openerUsed[c]);
        if (!openerPool.length) {
          Object.keys(openerUsed).forEach((k) => delete openerUsed[k]);
          openerPool = OPENER_VARY;
        }
        const om = openerPool[Math.floor(rand() * openerPool.length)];
        openerUsed[om] = 1;
        openerLast = i;
        pieces[i].text =
          om + pieces[i].text.charAt(0).toLowerCase() + pieces[i].text.slice(1);
        stats.openers++;
        edits++;
      }
    }
    if (opt.casual) {
      let lastMark = -9;
      const usedMark: Record<string, 1> = {};
      for (let i = 1; i < pieces.length; i++) {
        if (i - lastMark < 2) continue;
        if (wordCount(pieces[i].text) <= 7) continue;
        if (HAS_OPENER.test(pieces[i].text)) continue;
        if (rand() >= (opt.strength === 3 ? 0.3 : opt.strength === 2 ? 0.2 : 0.1)) continue;
        let pool = CASUAL.filter((c) => !usedMark[c]);
        if (!pool.length) {
          Object.keys(usedMark).forEach((k) => delete usedMark[k]);
          pool = CASUAL;
        }
        const mk = pool[Math.floor(rand() * pool.length)];
        usedMark[mk] = 1;
        lastMark = i;
        pieces[i].text =
          mk + pieces[i].text.charAt(0).toLowerCase() + pieces[i].text.slice(1);
        stats.casual++;
        edits++;
      }
    }
    out = pieces.map((p) => p.text + p.gap).join("");
  } else if (opt.casual) {
    const sg = splitSentences(out);
    let buf = "";
    let prev = 0;
    for (let q = 0; q < sg.length; q++) {
      buf += out.slice(prev, sg[q].start);
      let st = out.slice(sg[q].start, sg[q].end);
      if (q > 0 && rand() < 0.1 && wordCount(st) > 7) {
        st = CASUAL[Math.floor(rand() * CASUAL.length)] + st.charAt(0).toLowerCase() + st.slice(1);
        stats.casual++;
        edits++;
      }
      buf += st;
      prev = sg[q].end;
    }
    out = buf + out.slice(prev);
  }

  /* tidy */
  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])([A-Za-z])/g, "$1 $2")
    .replace(/,\s*\./g, ".")
    .replace(/([^.])\.\s*\.(?!\.)/g, "$1.")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n");
  out = fixCaps(out);
  out = out.replace(/\bi\b/g, "I");

  return { text: out.trim(), edits, stats };
}

/* ---------- word-level diff for change highlighting ---------- */
export interface DiffToken {
  text: string;
  added: boolean;
}

export function diffTokens(a: string, b: string): DiffToken[] {
  const A = a.match(/\S+|\s+/g) || [];
  const B = b.match(/\S+|\s+/g) || [];
  if (A.length > 2200 || B.length > 2200) return [{ text: b, added: false }];
  const n = A.length;
  const m = B.length;
  const dp = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * (m + 1) + j] =
        A[i] === B[j]
          ? dp[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
    }
  }
  const tokens: DiffToken[] = [];
  let bufNew = "";
  let i = 0;
  let j = 0;
  const flush = () => {
    if (bufNew) {
      tokens.push({ text: bufNew, added: true });
      bufNew = "";
    }
  };
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      flush();
      tokens.push({ text: B[j], added: false });
      i++;
      j++;
    } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) {
      i++;
    } else {
      bufNew += B[j];
      j++;
    }
  }
  while (j < m) {
    bufNew += B[j];
    j++;
  }
  flush();
  return tokens;
}
