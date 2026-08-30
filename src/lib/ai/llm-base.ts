import type {
  AIEngine,
  AIProvider,
  AssistantResult,
  BrainDumpItem,
  BrainDumpResult,
  LifeOSContext,
  PrioritizeResult,
} from "./types";
import { HeuristicProvider } from "./heuristic";
import { guessDueDate } from "./nlp";
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

  /** Raw completion. Must return the model's text output (ideally JSON). */
  protected abstract complete(system: string, user: string): Promise<string>;

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

  private async json<T>(system: string, user: string): Promise<T> {
    const raw = (await this.complete(system, user)).trim();
    return JSON.parse(extractJsonObject(raw)) as T;
  }

  async parseBrainDump(text: string, ctx: LifeOSContext): Promise<BrainDumpResult> {
    try {
      const system =
        "You convert a student's messy brain dump into structured tasks for the LifeOS app. " +
        "Rules: (1) NEVER invent a due date — only set suggestedDueAt (ISO 8601) when the student explicitly stated a day/date; otherwise null and dueDateWasExplicit=false. " +
        "(2) Titles must be short and action-oriented (e.g. 'Study for Physics'). " +
        "(3) Estimate realistic minutes. (4) suggestedPriority in {low,medium,high,urgent}. " +
        "(5) suggestedSlot is a short human phrase or null. (6) reasoning is one short sentence. " +
        'Respond ONLY with minified JSON of shape: {"items":[{"title":string,"category":string|null,"suggestedPriority":string,"suggestedDueAt":string|null,"dueDateWasExplicit":boolean,"estimatedMinutes":number|null,"suggestedSlot":string|null,"reasoning":string}],"summary":string}';
      const parsed = await this.json<{ items: BrainDumpItem[]; summary: string }>(
        system,
        `Today is ${ctx.now.toDateString()}. Use the dateReference in the data for any weekday the student names.\n\n` +
          `Student's LifeOS data:\n${this.snapshot(ctx)}\n\nBrain dump:\n"""${text}"""`,
      );

      const textHasAnyDate = guessDueDate(text, ctx.now).explicit;
      const floor = ctx.now.getTime() - 24 * 3600_000; // yesterday
      const ceil = ctx.now.getTime() + 200 * 24 * 3600_000; // ~6.5 months out

      const items = parsed.items.map((it) => {
        // (1) The whole dump has no date words at all → nothing may be dated.
        if (!textHasAnyDate && it.suggestedDueAt) {
          return { ...it, suggestedDueAt: null, dueDateWasExplicit: false };
        }
        // (2) Drop model dates that landed in the past or absurdly far out —
        //     almost always a weekday-math mistake.
        if (it.suggestedDueAt) {
          const t = Date.parse(it.suggestedDueAt);
          if (Number.isNaN(t) || t < floor || t > ceil) {
            return { ...it, suggestedDueAt: null, dueDateWasExplicit: false };
          }
        }
        return { ...it, dueDateWasExplicit: Boolean(it.suggestedDueAt) };
      });
      return { engine: this.name, items, summary: parsed.summary };
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
