import { sanitizeScript, wordBudget } from "@/lib/podcast/script";
import type { PodcastOptions } from "@/lib/podcast/types";
import type {
  AIEngine,
  AIProvider,
  AssistantMessage,
  AssistantResult,
  BrainDumpItem,
  BrainDumpResult,
  GenerateCardsResult,
  GeneratePodcastResult,
  LifeOSContext,
  PrioritizeResult,
} from "./types";
import { dedupeCards } from "@/lib/practice/parse";
import { HeuristicProvider } from "./heuristic";
import { sanitizeActions } from "./actions";
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
  protected fallback: AIProvider = new HeuristicProvider();
  /** Set true by a subclass whose `complete()` actually reads `opts.image`. */
  protected supportsVision = false;

  /**
   * Chain another provider ahead of the offline heuristic. `getAI()` uses this
   * to wire Gemini → Anthropic → heuristic (or vice versa) so a rate limit or
   * outage on the primary provider tries the other hosted model before the
   * student ever sees the offline engine.
   */
  setFallback(next: AIProvider): void {
    this.fallback = next;
  }

  /**
   * Raw completion. Must return the model's text output (ideally JSON).
   * `opts.schema` is a JSON-schema the provider MAY use to force the output shape
   * (Gemini honours it; others can ignore it).
   */
  protected abstract complete(
    system: string,
    user: string,
    opts?: { schema?: unknown; image?: { mimeType: string; data: string } },
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
    opts?: { schema?: unknown; image?: { mimeType: string; data: string } },
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

      if (!parsed || !Array.isArray(parsed.items)) {
        throw new Error("model did not return an items array");
      }

      const textHasAnyDate = guessDueDate(text, ctx.now).explicit;
      const items = buildBrainDumpItems(parsed.items as Record<string, unknown>[], ctx, {
        trustModelDates: textHasAnyDate,
      });
      if (!items.length) throw new Error("model returned no usable tasks");

      const summary =
        typeof parsed.summary === "string" && parsed.summary
          ? parsed.summary
          : `Organized into ${items.length} task${items.length === 1 ? "" : "s"}.`;

      return { engine: this.name, items, summary };
    } catch (e) {
      console.error(`[ai:${this.name}] brain dump fell back to heuristic:`, (e as Error).message);
      return this.fallback.parseBrainDump(text, ctx);
    }
  }

  async parseBrainDumpImage(
    imageBase64: string,
    mimeType: string,
    ctx: LifeOSContext,
  ): Promise<BrainDumpResult> {
    // Providers whose `complete()` doesn't actually read `opts.image` would
    // otherwise silently answer from the text prompt alone and hallucinate
    // "tasks" — skip straight to the next link in the chain instead.
    if (!this.supportsVision) {
      return this.fallback.parseBrainDumpImage(imageBase64, mimeType, ctx);
    }
    try {
      const system = BRAIN_DUMP_IMAGE_SYSTEM;
      const user =
        `Today is ${ctx.now.toDateString()}.\n\n` +
        `Reference data (course list + weekday→date map — use ONLY for matching, never invent tasks from it):\n` +
        `${brainDumpContext(ctx)}\n\n` +
        `Read the attached screenshot and extract every assignment/task visible in it.`;

      const parsed = await this.json<{ items?: unknown; summary?: unknown }>(system, user, {
        schema: BRAIN_DUMP_SCHEMA,
        image: { mimeType, data: imageBase64 },
      });

      if (!parsed || !Array.isArray(parsed.items)) {
        throw new Error("model did not return an items array");
      }

      // No source text to cross-check against — the screenshot IS the source,
      // so trust the model's own dueDateWasExplicit flag directly.
      const items = buildBrainDumpItems(parsed.items as Record<string, unknown>[], ctx, {
        trustModelDates: true,
      });
      // A clean read that genuinely found nothing is a real answer ("this
      // isn't a screenshot of assignments"), not a provider failure — return
      // it as-is instead of throwing, which would otherwise cascade through
      // every fallback and surface as a misleading "AI unavailable" error for
      // what's actually just a bad or irrelevant screenshot.

      const summary =
        typeof parsed.summary === "string" && parsed.summary
          ? parsed.summary
          : `Found ${items.length} item${items.length === 1 ? "" : "s"} in the screenshot.`;

      return { engine: this.name, items, summary };
    } catch (e) {
      console.error(`[ai:${this.name}] image brain dump fell back:`, (e as Error).message);
      return this.fallback.parseBrainDumpImage(imageBase64, mimeType, ctx);
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

  async generateCards(notes: string, title: string | null): Promise<GenerateCardsResult> {
    try {
      const parsed = await this.json<{ cards?: unknown }>(
        CARDS_SYSTEM,
        `${title ? `Deck topic: ${title}\n\n` : ""}The student's notes:\n"""${notes.slice(0, 12000)}"""`,
        { schema: CARDS_SCHEMA },
      );
      if (!parsed || !Array.isArray(parsed.cards)) throw new Error("model did not return a cards array");

      const cards = dedupeCards(
        (parsed.cards as Record<string, unknown>[])
          .map((c) => ({
            front: typeof c?.front === "string" ? c.front.trim() : "",
            back: typeof c?.back === "string" ? c.back.trim() : "",
          }))
          .filter((c) => c.front && c.back),
      );
      if (!cards.length) throw new Error("model returned no usable cards");
      return { engine: this.name, cards };
    } catch (e) {
      console.error(`[ai:${this.name}] card generation fell back to heuristic:`, (e as Error).message);
      return this.fallback.generateCards(notes, title);
    }
  }

  async generatePodcast(notes: string, opts: PodcastOptions): Promise<GeneratePodcastResult> {
    try {
      const budget = wordBudget(opts.targetMinutes);
      const parsed = await this.json<unknown>(
        PODCAST_SYSTEM,
        [
          opts.title ? `Episode topic: ${opts.title}` : "",
          opts.subject ? `Subject: ${opts.subject}` : "",
          `Format: ${opts.format === "duo" ? "TWO hosts in conversation" : "ONE host, solo"}`,
          `Target length: about ${opts.targetMinutes} minutes, which is roughly ${budget} spoken words. Get within 10% of that.`,
          "",
          `The student's notes:\n"""${notes.slice(0, 12000)}"""`,
        ]
          .filter(Boolean)
          .join("\n"),
        { schema: PODCAST_SCHEMA },
      );

      const script = sanitizeScript(parsed, opts.format);
      if (!script) throw new Error("model did not return a usable script");
      // A two-host episode with only one speaker is a failed brief, not a
      // stylistic choice — the student picked a second voice that would sit
      // silent, so fall back rather than ship it.
      if (opts.format === "duo" && !script.segments.some((x) => x.speaker === "cohost")) {
        throw new Error("model returned a solo script for a two-host episode");
      }
      return { engine: this.name, script };
    } catch (e) {
      console.error(`[ai:${this.name}] podcast generation fell back:`, (e as Error).message);
      return this.fallback.generatePodcast(notes, opts);
    }
  }

  async assist(messages: AssistantMessage[], ctx: LifeOSContext): Promise<AssistantResult> {
    try {
      const transcript = messages
        .slice(-12)
        .map((m) => `${m.role === "user" ? "Student" : "You"}: ${m.content}`)
        .join("\n");
      const parsed = await this.json<{
        answer?: unknown;
        references?: unknown;
        actions?: unknown;
      }>(
        ASSIST_SYSTEM,
        `LifeOS data (ids are real — use them verbatim):\n${this.snapshot(ctx)}\n\n` +
          `Conversation so far:\n${transcript}`,
      );

      const actions = sanitizeActions(parsed.actions, ctx);
      const answer =
        typeof parsed.answer === "string" && parsed.answer.trim()
          ? parsed.answer.trim()
          : actions.length
            ? "Here's what I can do — confirm below."
            : "";
      if (!answer && !actions.length) throw new Error("empty assistant response");

      return {
        engine: this.name,
        answer,
        references: Array.isArray(parsed.references) ? parsed.references : [],
        actions,
      };
    } catch (e) {
      console.error(`[ai:${this.name}] assistant fell back to heuristic:`, (e as Error).message);
      return this.fallback.assist(messages, ctx);
    }
  }
}

const ASSIST_SYSTEM = [
  "You are the LifeOS assistant for a student. You work ONLY from the student's own LifeOS data (tasks, goals, courses, assignments, events) provided with each message — never the open web, never generic advice.",
  "",
  "ANSWERING: be specific and cite real titles and dates from the data. Keep `answer` to short markdown. If the data can't answer something, say what to add and where. Populate `references` with the real ids you mention (type ∈ task|goal|assignment|course|event).",
  "",
  "FORMAT: never answer a \"what should I work on\" / \"what's due\" / \"what's on my plate\" style question as one run-on sentence. Structure it — a short bold lead-in line, then one real markdown bullet per item (`- **Title** — why/when`), each on its own line. Only use a plain sentence or two for a genuinely single-fact answer (e.g. \"when is X due\").",
  "",
  "STATUS: a task with `status: \"done\"`, or an assignment whose `status` is anything other than `\"open\"` (`submitted`, `graded`, or `done` — `done` means the student marked it complete in LifeOS even if Canvas still calls it open), is already finished. Never recommend it, list it as something to work on, or otherwise suggest starting it — treat it exactly like it isn't there for that purpose. Only mention a finished item if the student explicitly asks what they've already done or completed.",
  "",
  "DOING THINGS — the student can also ask you to add or remove items. You never change data yourself; you PROPOSE changes in `actions` and the student taps to confirm. Only ever propose an action the student clearly asked for in this conversation.",
  "",
  "Action kinds:",
  '- {"kind":"add_task","title":string,"dueAt":ISO date or null,"priority":"low|medium|high|urgent","notes":string or null,"courseId":a real course id or null}',
  '- {"kind":"add_course","name":string,"code":string or null,"instructor":string or null}',
  '- {"kind":"add_assignment","courseId":a real course id,"title":string,"dueAt":ISO date or null,"pointsPossible":number or null}',
  '- {"kind":"complete_task","id":a real OPEN task id}',
  '- {"kind":"delete_task","id":a real task id}',
  '- {"kind":"delete_course","id":a real course id}   (also removes its assignments)',
  '- {"kind":"delete_assignment","id":a real assignment id}',
  "",
  "ASK BEFORE YOU ACT — do NOT emit an action until you have what you need. Ask ONE short follow-up question in `answer` (and send an empty `actions` array) when anything below is missing or ambiguous:",
  "- add a course → you need the course name; ask for the teacher too (it's folded into the name) and, if the student mentions class times, capture them in the answer but note LifeOS tracks meeting times on the calendar, not the course.",
  "- add an assignment → you need which course (match it to a course in the data and use that courseId — if you can't tell which, ask) and ideally a due date; ask for the due date and points if not given.",
  "- add a task → a due date and which class it's for make it far more useful; ask if the student didn't say.",
  "- delete anything → if more than one item matches what they described, list the matches and ask which; never guess.",
  "Once the student answers, emit the action(s). Confirmations like \"yes do it\" refer to what you just proposed.",
  "",
  "Never invent an id. Never propose a deletion the student didn't ask for. Dates must be real calendar dates (resolve \"Friday\"/\"tomorrow\" against the dateReference map).",
  "",
  'Respond ONLY with minified JSON: {"answer":string,"references":[{"type":string,"id":string,"title":string}],"actions":[...]}. `actions` is usually [].',
].join("\n");

/* ------------------------------ practice ------------------------------ */

const CARDS_SYSTEM = [
  "You turn a student's own notes into study flashcards. Notes in, cards out.",
  "",
  "SOURCE — the hard rule: every card must be answerable FROM THE NOTES PROVIDED. Never add a fact the notes don't contain, however well you know the subject. If the notes are thin, return fewer cards. Returning 6 solid cards beats returning 25 with invented answers.",
  "",
  "WHAT EARNS A CARD: a term with a definition, a cause and its effect, a date and its event, a formula and what it computes, a person and what they did, a process and its steps. Skip anything that is only administrative (due dates, 'study for this', page numbers) or too vague to have one answer.",
  "",
  "FRONT: the prompt — a term or a direct question. Short, 1–8 words where possible. It must be specific enough to have exactly one right answer; \"What is it?\" is useless, \"Osmosis\" or \"What year did the Berlin Wall fall?\" is not.",
  "",
  "BACK: the answer, in the student's own terms from the notes, rewritten to be clean and self-contained. Aim for under 20 words. Do NOT restate the front. Do NOT begin with \"It is\" or \"This is\".",
  "",
  "COVERAGE: cover the whole set of notes, not just the opening paragraph. Don't write two cards that test the same fact.",
  "",
  'Output ONLY minified JSON: {"cards":[{"front":string,"back":string}]}. Aim for 8–25 cards, fewer when the notes are short.',
].join("\n");

/* ------------------------------- podcast ------------------------------ */

const PODCAST_SYSTEM = [
  "You are LifeOS's study-podcast writer. A student gives you their own class notes; you turn them into a script they can listen to while walking or on the bus.",
  "",
  "Return STRICT JSON: { title, summary, segments: [{ speaker, kind, text }] }.",
  "",
  "THE ONE RULE THAT MATTERS: every fact you state must come from the student's notes. You are re-teaching their material, not adding to it. You may explain, rephrase, give an analogy for, or connect ideas that are already in the notes. You may NOT introduce a date, number, name, definition or claim that isn't there. If the notes are thin, go deeper on what they do say — never pad with outside content. A student revising from this will assume everything they hear is examinable.",
  "",
  "SPEAKER: \"host\" or \"cohost\". For a solo episode use \"host\" for every segment. For a two-host episode, write a real conversation — the co-host asks the question the student would ask, pushes back, or says the idea back in plainer words. Alternate naturally; don't just bolt one co-host line onto the end.",
  "",
  "KIND: \"intro\" to open, \"point\" for teaching a piece of the material, \"aside\" for a co-host reaction or a quick clarifier, \"recap\" to pull it together near the end, \"outro\" to close.",
  "",
  "TEXT: what is actually spoken, so write for the ear. Full sentences, no bullet points, no markdown, no stage directions, no \"[pause]\", no speaker labels inside the text. Numbers and symbols spelled out the way you'd say them (\"thirty-six ATP\", \"H two O\"). Keep each segment to one turn of speech — a few sentences, not an essay.",
  "",
  "STRUCTURE: open by saying what the episode covers, teach the material in the order the notes present it, recap the key points, then close. Sound like a person talking to one student, not a lecture or an advert.",
  "",
  "LENGTH: match the requested runtime. Spread the budget across segments rather than writing one enormous block.",
].join("\n");

const PODCAST_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: { type: "string", enum: ["host", "cohost"] },
          kind: { type: "string", enum: ["intro", "point", "aside", "recap", "outro"] },
          text: { type: "string" },
        },
        required: ["speaker", "kind", "text"],
        propertyOrdering: ["speaker", "kind", "text"],
      },
    },
  },
  required: ["title", "summary", "segments"],
} as const;

const CARDS_SCHEMA = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: { front: { type: "string" }, back: { type: "string" } },
        required: ["front", "back"],
        propertyOrdering: ["front", "back"],
      },
    },
  },
  required: ["cards"],
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

const BRAIN_DUMP_IMAGE_SYSTEM = [
  "You are LifeOS's task organiser, reading a STUDENT-SUPPLIED SCREENSHOT instead of typed text — a Canvas/Google Classroom page, a planner app, a printed syllabus, a whiteboard photo, or a school portal. Turn every assignment/task visible in it into a clean JSON LIST of separate tasks.",
  "",
  "SPLITTING — one task object per distinct assignment/to-do shown. A course list or assignments table almost always holds SEVERAL items — extract each one separately, don't merge them. Scan the ENTIRE image top to bottom, including anything past the first screenful or below the fold — do not stop after the first one or two items just because they're the clearest.",
  "",
  "ONLY what's actually visible: transcribe real assignment/task names and dates from the image. NEVER invent an item that isn't shown, and ignore UI chrome that isn't a task — navigation bars, ads, unrelated sidebar content, the app's own branding.",
  "",
  "TITLES (`title`): 2–7 words, plain and scannable, taken from the assignment name shown (tighten a long official title down, don't just truncate it).",
  "",
  "NOTES (`notes`): any extra detail visible for that item — instructions, points, topics. null when nothing else is shown.",
  "",
  "DUE DATE (`suggestedDueAt`): only when a date is actually printed/shown for that specific item. Resolve a bare weekday via the weekday→date map; output ISO YYYY-MM-DD. Set dueDateWasExplicit=true only when you read a real date off the image for that item — never guess or copy one item's date onto another.",
  "",
  "SUBJECT (`category`): the course/class name shown for that item if any, matched to the `courses` list when it appears there; otherwise the plain subject word, else null.",
  "",
  "PRIORITY (`suggestedPriority` ∈ low|medium|high|urgent): default \"medium\" unless the image itself marks something urgent/overdue.",
  "",
  "GRADEBOOK LAYOUT — a Canvas-style gradebook screenshot has TWO different kinds of row, and mixing them up is the single most common mistake here: a bold CATEGORY row (e.g. \"Formative  Weight: 30\") carrying that category's own subtotal, followed by several plain ASSIGNMENT rows indented under it (icon, title, due date, and — only sometimes — a score). The category row's number belongs ONLY to the category. It is never that section's first, last, or any assignment's own grade, no matter how close together they sit or how tempting it is to fill in a blank.",
  "",
  "GRADE — a score belongs to one specific assignment ONLY when it's printed on that exact assignment's own row, sharing the line with its title and due date:",
  '- A raw score like "18/20" or "45/50" on the item\'s own row: put the first number in `pointsEarned`, the second in `pointsPossible`.',
  '- A points-possible-only value with no score yet ("20 pts", "Out of 50") on the item\'s own row: `pointsPossible` only, `pointsEarned` null — NOT graded.',
  '- A letter or percent on the item\'s own row with no raw point score ("A-", "92%"): `gradeValue` verbatim, `pointsEarned`/`pointsPossible` null.',
  '- The item\'s own row has no "Turned In" tag and no number on it at all: `pointsEarned`, `pointsPossible`, and `gradeValue` are ALL null. This is the normal, common case — do not fill these in from the category row above it, from a different assignment, or from anywhere else just to avoid an empty field. An unscored item staying unscored is correct, not a mistake to fix.',
  "",
  "OTHER: `estimatedMinutes` a realistic integer or null; `suggestedSlot` null (screenshots rarely state one); `reasoning` one short sentence.",
  "",
  'Output ONLY minified JSON: {"items":[{"title","notes","category","suggestedPriority","suggestedDueAt","dueDateWasExplicit","estimatedMinutes","suggestedSlot","reasoning","pointsPossible","pointsEarned","gradeValue"}],"summary"}. `summary` is one sentence on what you found. If the image has no readable assignments/tasks, return {"items":[],"summary":"..."}.',
].join("\n");

/**
 * Shared post-processing for both the text and image brain-dump paths —
 * dedupes by title, clamps dates to a sane window, and only lets a due date
 * through when the caller trusts the model's own `dueDateWasExplicit` flag
 * (text path additionally requires the raw text to contain SOME date at all,
 * as a guard against a hallucinated deadline; the image path has no text to
 * check against, so the screenshot itself is the source of truth).
 */
function buildBrainDumpItems(
  rawItems: Record<string, unknown>[],
  ctx: LifeOSContext,
  opts: { trustModelDates: boolean },
): BrainDumpItem[] {
  const floor = ctx.now.getTime() - 24 * 3600_000; // yesterday
  const ceil = ctx.now.getTime() + 200 * 24 * 3600_000; // ~6.5 months out
  const courseNames = ctx.courses.map((c) => c.name);
  const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
  const seen = new Set<string>();

  return rawItems
    .map((raw): BrainDumpItem | null => {
      const rawTitle = typeof raw?.title === "string" ? raw.title.trim() : "";
      if (!rawTitle) return null;

      const title = tightenTitle(rawTitle);
      const key = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (!key || seen.has(key)) return null; // no dup titles
      seen.add(key);

      // Respect the model's own "was this date actually stated?" flag — that's
      // the guard against a date being copied onto a task that never had one.
      let suggestedDueAt =
        typeof raw.suggestedDueAt === "string" && raw.suggestedDueAt ? raw.suggestedDueAt : null;
      if (
        suggestedDueAt &&
        (raw.dueDateWasExplicit !== true ||
          !opts.trustModelDates ||
          outOfRange(suggestedDueAt, floor, ceil))
      ) {
        suggestedDueAt = null;
      }

      const cat = typeof raw.category === "string" ? raw.category.trim() : "";
      const category =
        cat && (courseNames.some((n) => n.toLowerCase() === cat.toLowerCase()) || cat.length <= 40)
          ? matchCourseName(cat, courseNames)
          : null;

      const p = String(raw.suggestedPriority ?? "").toLowerCase();

      return {
        title,
        notes:
          typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim().slice(0, 1500) : null,
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
        pointsPossible:
          typeof raw.pointsPossible === "number" && raw.pointsPossible > 0
            ? raw.pointsPossible
            : null,
        pointsEarned:
          typeof raw.pointsEarned === "number" && raw.pointsEarned >= 0 ? raw.pointsEarned : null,
        gradeValue:
          typeof raw.gradeValue === "string" && raw.gradeValue.trim()
            ? raw.gradeValue.trim().slice(0, 20)
            : null,
      };
    })
    .filter((x): x is BrainDumpItem => x !== null);
}

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
          pointsPossible: { type: "number" },
          pointsEarned: { type: "number" },
          gradeValue: { type: "string" },
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
          "pointsPossible",
          "pointsEarned",
          "gradeValue",
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
