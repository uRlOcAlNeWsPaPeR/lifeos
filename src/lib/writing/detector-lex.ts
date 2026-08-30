/**
 * Lexical signal helpers for the OFFLINE statistical detector (`analyze()`).
 * These are word/phrase lists — a weaker signal than the transformer models —
 * used only when the models aren't available. Ported verbatim from Klarity.
 */
import { freqRankOf } from "./text-utils";

/* Single words strongly over-represented in LLM output. weight 1..3 */
export const AI_WORDS: Record<string, number> = {
  delve: 3, delving: 3, tapestry: 3, testament: 2, pivotal: 2, realm: 2, multifaceted: 3,
  underscores: 2, underscore: 2, meticulous: 3, meticulously: 3, seamless: 2, seamlessly: 2,
  robust: 2, leverage: 2, leveraging: 2, foster: 2, fostering: 2, comprehensive: 2, holistic: 2,
  myriad: 3, plethora: 3, paradigm: 2, synergy: 2, streamline: 2, streamlined: 2, intricate: 2,
  intricacies: 3, embark: 3, embarking: 3, crucial: 2, vital: 1, notably: 2, moreover: 3,
  furthermore: 3, additionally: 2, consequently: 2, ultimately: 1, showcasing: 2, showcase: 2,
  showcases: 2, encompass: 2, encompasses: 2, facilitate: 2, facilitates: 2, optimal: 2,
  invaluable: 2, indispensable: 2, profound: 2, transformative: 2, unprecedented: 2, versatile: 2,
  nuanced: 2, bolster: 2, spearhead: 2, garner: 2, garnered: 2, resonate: 2, resonates: 2,
  cultivate: 2, cultivating: 2, endeavor: 2, imperative: 2, quintessential: 3, undoubtedly: 2,
  remarkable: 2, boasts: 2, tailored: 2, empower: 2, empowering: 2, revolutionize: 2,
  unparalleled: 3, beacon: 2, cornerstone: 2, harnessing: 2, harness: 1, elevate: 2, elevating: 2,
  utilize: 2, utilizing: 2, utilizes: 2, navigating: 2, evolving: 2, landscape: 1, journey: 1,
  unlock: 2, unlocking: 2, therefore: 1, however: 1, essential: 1, significant: 1, various: 1,
  numerous: 1, individuals: 2, enhance: 2, enhancing: 2, enhanced: 1, ensuring: 2, paramount: 3,
  arguably: 1, exemplifies: 3, underscoring: 3, myriads: 3, adept: 2, prowess: 2, vibrant: 1,
  captivating: 2, compelling: 1, dynamic: 1, innovative: 1, cutting: 1, unwavering: 2, steadfast: 2,
};

/* Multi-word AI tells. weight 2..4 */
export const AI_PHRASES: [string, number][] = [
  ["it is important to note", 4], ["it's important to note", 4], ["it is worth noting", 4],
  ["it's worth noting", 4], ["in today's fast-paced", 4], ["in today's world", 3],
  ["in the realm of", 4], ["a testament to", 3], ["plays a crucial role", 4],
  ["plays a vital role", 4], ["when it comes to", 2], ["not only", 2], ["but also", 2],
  ["in conclusion", 3], ["to summarize", 2], ["in summary", 2], ["first and foremost", 3],
  ["last but not least", 3], ["ever-evolving", 4], ["ever evolving", 4], ["the world of", 2],
  ["a wide range of", 2], ["a variety of", 2], ["serves as a", 2], ["aims to", 2], ["seeks to", 2],
  ["strive to", 2], ["pave the way", 3], ["shed light on", 3], ["dive into", 2], ["deep dive", 2],
  ["delve into", 4], ["at the forefront", 3], ["in the age of", 3], ["as we navigate", 4],
  ["navigate the complexities", 4], ["the digital age", 2], ["game-changer", 3], ["cutting-edge", 3],
  ["state-of-the-art", 2], ["holistic approach", 3], ["key takeaway", 2], ["in essence", 3],
  ["that being said", 2], ["on the other hand", 1], ["due to the fact", 2], ["in order to", 1],
  ["a myriad of", 4], ["a plethora of", 4], ["rich tapestry", 4], ["by understanding", 2],
  ["by leveraging", 4], ["one of the most", 1], ["is essential for", 2], ["is crucial for", 3],
  ["can be attributed", 3], ["it is essential", 3], ["overall,", 1], ["furthermore,", 3],
  ["moreover,", 3], ["additionally,", 2], ["consequently,", 2], ["nevertheless,", 2],
  ["in the modern", 2], ["fast-paced world", 4], ["profound impact", 3], ["significant impact", 2],
  ["wide array", 3], ["fostering a", 3], ["a crucial role", 3], ["remains a", 1], ["continues to", 1],
  ["has become increasingly", 3],
];

/* Human tells: informal markers, hedges, discourse particles */
const HUMAN_WORDS = (
  "i me my mine myself we us our we've i'm i've i'd i'll we're you you're your yeah yep nah ok okay " +
  "honestly actually basically literally kinda sorta gonna wanna gotta stuff dunno whatever anyway anyways " +
  "guess maybe probably pretty really super weird crazy cool nice fun boring hate love tbh imo lol haha ugh " +
  "like just so-so meh oh hey well hmm huh sure obviously seriously"
).split(/\s+/);
export const HUMAN_SET: Record<string, 1> = (() => {
  const s: Record<string, 1> = {};
  for (let i = 0; i < HUMAN_WORDS.length; i++) s[HUMAN_WORDS[i]] = 1;
  return s;
})();

export const FORMAL_OPENERS = [
  "furthermore", "moreover", "additionally", "consequently", "therefore", "however", "nevertheless",
  "nonetheless", "thus", "hence", "subsequently", "notably", "importantly", "ultimately", "overall",
  "indeed", "similarly", "conversely", "accordingly", "specifically", "particularly", "essentially",
  "fundamentally",
];

export function aiLexScore(lower: string, ws: string[]) {
  let hits = 0;
  const detail: string[] = [];
  for (let i = 0; i < ws.length; i++) {
    const w = AI_WORDS[ws[i]];
    if (w) {
      hits += w;
      if (detail.indexOf(ws[i]) < 0 && detail.length < 4) detail.push(ws[i]);
    }
  }
  for (let i = 0; i < AI_PHRASES.length; i++) {
    if (lower.indexOf(AI_PHRASES[i][0]) > -1) {
      hits += AI_PHRASES[i][1];
      if (detail.length < 5) detail.push('"' + AI_PHRASES[i][0] + '"');
    }
  }
  return { score: hits, detail };
}

const HEDGE =
  /\b(somewhat|relatively|fairly|roughly|approximately|probably|likely|seems?|seemed|appears?|might|maybe|could|suggests?|tends? to|arguably|presumably|apparently|largely|mostly|partly|sometimes|rarely|though|although|unless|whether|i think|i'd say|in my view|not sure|hard to say|one limitation|it depends|more or less|for the most part)\b/gi;

export function hedgeRate(raw: string, n: number): number {
  return n > 0 ? ((raw.match(HEDGE) || []).length / n) * 100 : 0;
}

export function specificityRate(raw: string, n: number): number {
  if (!n) return 0;
  const nums = (raw.match(/\b\d+(?:[.,]\d+)*\b|\b\d+%/g) || []).length;
  const acro = (raw.match(/\b[A-Z]{2,}\b/g) || []).length;
  return ((nums + acro) / n) * 100;
}

export function humanScore(_lower: string, ws: string[], raw: string) {
  let h = 0;
  const detail: string[] = [];
  for (let i = 0; i < ws.length; i++) if (HUMAN_SET[ws[i]]) h += 1;
  const contr = (raw.match(/[a-z]['’](t|s|re|ve|ll|d|m)\b/gi) || []).length;
  h += contr * 2.2;
  if (contr) detail.push("contractions");
  if (/\b(i|we|my|our)\b/i.test(raw)) detail.push("first person");
  if (/[!?]{1,}/.test(raw)) h += 1;
  if (/\.\.\./.test(raw)) h += 1.5;
  if (/\b([a-z]+)\s+\1\b/i.test(raw)) h += 1;
  if (/\(.*\)/.test(raw)) h += 0.5;
  if (ws.length < 7 && ws.length > 0) h += 1.2;
  return { score: h, detail };
}

/** Out-of-vocabulary rate against the surprisal frequency table. */
export function oovRate(ws: string[]): number {
  if (!ws.length) return 0;
  let oov = 0;
  for (let k = 0; k < ws.length; k++) if (freqRankOf(ws[k]) === undefined) oov++;
  return oov / ws.length;
}
