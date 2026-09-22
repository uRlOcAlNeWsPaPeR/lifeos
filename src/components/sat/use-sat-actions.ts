"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toaster";
import { confirm } from "@/components/ui/confirm";
import { commit, sat } from "@/lib/sat/store";
import { beginSession, resumePausedSession } from "@/lib/sat/session";
import { catalogRows, loadCatalog } from "@/lib/sat/qbank";
import { buildModule, newExam } from "@/lib/sat/exam";
import { EXAM_SPECS } from "@/lib/sat/constants";
import type { Question, TestKind } from "@/lib/sat/types";

export const SAT_ROUTES = {
  home: "/sat",
  practice: "/sat/practice",
  session: "/sat/practice/session",
  bank: "/sat/bank",
  exams: "/sat/exams",
  examRun: "/sat/exams/run",
  review: "/sat/review",
  flashcards: "/sat/flashcards",
  guides: "/sat/guides",
  progress: "/sat/progress",
  settings: "/sat/settings",
} as const;

/**
 * Starting things from anywhere in SAT Prep: a practice set (from any source
 * of questions) or a full exam. Tracks which action is busy so the button that
 * started it can show a spinner.
 */
export function useSatActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  /** Load questions, then open the practice runner on them. */
  const startSet = useCallback(
    async (id: string, load: () => Promise<Question[]>, section: string, emptyMessage = "No questions match those filters yet.") => {
      setBusy(id);
      try {
        const qs = await load();
        if (!qs.length) {
          toast(emptyMessage, "error");
          return;
        }
        beginSession(qs, section);
        router.push(SAT_ROUTES.session);
      } catch (e) {
        toast(`${(e as Error).message || "Couldn't load questions"} — try again.`, "error");
      } finally {
        setBusy(null);
      }
    },
    [router],
  );

  /** Start a full exam, replacing an in-progress one only if the student agrees. */
  const startExam = useCallback(
    async (kind: TestKind, lib: number | null = null) => {
      const current = sat().exam;
      if (current && current.phase !== "done") {
        const yes = await confirm({
          title: "Abandon the exam in progress?",
          body: "You already have an exam in progress. Starting a new one discards it — no score is recorded.",
          confirmLabel: "Start new exam",
          destructive: true,
        });
        if (!yes) return;
      }
      const id = `exam-${kind}-${lib ?? "new"}`;
      setBusy(id);
      try {
        const catalog = await loadCatalog();
        const ex = newExam(kind, lib);
        ex.modules.push(buildModule(ex, "rw", "base", catalogRows(catalog, kind, "rw")));
        commit((s) => {
          s.exam = ex;
        });
        toast(`${EXAM_SPECS[kind].label} started — good luck.`, "success");
        router.push(SAT_ROUTES.examRun);
      } catch (e) {
        toast(`${(e as Error).message || "Couldn't start the exam"} — try again.`, "error");
      } finally {
        setBusy(null);
      }
    },
    [router],
  );

  const resumeExam = useCallback(() => router.push(SAT_ROUTES.examRun), [router]);

  /** Reopen the paused practice set exactly where it was left. */
  const resumeSet = useCallback(async () => {
    setBusy("resume");
    try {
      await resumePausedSession();
      router.push(SAT_ROUTES.session);
    } catch (e) {
      toast(
        (e as Error).message === "Saved questions are no longer available"
          ? "Couldn't resume that session — its questions are no longer available."
          : `${(e as Error).message || "Couldn't resume that session"} — try again.`,
        "error",
      );
    } finally {
      setBusy(null);
    }
  }, [router]);

  return { busy, startSet, startExam, resumeExam, resumeSet };
}
