/**
 * Pure text helpers shared by the AI detector and the humanizer.
 * Ported verbatim (behaviour-for-behaviour) from the standalone Klarity build —
 * no DOM, no network, no framework. Safe to run on the server or in a worker.
 */

/* ---------- numeric ---------- */
export function mean(a: number[]): number {
  if (!a.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}
export function sd(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
  return Math.sqrt(s / (a.length - 1));
}
export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
export function sig(z: number): number {
  return 1 / (1 + Math.exp(-z));
}
/** Safe logit — clamps p away from 0/1 so a stray exact value can't blow up. */
export function logit(p: number): number {
  const q = clamp(p, 0.02, 0.98);
  return Math.log(q / (1 - q));
}

/* ---------- sentence / word segmentation ---------- */
const ABBR =
  /(?:^|[\s("'])(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|inc|ltd|co|dept|fig|approx|no|vol|est|e\.g|i\.e|u\.s|a\.m|p\.m)\.$/i;

export interface Span {
  start: number;
  end: number;
}

export function splitSentences(text: string): Span[] {
  const res: Span[] = [];
  let start = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?" || ch === "…") {
      let j = i + 1;
      while (j < n && `.!?…"'”’)]`.indexOf(text[j]) > -1) j++;
      const seg = text.slice(start, j);
      if (!ABBR.test(seg.replace(/\s+$/, "")) && (j >= n || /\s/.test(text[j]))) {
        let e = j;
        while (e < n && /\s/.test(text[e])) e++;
        if (seg.trim().length) res.push({ start, end: j });
        start = e;
        i = e;
        continue;
      }
      i = j;
      continue;
    }
    if (ch === "\n") {
      if (text.slice(start, i).trim().length > 0) {
        let e2 = i;
        while (e2 < n && /\s/.test(text[e2])) e2++;
        res.push({ start, end: i });
        start = e2;
        i = e2;
        continue;
      }
    }
    i++;
  }
  if (text.slice(start).trim().length > 0) res.push({ start, end: n });
  return res;
}

export function words(s: string): string[] {
  const m = s.toLowerCase().match(/[a-zà-öø-ÿ]+(?:['’][a-zà-öø-ÿ]+)?/g);
  return m || [];
}

export function wordCount(s: string): number {
  return words(s).length;
}

const ABBR_TAIL =
  /(?:^|[\s("'])(?:[a-z]|mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|inc|ltd|co|dept|fig|approx|no|vol|est|e\.g|i\.e|u\.s|a\.m|p\.m)$/i;

export function fixCaps(s: string): string {
  return s.replace(
    /(^|[.!?]["'”)]?\s+|\n[ \t]*)([a-zà-öø-ÿ])/g,
    (m: string, pre: string, ch: string, off: number) => {
      if (/[.!?]/.test(pre)) {
        const before = s.slice(Math.max(0, off - 12), off);
        if (ABBR_TAIL.test(before)) return m;
      }
      return pre + ch.toUpperCase();
    },
  );
}

export function syllables(w: string): number {
  w = w.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = w.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

/* ---------- markdown / paragraphs ---------- */
export function stripMarkdownForScoring(text: string): string {
  text = text.replace(/```[\s\S]*?```/g, (block) =>
    block
      .split("\n")
      .filter((line) => {
        const letters = (line.match(/[A-Za-z]/g) || []).length;
        return letters >= 3 && letters > line.length * 0.3;
      })
      .join(". "),
  );
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/^[ \t]*[-*+]\s+/gm, "")
    .replace(/^[ \t]*\d+\.\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/^[ \t-]{3,}$/gm, "")
    .replace(/[ \t]{2,}/g, " ");
}

export function splitParagraphs(text: string): string[] {
  const byBlank = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byBlank.length <= 1 && wordCount(text) > 150) {
    const byLine = text
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (byLine.length > 1) return byLine;
  }
  return byBlank;
}

export function splitParagraphSpans(text: string): Span[] {
  function spansOn(re: RegExp): Span[] {
    let m: RegExpExecArray | null;
    let last = 0;
    const spans: Span[] = [];
    while ((m = re.exec(text)) !== null) {
      spans.push({ start: last, end: m.index });
      last = re.lastIndex;
    }
    spans.push({ start: last, end: text.length });
    return spans.filter((s) => text.slice(s.start, s.end).trim());
  }
  const byBlank = spansOn(/\n\s*\n/g);
  if (byBlank.length <= 1 && wordCount(text) > 150) {
    const byLine = spansOn(/\n+/g);
    if (byLine.length > 1) return byLine;
  }
  return byBlank;
}

/* ---------- surprisal (corpus-frequency register measure) ---------- */
const FREQ_WORDS = (
  "the be to of and a in that have i it for not on with he as you do at this but his by from " +
  "they we say her she or an will my one all would there their what so up out if about who get which go me when " +
  "make can like time no just him know take people into year your good some could them see other than then now " +
  "look only come it its over think also back after use two how our work first well way even new want because " +
  "any these give day most us is are was were been has had did does said made many such long great little own " +
  "under above off down again once here both each few more same too very should must may might shall am being " +
  "through during before between while against among within without across behind beyond near around toward " +
  "upon since until though although unless whether however therefore thus hence still yet already always never " +
  "often sometimes usually rarely again ever else almost quite rather really actually simply perhaps maybe " +
  "probably certainly clearly indeed course fact case point part place thing things world life man woman child " +
  "children men women person people family friend school student teacher year years month week day days night " +
  "morning today tomorrow yesterday hour minute moment number group company business money market water food " +
  "home house room door car city country state government law right left hand head eye face body heart mind " +
  "idea word words book story name question answer problem reason result end start begin began began end change " +
  "help need try find keep let put set run move show tell ask feel seem become leave call turn bring hold write " +
  "read hear speak talk walk sit stand play live love like want mean happen believe remember understand learn " +
  "teach study grow build open close send pay meet lose win stop watch wait send buy sell eat drink sleep walk " +
  "big small large little long short high low old new young early late good bad better best worse worst same " +
  "different next last first second third own real true false full empty easy hard free sure clear open close " +
  "strong weak hot cold warm dark light heavy soft loud quiet fast slow rich poor happy sad glad angry tired " +
  "ready able whole half every another each either neither none nothing something anything everything someone " +
  "anyone everyone nobody somebody himself herself myself yourself themselves ourselves itself who whom whose " +
  "where why how when what which that this these those there here am he she they we you i me him her us them " +
  "very much more less least most just only even still also too again enough almost about around over under " +
  "between into onto off out up down back away along away together apart forward behind ahead inside outside " +
  "one two three four five six seven eight nine ten hundred thousand million first next last few several many " +
  "all some any no every much little more most other another such same own next past future present current " +
  "national local public private social personal general special common main major minor simple hard easy " +
  "important possible available likely certain sure clear true real actual normal usual final total whole " +
  "and or but so if then than because while when where after before until since though as that which who " +
  "got went came took gave made saw knew thought felt found told asked used tried called worked looked seemed " +
  "left kept began held brought moved lived played turned started stopped needed wanted liked " +
  /* mid-frequency band */
  "able above accept access account across act action activity add address afraid age agree ahead air allow " +
  "almost alone along already although always among amount ancient animal announce answer anybody appear apply " +
  "approach area argue arm army arrive art article artist aside ask aspect assume attack attempt attend attention " +
  "author available average avoid award aware away baby back bad bag balance ball band bank base basic beach " +
  "bear beat beauty bed beer before begin behavior behind belief believe belong below benefit beside best bet " +
  "better beyond bill bird birth bit black blood blue board boat body bone book border born both bottle bottom " +
  "box boy brain branch break breath bridge brief bright bring broad brother budget build burn bus business busy " +
  "button buy cake call camera camp campaign cancer candidate capital captain car card care career carry case " +
  "cash cat catch cause cell center central century certain chain chair challenge chance change channel chapter " +
  "character charge check chest chicken chief choice choose church circle citizen city civil claim class clean " +
  "clear climate climb clock close cloud club coach coast coat code coffee cold collect college color column " +
  "combine come comfort command comment commit common community company compare compete complete computer concept " +
  "concern condition conduct conference confirm connect consider consist constant contact contain content contest " +
  "context continue contract contrast control convert cook cool copy corner correct cost cotton council count " +
  "country couple course court cover create credit crime crisis critical crop cross crowd cultural culture cup " +
  "current custom customer cut cycle daily damage dance danger dark data date daughter deal death debate debt " +
  "decade decide decision declare decline deep defeat defense define degree deliver demand deny depend depth " +
  "describe design desire desk despite destroy detail detect develop device diet differ difficult dinner direct " +
  "direction dirty discover discuss disease display distance divide doctor document dog dollar domestic door " +
  "double doubt down draft drag draw dream dress drink drive drop drug dry duty each earn earth ease east easy " +
  "economic economy edge edit education effect effort egg eight either elect element else emerge emotion employ " +
  "empty enable encourage end enemy energy engage engine enjoy enough enter entire entry environment equal " +
  "equipment error escape especially establish estate estimate ethnic evaluate even evening event eventually " +
  "everybody evidence exact examine example exceed except exchange excite exclude excuse execute exercise exist " +
  "exit expand expect expense experience experiment expert explain explore express extend extent external extra " +
  "extreme eye fabric face facility fact factor fail fair faith fall false familiar farm fast father fault favor " +
  "fear feature federal fee feed feel female fence few field fight figure file fill film final finance find fine " +
  "finger finish fire firm fish fit five fix flat flight floor flow flower fly focus fold follow foot force " +
  "foreign forest forget form formal format former forth fortune forward found four frame frequent fresh friend " +
  "front fruit fuel full fun function fund future gain game gap garden gas gate gather gender general generate " +
  "gentle gift girl give glass global goal gold golf grade grain grand grant grass gray green ground group grow " +
  "growth guard guess guest guide gun guy habit hair half hall hand handle hang happen happy harbor hard harm " +
  "hat hate head health hear heart heat heavy height hell hello help hence herself hide high hill him hire " +
  "history hit hold hole holiday home honest hope horse hospital host hot hotel hour house housing however huge " +
  "human hundred hungry hunt hurt husband ice idea ideal identify image imagine impact implement imply import " +
  "impose improve include income increase indeed index indicate industry infant influence inform initial injury " +
  "inner input inquiry inside insist install instance instead institution instruction insurance intend interest " +
  "internal international interview introduce invest investment involve iron island issue item job join joint " +
  "joke journal joy judge juice jump junior jury just justice keep key kick kid kill kind king kitchen knee " +
  "knife knock know knowledge lab labor lack lady lake land language large last late later laugh launch law " +
  "layer lead leader leaf league lean learn lease least leather leave lecture left leg legal lemon length less " +
  "lesson let letter level library license lie life lift light limit line link lip list listen literature little " +
  "load loan local locate lock log logic lonely long look loose lose loss lot loud love low luck lunch machine " +
  "magazine mail main maintain major make male mall man manage manager manner map march margin mark market " +
  "marriage mass master match material matter maximum maybe meal mean measure meat media medical medicine meet " +
  "member memory mental mention menu mere message metal method middle might mile military milk million mind " +
  "mine minor minute mirror miss mission mistake mix mobile model modern modest moment money monitor month mood " +
  "moon moral more morning most mother motion motor mount mouth move movie much multiple muscle museum music " +
  "must mutual myself mystery narrow nation native natural nature near nearly neck need negative neighbor " +
  "neither nerve net network never news newspaper next nice night nine noise none nor normal north nose note " +
  "nothing notice notion novel now nowhere nuclear number nurse object observe obtain obvious occasion occupy " +
  "occur ocean odd offer office officer official oil old olive once one ongoing online only onto open operate " +
  "opinion opponent opportunity oppose option orange order organic organize origin other otherwise ought outcome " +
  "outdoor output outside oven over overall overcome owe own owner pace pack page pain paint pair palm panel " +
  "paper parent park part particular partner party pass passage passenger past patch path patient pattern pause " +
  "pay peace peak peer penalty people pepper per percent perfect perform perhaps period permit person personal " +
  "phase phone photo phrase physical pick picture piece pile pilot pink pipe pitch place plan plane plant " +
  "plastic plate play please pleasure plenty plot plus pocket poem poet point police policy political politics " +
  "poll pool poor pop popular port portion position positive possess possible post pot potato potential pound " +
  "pour power practice praise pray predict prefer premium prepare present preserve president press pressure " +
  "pretty prevent previous price pride primary prime print prior priority prison private prize probably problem " +
  "procedure process produce product profession profile profit program progress project promise promote prompt " +
  "proof proper property proportion proposal propose protect protein protest proud prove provide public publish " +
  "pull punch purchase pure purpose pursue push put quality quarter question quick quiet quit quite quote race " +
  "radio rail rain raise range rank rapid rare rate rather ratio raw reach react read ready real reality realize " +
  "reason recall receive recent recipe recognize recommend record recover reduce refer reflect reform refuse " +
  "regard region register regular reject relate relation release relevant relief religion rely remain remark " +
  "remember remind remote remove repair repeat replace reply report represent request require rescue research " +
  "reserve resident resist resolve resource respect respond response responsible rest restore result retain " +
  "retire return reveal revenue review revolution reward rhythm rice rich ride right ring rise risk river road " +
  "rock role roll roof room root rope rough round route routine row royal rule run rural rush sad safe safety " +
  "sail salad salary sale salt same sample sand satisfy save say scale scan scene schedule scheme scholar school " +
  "science score screen script sea search season seat second secret section sector secure see seed seek seem " +
  "segment seize select self sell senate send senior sense sentence separate sequence series serious serve " +
  "service session set settle seven several severe sex shade shadow shake shall shape share sharp she sheet " +
  "shelf shell shelter shift shine ship shirt shock shoe shoot shop short shot should shoulder shout show shower " +
  "shut sick side sight sign signal silence silent silver similar simple since sing single sink sir sister sit " +
  "site situation six size skill skin sky sleep slice slide slight slip slow small smart smell smile smoke " +
  "smooth snap snow social society soft software soil solar soldier solid solution solve some son song soon " +
  "sorry sort soul sound soup source south space speak special species specific speech speed spell spend sphere " +
  "spirit split sponsor sport spot spread spring square squeeze stable staff stage stair stake stand standard " +
  "star stare start state statement station status stay steady steal steam steel step stick still stock stomach " +
  "stone stop storage store storm story straight strange strategy stream street strength stress stretch strike " +
  "string strip stroke strong structure struggle student studio study stuff style subject submit succeed success " +
  "such sudden suffer sugar suggest suit summer sun supply support suppose sure surface surgery surprise " +
  "surround survey survive suspect sustain swear sweep sweet swim switch symbol symptom system table tail take " +
  "tale talent talk tall tank tape target task taste tax tea teach team tear technical technique technology " +
  "telephone tell temperature temporary tend tension term terrible territory test text thank theme theory " +
  "therapy thick thin thing think third thirty this thought thousand threat three throat through throughout " +
  "throw thus ticket tie tight time tiny tip tire title today toe together tomorrow tone tonight tool tooth top " +
  "topic total touch tough tour tourist toward tower town track trade tradition traffic trail train transfer " +
  "transform transition translate transport travel treat treatment tree trend trial tribe trick trip troop " +
  "trouble truck true trust truth try tube tune turn twelve twenty twice twin type typical ugly ultimate unable " +
  "uncle under undergo understand unfair uniform union unique unit unite universe university unknown unless " +
  "unlike until unusual update upon upper upset urban urge usual valley value van variable variety vast vehicle " +
  "venture version very vessel veteran victim victory video view village violence virtual virus visible vision " +
  "visit visual vital voice volume vote wage wait wake walk wall want war warm warn wash waste watch water wave " +
  "way weak wealth weapon wear weather web wedding week weekend weigh weight welcome welfare well west wet what " +
  "wheat wheel when where whether which while whisper white whole whom whose why wide widely wife wild will win " +
  "wind window wine wing winner winter wire wise wish witness woman wonder wood wool word work worker world " +
  "worry worth would wound wrap write writer wrong yard yeah year yellow yes yesterday yet yield young your " +
  "yourself youth zone"
).split(/\s+/);

const FREQ_RANK: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (let i = 0; i < FREQ_WORDS.length; i++) {
    if (m[FREQ_WORDS[i]] === undefined) m[FREQ_WORDS[i]] = Object.keys(m).length;
  }
  return m;
})();
export const FREQ_N = Object.keys(FREQ_RANK).length;
export function freqRankOf(w: string): number | undefined {
  return FREQ_RANK[w];
}

export function surprisal(ws: string[]): number {
  if (!ws.length) return 0;
  let tot = 0;
  const seen: Record<string, 1> = {};
  const OOV = Math.log2(FREQ_N) + 1.4;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    const r = FREQ_RANK[w];
    if (seen[w]) {
      tot += Math.min(r === undefined ? OOV : Math.log2(r + 2), 5.2);
    } else if (r === undefined) {
      tot += OOV;
    } else {
      tot += Math.log2(r + 2);
    }
    seen[w] = 1;
  }
  return tot / ws.length;
}

/* ---------- chunking constants ---------- */
export const CHUNK_CHARS = 1800;
export const MAX_CHUNKS = 80;
export const MIN_CHUNK_WORDS = 120;
