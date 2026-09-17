import type {
  AIProvider,
  AssistantMessage,
  AssistantResult,
  AssistantReference,
  BrainDumpItem,
  BrainDumpResult,
  GenerateCardsResult,
  LifeOSContext,
  PrioritizeResult,
} from "./types";
import { cardsFromNotes, dedupeCards } from "@/lib/practice/parse";
import {
  consolidateFragments,
  derivePriority,
  estimateMinutes,
  guessCategory,
  guessDueDate,
  normalizeTask,
  splitFragments,
} from "./nlp";
import { fmtSlot, freeSlots } from "./scheduling";
import { relativeDue, scoreTasks } from "./score";

/**
 * Fully-working, offline AI engine. No network, no API key.
 * Deterministic parsing + scoring that gives students real structure.
 */
export class HeuristicProvider implements AIProvider {
  readonly name = "heuristic" as const;

  /**
   * Offline card generation: lift the sentences that are already shaped like a
   * definition. Deliberately conservative — it would rather return three solid
   * cards than twenty made-up ones, and it never invents an answer.
   */
  async generateCards(notes: string, _title: string | null): Promise<GenerateCardsResult> {
    void _title;
    return { engine: this.name, cards: dedupeCards(cardsFromNotes(notes)) };
  }

  /** No OCR/vision offline — reading a screenshot needs a hosted AI provider. */
  async parseBrainDumpImage(): Promise<BrainDumpResult> {
    const err = new Error(
      "Screenshot import needs LifeOS AI, which isn't available right now — try again in a bit, or type the tasks in instead.",
    );
    (err as { status?: number }).status = 503;
    throw err;
  }

  async parseBrainDump(text: string, ctx: LifeOSContext): Promise<BrainDumpResult> {
    const slots = freeSlots(ctx, 7);
    let slotCursor = 0;

    // Split into fragments, then fold bare topic-phrases back into the assignment
    // they elaborate on ("history test on X, Y, Z" = one task, not three).
    const parcels = consolidateFragments(splitFragments(text));

    const items: BrainDumpItem[] = parcels.map(({ text: source, notes }) => {
      const shape = normalizeTask(source);
      const title = shape.title;
      const dateGuess = guessDueDate(source, ctx.now);
      const category = guessCategory(source);
      const minutes = estimateMinutes(shape.kind);
      const priority = derivePriority({
        kind: shape.kind,
        due: dateGuess.date,
        now: ctx.now,
        timeOfDay: dateGuess.timeOfDay,
      });

      // Suggest a schedule slot without inventing a deadline.
      let suggestedSlot: string | null = null;
      if (dateGuess.timeOfDay === "night" && slots[0]) {
        suggestedSlot = fmtSlot(slots[0], minutes);
      } else if (slots[slotCursor]) {
        suggestedSlot = fmtSlot(slots[slotCursor], minutes);
        slotCursor = Math.min(slotCursor + 1, slots.length - 1);
      }

      const reasoningBits: string[] = [];
      if (dateGuess.explicit && dateGuess.date) {
        reasoningBits.push(
          `You said "${dateGuess.matchedText}", so this is due ${dateGuess.date.toLocaleDateString([], {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}.`,
        );
      } else {
        reasoningBits.push("No date mentioned — left undated for you to set.");
      }
      reasoningBits.push(`Estimated ~${minutes} min based on task type (${shape.kind}).`);
      if (suggestedSlot) reasoningBits.push(`Suggested slot: ${suggestedSlot}.`);

      return {
        title,
        notes: notes ?? null,
        category: category ?? null,
        suggestedPriority: priority,
        suggestedDueAt: dateGuess.explicit && dateGuess.date ? dateGuess.date.toISOString() : null,
        dueDateWasExplicit: dateGuess.explicit,
        estimatedMinutes: minutes,
        suggestedSlot,
        reasoning: reasoningBits.join(" "),
      };
    });

    const explicit = items.filter((i) => i.dueDateWasExplicit).length;
    const summary = `Found ${items.length} task${items.length === 1 ? "" : "s"}. ${
      explicit > 0
        ? `${explicit} had a date you mentioned; the rest are undated until you confirm.`
        : "None had an explicit date, so nothing was scheduled automatically."
    }`;

    return { engine: "heuristic", items, summary };
  }

  async prioritize(ctx: LifeOSContext): Promise<PrioritizeResult> {
    const scored = scoreTasks(ctx);
    const picks = scored.slice(0, 3).map((s) => {
      const rel = relativeDue(s.dueAt, ctx.now);
      const reasonParts: string[] = [];
      if (rel) reasonParts.push(rel[0].toUpperCase() + rel.slice(1));
      const nonDueFactors = s.factors.filter(
        (f) => !/^(overdue|due today|due tomorrow|due this week)$/.test(f),
      );
      if (nonDueFactors.length) reasonParts.push(nonDueFactors.slice(0, 2).join(", "));
      if (s.estimatedMinutes) reasonParts.push(`~${s.estimatedMinutes} min`);
      return {
        taskId: s.id,
        title: s.title,
        reason: reasonParts.join(" · ") || "Highest-impact item on your list right now.",
      };
    });

    const intro = picks.length
      ? "Based on your deadlines, goals and schedule, I'd focus on these first today."
      : "You're all caught up — no open tasks to prioritize. Add a few or run a Brain Dump.";

    return { engine: "heuristic", intro, picks };
  }

  async assist(messages: AssistantMessage[], ctx: LifeOSContext): Promise<AssistantResult> {
    // The offline engine can't act on data — it only answers. The last thing the
    // student typed is the question; any "add / delete X" ask just gets a nudge
    // to use the page directly, with no `actions`.
    const question =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const q = question.toLowerCase();

    if (/\b(add|create|make|delete|remove|rename)\b/.test(q) && !/\bplan\b/.test(q)) {
      return {
        engine: "heuristic",
        answer:
          "I can point you to the right place, but the offline assistant can't change your data. " +
          "Add or remove tasks on **Tasks**, courses and assignments on **School**, goals on **Goals**.",
        references: [],
        actions: [],
      };
    }
    const refs: AssistantReference[] = [];
    const scored = scoreTasks(ctx);
    const now = ctx.now;

    const pushTask = (id: string, title: string) =>
      refs.push({ type: "task", id, title });

    // Intent: falling behind
    if (/\bbehind\b|\bfalling behind\b|\boverdue\b|\bcatch up\b/.test(q)) {
      const overdueTasks = ctx.tasks.filter(
        (t) => t.status !== "done" && t.dueAt && t.dueAt.getTime() < now.getTime(),
      );
      const lateAssignments = ctx.assignments.filter(
        (a) => a.status === "open" && a.dueAt && a.dueAt.getTime() < now.getTime(),
      );
      const looming = ctx.assignments.filter(
        (a) =>
          a.status === "open" &&
          a.dueAt &&
          a.dueAt.getTime() >= now.getTime() &&
          a.dueAt.getTime() - now.getTime() < 48 * 3600000 &&
          !a.hasLinkedTask,
      );
      overdueTasks.forEach((t) => pushTask(t.id, t.title));
      lateAssignments.forEach((a) => refs.push({ type: "assignment", id: a.id, title: a.title }));

      const lines: string[] = [];
      if (!overdueTasks.length && !lateAssignments.length && !looming.length) {
        lines.push("**Good news — nothing is overdue.** You're on top of everything tracked in LifeOS.");
      } else {
        if (overdueTasks.length) {
          lines.push(`**${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"}:**`);
          overdueTasks.forEach((t) =>
            lines.push(`- ${t.title}${t.category ? ` _(${t.category})_` : ""} — ${relativeDue(t.dueAt, now)}`),
          );
        }
        if (lateAssignments.length) {
          lines.push(`\n**${lateAssignments.length} assignment${lateAssignments.length === 1 ? "" : "s"} past due:**`);
          lateAssignments.forEach((a) =>
            lines.push(`- ${a.title}${a.courseName ? ` _(${a.courseName})_` : ""} — ${relativeDue(a.dueAt, now)}`),
          );
        }
        if (looming.length) {
          lines.push(`\n**Due in the next 2 days with no work started:**`);
          looming.forEach((a) => lines.push(`- ${a.title} — ${relativeDue(a.dueAt, now)}`));
        }
        lines.push(
          `\n**Suggested recovery:** tackle the oldest overdue item first tonight, then the assignment closest to its deadline. Want me to draft study sessions for these?`,
        );
      }
      return { engine: "heuristic", answer: lines.join("\n"), references: refs, actions: [] };
    }

    // Intent: study plan / plan my week
    if (/\bstudy plan\b|\bplan (for )?(this|the|my) week\b|\bmake me a plan\b|\bschedule my week\b/.test(q)) {
      const slots = freeSlots(ctx, 7);
      const workload = scored.filter((s) => s.dueAt || s.score >= 20).slice(0, 8);
      const lines = [`**Study plan for the week of ${now.toLocaleDateString([], { month: "long", day: "numeric" })}**`, ""];
      if (!workload.length) {
        lines.push("You have no dated or high-priority work right now. Add deadlines or assignments and I'll build a real plan.");
      } else {
        let wi = 0;
        for (const slot of slots) {
          if (wi >= workload.length) break;
          const task = workload[wi++];
          pushTask(task.id, task.title);
          lines.push(
            `- **${fmtSlot(slot, task.estimatedMinutes ?? 60)}** — ${task.title}` +
              `${task.dueAt ? ` (${relativeDue(task.dueAt, now)})` : ""}`,
          );
        }
        const leftover = workload.slice(wi);
        if (leftover.length) {
          lines.push("", "_Not enough free slots this week for:_ " + leftover.map((t) => t.title).join(", "));
        }
        lines.push("", "These slots come from your onboarding schedule. Adjust any block and re-ask to rebalance.");
      }
      return { engine: "heuristic", answer: lines.join("\n"), references: refs, actions: [] };
    }

    // Intent: when should I study for X
    const studyMatch = q.match(/study (?:for )?(?:my |the )?([a-z ]+?)(?: test| exam| quiz| midterm| final)?\??$/);
    if (/\bwhen\b/.test(q) && /\bstudy\b/.test(q)) {
      const subject = studyMatch?.[1]?.trim();
      const target =
        (subject &&
          (ctx.assignments.find((a) => matchSubject(a.title, a.courseName, subject) && a.dueAt) ||
            ctx.tasks.find((t) => matchSubject(t.title, t.category, subject) && t.dueAt))) ||
        null;
      const slots = freeSlots(ctx, 7);
      const lines: string[] = [];
      if (target && "dueAt" in target && target.dueAt) {
        const due = target.dueAt;
        const before = slots.filter((s) => s.start.getTime() < due.getTime()).slice(0, 3);
        lines.push(`**${"title" in target ? target.title : subject}** is ${relativeDue(due, now)}.`);
        if (before.length) {
          lines.push("", "Best windows before then:");
          before.forEach((s, i) =>
            lines.push(`- ${fmtSlot(s, i === before.length - 1 ? 120 : 90)}${i === 0 ? " — start light review" : i === before.length - 1 ? " — final focused review" : ""}`),
          );
        } else {
          lines.push("", "There's no free block before the deadline in your schedule — consider a shorter session during a free period or lunch.");
        }
        if ("id" in target) {
          refs.push({
            type: "title" in target && "courseName" in target ? "assignment" : "task",
            id: (target as { id: string }).id,
            title: ("title" in target ? target.title : subject) as string,
          });
        }
      } else {
        lines.push(
          subject
            ? `I don't see a dated ${subject} test in LifeOS. Add it on the School page (or as a task with a due date) and I'll schedule review sessions backward from it.`
            : "Tell me which subject and add its date on the School page — then I'll work backward from the deadline.",
        );
        if (slots[0]) lines.push("", `Your next free study window is **${fmtSlot(slots[0])}**.`);
      }
      return { engine: "heuristic", answer: lines.join("\n"), references: refs, actions: [] };
    }

    // Intent: what should I work on (tonight / today / now)
    if (/\bwork on\b|\bwhat should i do\b|\bfocus on\b|\bget done\b|\btonight\b|\btoday\b/.test(q)) {
      const slots = freeSlots(ctx, 1);
      const top = scored.slice(0, 3);
      top.forEach((t) => pushTask(t.id, t.title));
      const lines = ["**Tonight's focus:**", ""];
      if (!top.length) {
        lines.push("Nothing open. Enjoy the break, or add what's on your mind with a Brain Dump.");
      } else {
        top.forEach((t, i) => {
          const bits = [
            relativeDue(t.dueAt, now),
            ...t.factors.slice(0, 2),
            t.estimatedMinutes ? `~${t.estimatedMinutes} min` : null,
          ].filter((b): b is string => Boolean(b));
          const seen = new Set<string>();
          const deduped = bits.filter((b) => {
            const k = b.toLowerCase().replace(/^due /, "");
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          lines.push(`${i + 1}. **${t.title}** — ${deduped.join(" · ")}`);
        });
        const total = top.reduce((n, t) => n + (t.estimatedMinutes ?? 30), 0);
        if (slots[0]) {
          lines.push(
            "",
            slots[0].minutes >= total
              ? `You have ~${Math.round(slots[0].minutes / 60 * 10) / 10}h free ${slots[0].label.toLowerCase()} — enough for all three.`
              : `You have ~${Math.round(slots[0].minutes / 60 * 10) / 10}h free ${slots[0].label.toLowerCase()}. Do #1 and #2 tonight, push #3 to tomorrow.`,
          );
        }
      }
      return { engine: "heuristic", answer: lines.join("\n"), references: refs, actions: [] };
    }

    // Intent: goal progress
    if (/\bgoal\b|\bprogress\b|\bon track\b/.test(q)) {
      const active = ctx.goals.filter((g) => g.status === "active");
      active.forEach((g) => refs.push({ type: "goal", id: g.id, title: g.title }));
      const lines = ["**Where your goals stand:**", ""];
      if (!active.length) lines.push("No active goals yet. Add one on the Goals page.");
      active.forEach((g) => {
        if (g.targetType === "habit" && g.habitPerWeek) {
          lines.push(`- **${g.title}** — ${g.habitLogsThisWeek ?? 0}/${g.habitPerWeek} this week`);
        } else {
          lines.push(`- **${g.title}** — ${g.progress}% complete${g.dueAt ? ` · ${relativeDue(g.dueAt, now)}` : ""}`);
        }
      });
      return { engine: "heuristic", answer: lines.join("\n"), references: refs, actions: [] };
    }

    // Fallback: today overview
    const dueToday = ctx.tasks.filter(
      (t) => t.status !== "done" && t.dueAt && sameLocalDay(t.dueAt, now),
    );
    dueToday.forEach((t) => pushTask(t.id, t.title));
    const top3 = scored.slice(0, 3);
    const lines = [
      `Here's your snapshot for ${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}:`,
      "",
      `- **${dueToday.length}** task${dueToday.length === 1 ? "" : "s"} due today`,
      `- **${ctx.assignments.filter((a) => a.status === "open" && a.dueAt && a.dueAt.getTime() > now.getTime()).length}** upcoming assignments`,
      `- **${ctx.goals.filter((g) => g.status === "active").length}** active goals`,
      "",
      top3.length ? "If you only do three things: " + top3.map((t) => `**${t.title}**`).join(", ") + "." : "",
      "",
      "_Ask me things like “what should I work on tonight?”, “when should I study for my physics test?”, or “make me a study plan for this week.”_",
    ];
    return {
      engine: "heuristic",
      answer: lines.filter((l) => l !== undefined).join("\n"),
      references: refs,
      actions: [],
    };
  }
}

function matchSubject(title: string, other: string | null | undefined, subject: string) {
  const s = subject.toLowerCase().trim();
  return title.toLowerCase().includes(s) || (other ?? "").toLowerCase().includes(s);
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}
