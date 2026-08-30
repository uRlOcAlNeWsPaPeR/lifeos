import type {
  AIEngine,
  AIProvider,
  AssistantResult,
  BrainDumpItem,
  BrainDumpResult,
  EssayCoachResult,
  EssayHighlight,
  LifeOSContext,
  PrioritizeResult,
} from "./types";
import { HeuristicProvider } from "./heuristic";
import { guessDueDate, tightenTitle } from "./nlp";
import { scoreTasks } from "./score";

/**
 * Shared orchestration for any hosted LLM provider (Claude, Gemini, …).
 *
 * Subclasses only implement `complete(system, user)` — the raw text call.
 * Everything else — the prompts, the strict-JSON contract, the safety nets that
 * strip hallucinated deadlines, and the automatic fallback to the offline
 * heuristic engine — lives here so every provider behaves identically.
 *
 * The model is only ever given `snapshot(ctx)` — the user's own LifeOS data.
 * It is never a general-purpose chatbot.
 */
export abstract class LLMProvider implements AIProvider {
  abstract readonly name: AIEngine;
  protected fallback = new HeuristicProvider();

  /**
   * Raw completion. Must return the model's text output (ideally JSON).
   * `opts.schema` is a JSON-schema the provider MAY use to force the output shape
   * (Gemini honours it; others can ignore it).
   */
  protected abstract complete(
    system: string,
    user: string,
    opts?: { schema?: unknown },
  ): Promise<string>;

  protected snapshot(ctx: LifeOSContext): string {
    const d = (x?: Date | null) => (x ? x.toISOString() : null);
    return JSON.stringify(
      {
        now: ctx.now.toISOString(),
        // Pre-resolved calendar dates so the model never has to compute weekdays
        // itself (LLMs are unreliable at "what date is Friday?").
        dateReference: dateReference(ctx.now),
        profile: ctx.profile,
        tasks: ctx.tasks.map((t) => ({ ...t, dueAt: d(t.dueAt) })),
        goals: ctx.goals.map((g) => ({ ...g, dueAt: d(g.dueAt) })),
        courses: ctx.courses,
        assignments: ctx.assignments.map((a) => ({ ...a, dueAt: d(a.dueAt) })),
        events: ctx.events.map((e) => ({ ...e, startAt: d(e.startAt), endAt: d(e.endAt) })),
      },
      null,
      1,
    );
  }

  private async json<T>(
    system: string,
    user: string,
    opts?: { schema?: unknown },
  ): Promise<T> {
    const raw = (await this.complete(system, user, opts)).trim();
    return JSON.parse(extractJsonObject(raw)) as T;
  }

  async parseBrainDump(text: string, ctx: LifeOSContext): Promise<BrainDumpResult> {
    try {
      const system = BRAIN_DUMP_SYSTEM;
      const user =
        `Today is ${ctx.now.toDateString()}.\n\n` +
        `Reference data (course list + weekday→date map — use ONLY for matching, never copy tasks from it):\n` +
        `${brainDumpContext(ctx)}\n\n` +
        `The student's brain dump:\n"""${text.slice(0, 4000)}"""`;

      const parsed = await this.json<{ items?: unknown; summary?: unknown }>(system, user, {
        schema: BRAIN_DUMP_SCHEMA,
      });

      // ---- validate the shape (section 14) ----
      if (!parsed || !Array.isArray(parsed.items)) {
        throw new Error("model did not return an items array");
      }

      const textHasAnyDate = guessDueDate(text, ctx.now).explicit;
      const floor = ctx.now.getTime() - 24 * 3600_000; // yesterday
      const ceil = ctx.now.getTime() + 200 * 24 * 3600_000; // ~6.5 months out
      const courseNames = ctx.courses.map((c) => c.name);
      const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
      const seen = new Set<string>();

      const items: BrainDumpItem[] = (parsed.items as Record<string, unknown>[])
        .map((raw): BrainDumpItem | null => {
          const rawTitle = typeof raw?.title === "string" ? raw.title.trim() : "";
          if (!rawTitle) return null;

          const title = tightenTitle(rawTitle);
          const key = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
          if (!key || seen.has(key)) return null; // section 15 — no dup titles
          seen.add(key);

          // Respect the model's own "was this date actually stated?" flag — that's
          // the guard against a date being copied onto a task that never had one.
          let suggestedDueAt =
            typeof raw.suggestedDueAt === "string" && raw.suggestedDueAt ? raw.suggestedDueAt : null;
          if (
            suggestedDueAt &&
            (raw.dueDateWasExplicit !== true ||
              !textHasAnyDate ||
              outOfRange(suggestedDueAt, floor, ceil))
          ) {
            suggestedDueAt = null;
          }

          const cat = typeof raw.category === "string" ? raw.category.trim() : "";
          const category =
            cat &&
            (courseNames.some((n) => n.toLowerCase() === cat.toLowerCase()) || cat.length <= 40)
              ? matchCourseName(cat, courseNames)
              : null;

          const p = String(raw.suggestedPriority ?? "").toLowerCase();

          return {
            title,
            notes:
              typeof raw.notes === "string" && raw.notes.trim()
                ? raw.notes.trim().slice(0, 1500)
                : null,
            category,
            suggestedPriority: (PRIORITIES.has(p) ? p : "medium") as BrainDumpItem["suggestedPriority"],
            suggestedDueAt,
            dueDateWasExplicit: Boolean(suggestedDueAt),
            estimatedMinutes:
              typeof raw.estimatedMinutes === "number" && raw.estimatedMinutes > 0
                ? Math.round(raw.estimatedMinutes)
                : null,
            suggestedSlot:
              typeof raw.suggestedSlot === "string" && raw.suggestedSlot.trim()
                ? raw.suggestedSlot.trim()
                : null,
            reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
          };
        })
        .filter((x): x is BrainDumpItem => x !== null);

      if (!items.length) throw new Error("model returned no usable tasks");

      const summary =
        typeof parsed.summary === "string" && parsed.summary
          ? parsed.summary
          : `Organised into ${items.length} task${items.length === 1 ? "" : "s"}.`;

      return { engine: this.name, items, summary };
    } catch (e) {
      console.error(`[ai:${this.name}] brain dump fell back to heuristic:`, (e as Error).message);
      return this.fallback.parseBrainDump(text, ctx);
    }
  }

  async prioritize(ctx: LifeOSContext): Promise<PrioritizeResult> {
    try {
      const scored = scoreTasks(ctx).slice(0, 8);
      if (!scored.length) return this.fallback.prioritize(ctx);
      const system =
        "You are the LifeOS planning engine. From the student's OPEN tasks, pick the 3 they should do today " +
        "and explain each in one concrete sentence that references their real deadlines / schedule / goals. " +
        'Respond ONLY with minified JSON: {"intro":string,"picks":[{"taskId":string,"title":string,"reason":string}]}. Every taskId MUST come from the candidate list.';
      const parsed = await this.json<PrioritizeResult>(
        system,
        `LifeOS data:\n${this.snapshot(ctx)}\n\nPre-scored candidates (id | title | score):\n${scored
          .map((s) => `${s.id} | ${s.title} | ${s.score}`)
          .join("\n")}`,
      );
      const valid = new Set(ctx.tasks.map((t) => t.id));
      const picks = (parsed.picks ?? []).filter((p) => valid.has(p.taskId)).slice(0, 3);
      if (!picks.length) return this.fallback.prioritize(ctx);
      return { engine: this.name, intro: parsed.intro, picks };
    } catch (e) {
      console.error(`[ai:${this.name}] prioritize fell back to heuristic:`, (e as Error).message);
      return this.fallback.prioritize(ctx);
    }
  }

  async assist(question: string, ctx: LifeOSContext): Promise<AssistantResult> {
    try {
      const system =
        "You are the LifeOS assistant. Answer ONLY using the student's LifeOS data provided. " +
        "Be specific: cite real task / assignment titles and dates. Never give generic advice, never invent items or deadlines. " +
        "If the data doesn't contain the answer, say what the student should add and where. " +
        "Keep the answer to short markdown. " +
        'Respond ONLY with minified JSON: {"answer":string,"references":[{"type":string,"id":string,"title":string}]} where type is one of task|goal|assignment|course|event and id is a real id from the data.';
      const parsed = await this.json<AssistantResult>(
        system,
        `LifeOS data:\n${this.snapshot(ctx)}\n\nStudent question: "${question}"`,
      );
      return {
        engine: this.name,
        answer: parsed.answer,
        references: Array.isArray(parsed.references) ? parsed.references : [],
      };
    } catch (e) {
      console.error(`[ai:${this.name}] assistant fell back to heuristic:`, (e as Error).message);
      return this.fallback.assist(question, ctx);
    }
  }

  async essayCoach(essay: string): Promise<EssayCoachResult> {
    try {
      const system =
        "You are a supportive but rigorous writing coach for a student essay. Respond ONLY with valid JSON.";
      const user = buildCoachPrompt(essay.slice(0, 24_000));
      const parsed = await this.json<{
        summary?: unknown;
        scores?: unknown;
        highlights?: unknown;
      }>(system, user, { schema: ESSAY_COACH_SCHEMA });

      const scores: Record<string, number> = {};
      if (parsed.scores && typeof parsed.scores === "object") {
        for (const [k, v] of Object.entries(parsed.scores as Record<string, unknown>)) {
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(n)) scores[k] = Math.max(0, Math.min(100, Math.round(n)));
        }
      }

      const seen = new Set<string>();
      const highlights: EssayHighlight[] = (
        Array.isArray(parsed.highlights) ? (parsed.highlights as Record<string, unknown>[]) : []
      )
        .map((h): EssayHighlight | null => {
          const quote = typeof h?.quote === "string" ? h.quote.trim() : "";
          // The quote MUST be locatable verbatim in the essay — same guard the
          // Klarity UI applies at render time, done here so bad rows never ship.
          if (!quote || !essay.includes(quote) || seen.has(quote)) return null;
          seen.add(quote);
          const revisions = Array.isArray(h.revisions)
            ? (h.revisions as unknown[])
                .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
                .slice(0, 4)
            : [];
          return {
            quote,
            issue: typeof h.issue === "string" && h.issue.trim() ? h.issue.trim() : "Revise",
            why: typeof h.why === "string" ? h.why.trim() : "",
            revisions,
          };
        })
        .filter((x): x is EssayHighlight => x !== null);

      return {
        engine: this.name,
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
        scores,
        highlights,
      };
    } catch (e) {
      console.error(`[ai:${this.name}] essay coach fell back to heuristic:`, (e as Error).message);
      return this.fallback.essayCoach(essay);
    }
  }
}

/* ----------------------------- essay coach ----------------------------- */

function buildCoachPrompt(essayText: string): string {
  return (
    "You are a supportive but rigorous writing coach for a student essay. Do NOT rewrite the essay yourself. " +
    "Instead, identify specific sentences or short phrases that could be improved, and explain why.\n\n" +
    "Evaluate: thesis strength, organization, flow, clarity, evidence quality, counterarguments, grammar, style, " +
    "word choice, transitions, repetition, and paragraph structure.\n\n" +
    "Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:\n" +
    "{\n" +
    '  "summary": "2-3 sentence overall assessment of the essay",\n' +
    '  "scores": {"thesis": 0-100, "organization": 0-100, "clarity": 0-100, "evidence": 0-100, "grammar": 0-100, "style": 0-100},\n' +
    '  "highlights": [ {\n' +
    '    "quote": "the exact sentence or phrase copied verbatim from the essay below",\n' +
    '    "issue": "short 2-5 word label, e.g. Weak thesis, Unsupported claim, Awkward transition",\n' +
    '    "why": "1-3 sentence explanation of why this could be improved",\n' +
    '    "revisions": ["revision option 1", "revision option 2", "revision option 3 (optional)"]\n' +
    "  } ]\n" +
    "}\n\n" +
    "Aim for 6-14 highlights spread across the whole essay, ordered by where they appear in the text. " +
    'The "quote" field MUST be copied exactly, character-for-character, from the essay text below so it can be located.\n\n' +
    "ESSAY:\n" +
    essayText
  );
}

const ESSAY_COACH_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    scores: {
      type: "object",
      properties: {
        thesis: { type: "number" },
        organization: { type: "number" },
        clarity: { type: "number" },
        evidence: { type: "number" },
        grammar: { type: "number" },
        style: { type: "number" },
      },
    },
    highlights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string" },
          issue: { type: "string" },
          why: { type: "string" },
          revisions: { type: "array", items: { type: "string" } },
        },
        required: ["quote", "issue"],
        propertyOrdering: ["quote", "issue", "why", "revisions"],
      },
    },
  },
  required: ["summary", "highlights"],
} as const;

/* ----------------------------- brain dump ----------------------------- */

const BRAIN_DUMP_SYSTEM = [
  "You are LifeOS's task organiser. A student types a messy, run-on brain dump; you turn it into a clean JSON LIST of separate tasks. Messy thoughts in, organised tasks out.",
  "",
  "SPLITTING — the #1 rule:",
  "- A brain dump almost always holds SEVERAL separate to-dos. Output one task object per distinct action. Most dumps yield 3–8 tasks.",
  '- Example: "finish calc homework tonight, study for physics Friday, email my counselor, and work on my research paper" → FOUR tasks: "Finish calculus homework", "Study for physics", "Email counselor", "Work on research paper".',
  "- Different verbs = different tasks, EVEN when they refer to the same assignment.",
  '- "finish my essay, find three sources for it, and submit it on Canvas" → THREE tasks: "Finish English essay", "Find three sources", "Submit English essay". ("find sources" and "submit" are actions the student must DO — not details.)',
  "- NEVER put the whole brain dump into one task. NEVER invent a task the student didn't mention.",
  "",
  "DETAIL vs TASK — the test:",
  "- A DETAIL describes a property of a task: how long, what format, what it covers, specific problems/pages, who requires it, instructions. It goes in that task's `notes`.",
  "- A TASK is something the student has to DO. If the student names an action, it is its own task.",
  '- "Finish my essay. It has to be 5 pages and use 3 sources" → ONE task "Finish English essay", notes "Must be 5 pages and use 3 sources" (5 pages / 3 sources are properties, not actions).',
  "",
  "TITLES (`title`): 2–7 words, plain and scannable — \"Finish calculus homework\", \"Study for physics\", \"Email counselor\", \"Submit English essay\". No full sentences, no requirement lists, no dates in the title.",
  "",
  "NOTES (`notes`): put EVERY supporting detail here for that task, rephrased cleanly and completely — page counts, source counts, question numbers, instructions, who requires what. Organise, do not summarise information away. null when the student gave no detail for that task.",
  "",
  "DUE DATE (`suggestedDueAt`): ONLY when the student explicitly stated a day/date FOR THAT SPECIFIC TASK. If they said \"physics test Friday\" the Friday date is on the physics task ONLY — do NOT copy it to the email or the paper. If a task has no stated date: suggestedDueAt=null AND dueDateWasExplicit=false. Resolve \"Friday\"/\"tomorrow\"/\"next week\" via the weekday→date map; output ISO YYYY-MM-DD. Set dueDateWasExplicit=true ONLY when the student stated that task's date. Never guess, never spread one date across tasks.",
  "",
  "SUBJECT (`category`): if the student names a class that appears in the `courses` list, set `category` to that exact course name. If they name a subject not in the list, use the plain subject word (\"Physics\"). Otherwise null. Never invent a class.",
  "",
  "PRIORITY (`suggestedPriority` ∈ low|medium|high|urgent): base it ONLY on urgency the student expressed (\"ASAP\", \"really important\", \"highest priority\") or a stated due date within ~2 days. Do NOT make everything high just because it's schoolwork. Default \"medium\".",
  "",
  "OTHER: `estimatedMinutes` a realistic integer or null; `suggestedSlot` a short phrase for when to do it or null; `reasoning` one short sentence.",
  "",
  'Output ONLY minified JSON: {"items":[{"title","notes","category","suggestedPriority","suggestedDueAt","dueDateWasExplicit","estimatedMinutes","suggestedSlot","reasoning"}],"summary"}. `summary` is one sentence on what you organised.',
].join("\n");

// Kept deliberately loose — its only job is to GUARANTEE `items` is an array of
// task objects (that's the fix for "everything in one task"). Nullability and
// defaults are handled in the post-processing below, so no `nullable` here
// (some API versions reject it and 400 the whole request).
const BRAIN_DUMP_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          notes: { type: "string" },
          category: { type: "string" },
          suggestedPriority: { type: "string" },
          suggestedDueAt: { type: "string" },
          dueDateWasExplicit: { type: "boolean" },
          estimatedMinutes: { type: "number" },
          suggestedSlot: { type: "string" },
          reasoning: { type: "string" },
        },
        required: ["title"],
        propertyOrdering: [
          "title",
          "notes",
          "category",
          "suggestedPriority",
          "suggestedDueAt",
          "dueDateWasExplicit",
          "estimatedMinutes",
          "suggestedSlot",
          "reasoning",
        ],
      },
    },
    summary: { type: "string" },
  },
  required: ["items"],
} as const;

/** Just what brain dump needs — NOT the full LifeOS dump (that only confuses splitting). */
function brainDumpContext(ctx: LifeOSContext): string {
  return JSON.stringify({
    today: ctx.now.toISOString().slice(0, 10),
    weekdayDates: dateReference(ctx.now),
    courses: ctx.courses.map((c) => c.name),
  });
}

function outOfRange(iso: string, floor: number, ceil: number): boolean {
  const t = Date.parse(iso);
  return Number.isNaN(t) || t < floor || t > ceil;
}

function matchCourseName(value: string, courseNames: string[]): string {
  const hit = courseNames.find((n) => n.toLowerCase() === value.toLowerCase());
  return hit ?? value;
}

/**
 * Pull the first balanced JSON object out of a model response, tolerating
 * ```json fences, leading prose, and trailing commentary. Brace counting
 * ignores braces that appear inside strings.
 */
export function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("no JSON object in model output");

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error("unterminated JSON object in model output");
}

/**
 * The next 15 days as `{ "Friday": "2026-08-28", ... }` plus explicit
 * today/tonight/tomorrow keys. The model looks a weekday up instead of
 * doing calendar math. Only the FIRST occurrence of each weekday name is
 * kept, so "Friday" always resolves to the nearest upcoming Friday.
 */
function dateReference(now: Date): Record<string, string> {
  const iso = (d: Date) => {
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 10);
  };
  const ref: Record<string, string> = {
    today: iso(now),
    tonight: iso(now),
  };
  for (let i = 0; i < 15; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    if (i === 1) ref.tomorrow = iso(d);
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    if (i > 0 && !(weekday in ref)) ref[weekday] = iso(d);
    if (i === 7) ref["next week"] = iso(d);
  }
  return ref;
}
