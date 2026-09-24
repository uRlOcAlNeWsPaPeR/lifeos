"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Bookmark, CheckCircle2, ChevronDown, Eye, Flag, Flame, Pause, Trophy,
  X, XCircle, Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { commit, sat } from "@/lib/sat/store";
import {
  autosaveSession, defaultSessionName, endSession, leaveSession, liveSession, type LiveSession,
} from "@/lib/sat/session";
import { checkSpr, finishSetBadges, liveStreak, recordAnswer } from "@/lib/sat/engine";
import { DIFF_XP, type BadgeDef } from "@/lib/sat/constants";
import { qidFor } from "@/lib/sat/qbank";
import { useStudyTimer } from "@/lib/sat/hooks";
import { confetti, playCorrect } from "@/lib/sat/celebrate";
import { cn } from "@/lib/utils";
import { BadgeIcon, LoadingBlock, Stat } from "./common";
import { LETTERS, OptionRow, QuestionHtml, QuestionMeta, Sheet, type OptionState } from "./question";
import { MathTools } from "./tools";
import { SAT_ROUTES } from "./use-sat-actions";

const PRAISE = ["Nailed it.", "Correct.", "You got it.", "Spot on.", "Crushed it."];

interface Feedback {
  good: boolean;
  text: string;
}

interface Result {
  correct: number;
  total: number;
  xp: number;
  newBadges: BadgeDef[];
}

export function PracticeRunner() {
  const router = useRouter();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const live = liveSession();
    if (!live) {
      router.replace(SAT_ROUTES.practice);
      return;
    }
    setSession(live);
    // Leaving by any route — sidebar, back button, closing the tab — saves the
    // set so nothing is ever silently lost.
    const save = () => autosaveSession();
    const onHide = () => document.visibilityState === "hidden" && save();
    addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", onHide);
      save();
    };
  }, [router]);

  useStudyTimer(Boolean(session) && !result);

  if (result) return <Results result={result} />;
  if (!session) return <LoadingBlock label="Opening your set…" />;
  return <Runner session={session} onFinish={setResult} />;
}

function Runner({ session, onFinish }: { session: LiveSession; onFinish: (r: Result) => void }) {
  const router = useRouter();
  const [idx, setIdx] = useState(session.idx);
  const q = session.qs[idx];

  // Per-question state, reset whenever the question changes.
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [wrongPicks, setWrongPicks] = useState<string[]>([]);
  const [crossed, setCrossed] = useState<Record<string, boolean>>({});
  const [spr, setSpr] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showPrev, setShowPrev] = useState(false);
  const [, rerender] = useState(0);
  const firstAttempt = useRef<{ done: boolean; correct: boolean | null }>({ done: false, correct: null });
  // What was answered the last time this question was missed — read when the
  // question opens, so a wrong attempt now doesn't show up as "last time".
  const [prev, setPrev] = useState<string | undefined>(undefined);
  const sprRef = useRef<HTMLInputElement>(null);

  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    setSelected(null);
    setAnswered(false);
    setWrongPicks([]);
    setCrossed({});
    setSpr("");
    setFeedback(null);
    setShowPrev(false);
    firstAttempt.current = { done: false, correct: null };
    setPrev(q ? sat().missedAnswers[q.id] : undefined);
    session.idx = idx;
    if (q?.type === "spr") setTimeout(() => sprRef.current?.focus(), 50);
    window.scrollTo({ top: 0 });
  }, [idx, q, session]);

  if (!q) return <LoadingBlock label="Loading question…" />;

  const catalog = typeof window !== "undefined" ? window.QB_CATALOG : undefined;
  const prevText = prev
    ? q.type === "mcq"
      ? `Last time you picked ${prev}) ${stripHtml(q.options["ABCD".indexOf(prev)])}`
      : `Last time you wrote: ${prev}`
    : null;

  function check() {
    if (answered) return;
    let right: boolean;
    let given: string;
    if (q.type === "mcq") {
      if (!selected) return;
      right = q.correct.includes(selected);
      given = selected;
      if (!right) {
        // The wrong pick locks out; the rest stay live for another try.
        setWrongPicks((w) => [...w, selected]);
        setSelected(null);
      }
    } else {
      const val = spr.trim();
      if (!val) return toast("Type an answer first.", "error");
      right = checkSpr(q, val);
      given = val;
    }

    // Stats, XP and the streak count the FIRST attempt only.
    if (!firstAttempt.current.done) {
      firstAttempt.current = { done: true, correct: right };
      let outcome: ReturnType<typeof recordAnswer> | null = null;
      commit((s) => {
        outcome = recordAnswer(s, q, right, given);
      });
      const o = outcome as ReturnType<typeof recordAnswer> | null;
      if (o) {
        session.xp += o.xp;
        if (right) session.correct++;
        session.newBadges.push(...o.newBadges);
        if (o.streakNow) toast(`Streak: ${o.streakNow} day${o.streakNow > 1 ? "s" : ""}.`, "success");
      }
    }

    if (right) {
      setAnswered(true);
      const praise = PRAISE[(Math.random() * PRAISE.length) | 0];
      setFeedback({
        good: true,
        text: firstAttempt.current.correct
          ? `${praise} +${DIFF_XP[q.difficulty] ?? 10} XP`
          : `${praise} It counts as wrong for your score, since it took a retry.`,
      });
      confetti(30, innerHeight * 0.45);
      playCorrect();
    } else {
      setFeedback({
        good: false,
        text: q.type === "mcq"
          ? "Not quite — try another option. (+2 XP banked for the attempt)"
          : "Not quite — try again. (+2 XP banked for the attempt)",
      });
      if (q.type === "spr") setTimeout(() => sprRef.current?.select(), 0);
    }
  }

  function next() {
    if (idx < session.qs.length - 1) setIdx(idx + 1);
    else finish();
  }

  function finish() {
    let badges: BadgeDef[] = [];
    commit((s) => {
      badges = finishSetBadges(s, session.qs, session.correct);
      s.pausedQuiz = null; // complete — nothing left to resume
    });
    const r: Result = {
      correct: session.correct,
      total: session.qs.length,
      xp: session.xp,
      newBadges: [...session.newBadges, ...badges],
    };
    endSession();
    onFinish(r);
    if (r.correct / r.total >= 0.7) confetti(120);
  }

  async function exit() {
    const yes = await confirm({
      title: "Leave this set?",
      body: "Your progress is saved — resume it from Practice any time.",
      confirmLabel: "Leave",
    });
    if (!yes) return;
    leaveSession();
    router.push(SAT_ROUTES.home);
  }

  function openPause() {
    setName(session.name || defaultSessionName(session.section));
    setNaming(true);
  }

  function savePaused() {
    const n = name.trim() || defaultSessionName(session.section);
    session.name = n;
    leaveSession();
    setNaming(false);
    toast(`Saved “${n}” — resume it from Practice any time.`, "success");
    router.push(SAT_ROUTES.practice);
  }

  function toggleMark() {
    if (session.marked[q.id]) delete session.marked[q.id];
    else session.marked[q.id] = true;
    rerender((n) => n + 1);
  }

  const marked = Boolean(session.marked[q.id]);
  const progress = ((idx + (answered ? 1 : 0)) / session.qs.length) * 100;

  return (
    <div className="space-y-4">
      {/* Test-style top bar, in LifeOS chrome. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-foreground px-2 text-sm font-semibold text-background">
          {idx + 1}
        </span>
        <Button variant={marked ? "secondary" : "ghost"} size="sm" onClick={toggleMark} aria-pressed={marked}>
          <Bookmark className={cn("h-3.5 w-3.5", marked && "fill-current text-primary")} />
          Mark for review
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <MathTools show={q.section === "math"} />
          <Button variant="ghost" size="icon" onClick={openPause} aria-label="Pause and save for later" title="Pause and save for later">
            <Pause className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={exit} aria-label="Leave (progress is saved)" title="Leave (progress is saved)">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Progress value={progress} className="h-1.5" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <QuestionMeta q={q} qid={qidFor(catalog, q.id)} />
        {prevText && (
          <button
            type="button"
            onClick={() => setShowPrev((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            aria-expanded={showPrev}
          >
            <Eye className="h-3.5 w-3.5" />
            {showPrev ? "Hide" : "See"} what I answered last time
          </button>
        )}
      </div>
      {showPrev && prevText && <p className="text-sm text-muted-foreground">{prevText}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Passage or problem on the left; question and choices on the right. */}
        <Sheet className="lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto">
          <QuestionHtml html={q.stimulus || q.stem} />
        </Sheet>

        <div className="space-y-4">
          <Sheet className="space-y-4">
            {q.stimulus && q.stem && <QuestionHtml html={q.stem} className="font-semibold" />}
            {q.type === "mcq" ? (
              <div className="space-y-2">
                {LETTERS.map((L, i) => {
                  const isWrong = wrongPicks.includes(L);
                  let state: OptionState = "idle";
                  if (answered && q.correct.includes(L)) state = "correct";
                  else if (isWrong) state = "wrong";
                  else if (selected === L) state = "selected";
                  return (
                    <OptionRow
                      key={L}
                      letter={L}
                      html={q.options[i]}
                      state={state}
                      crossed={Boolean(crossed[L])}
                      disabled={answered || isWrong}
                      onSelect={() => {
                        setSelected(L);
                        setCrossed((c) => ({ ...c, [L]: false }));
                      }}
                      onCross={() => {
                        const on = !crossed[L];
                        setCrossed((c) => ({ ...c, [L]: on }));
                        if (on && selected === L) setSelected(null);
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <div>
                <label htmlFor="spr-input" className="mb-1.5 block text-sm font-medium">
                  Your answer
                </label>
                <input
                  id="spr-input"
                  ref={sprRef}
                  value={spr}
                  onChange={(e) => setSpr(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (answered ? next() : check())}
                  disabled={answered}
                  autoComplete="off"
                  placeholder="Type your answer"
                  className="h-11 w-full rounded-xl border-2 border-border bg-card px-3.5 text-base outline-none focus:border-foreground disabled:opacity-70"
                />
              </div>
            )}
          </Sheet>

          {feedback && (
            <div
              role="status"
              className={cn(
                "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
                feedback.good ? "border-success/30 bg-success/10" : "border-destructive/30 bg-destructive/10",
              )}
            >
              {feedback.good ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              {feedback.text}
            </div>
          )}

          {answered && (
            <Sheet className="p-0 sm:p-0">
              <details open className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold">
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                  Explanation
                </summary>
                <QuestionHtml
                  html={q.rationale || "<p>No explanation available for this one.</p>"}
                  className="px-5 pb-5 text-sm text-muted-foreground"
                />
              </details>
            </Sheet>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-white/[0.06] bg-background/80 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border">
        <span className="text-sm text-muted-foreground">
          {idx + 1} of {session.qs.length}
        </span>
        {answered ? (
          <Button onClick={next}>
            {idx === session.qs.length - 1 ? (
              <><Flag className="h-4 w-4" />Finish</>
            ) : (
              <>Next<ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
        ) : (
          <Button onClick={check} disabled={q.type === "mcq" && !selected}>
            Check
          </Button>
        )}
      </div>

      <Modal open={naming} onClose={() => setNaming(false)} title="Pause this set" description="Name it so you can find it later.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            savePaused();
          }}
          className="space-y-4"
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} aria-label="Session name" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setNaming(false)}>Cancel</Button>
            <Button type="submit">Save and leave</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Results({ result }: { result: Result }) {
  const router = useRouter();
  const pct = result.correct / Math.max(1, result.total);
  const title = pct >= 0.9 ? "Outstanding." : pct >= 0.7 ? "Great session." : pct >= 0.5 ? "Solid work." : "Every rep counts.";
  return (
    <div className="mx-auto max-w-lg py-6">
      <Card className="p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <Trophy className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Set complete.</p>
        <div className="mt-6 grid grid-cols-3 gap-4">
          <Stat value={`${result.correct}/${result.total}`} label="Correct" />
          <Stat value={<span className="flex items-center justify-center gap-1 text-primary"><Zap className="h-5 w-5" />+{result.xp}</span>} label="XP" />
          <Stat value={<span className="flex items-center justify-center gap-1"><Flame className="h-5 w-5 text-warning" />{liveStreak(sat())}</span>} label="Streak" />
        </div>
        {result.newBadges.length > 0 && (
          <ul className="mt-6 space-y-2">
            {result.newBadges.map((b) => (
              <li key={b.id} className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2 text-sm">
                <BadgeIcon id={b.id} className="h-4 w-4 text-primary" />
                {b.name} unlocked
              </li>
            ))}
          </ul>
        )}
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => router.push(SAT_ROUTES.home)}>Back to SAT Prep</Button>
          <Button variant="outline" onClick={() => router.push(SAT_ROUTES.practice)}>Practice again</Button>
        </div>
      </Card>
    </div>
  );
}

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent ?? "").trim();
}
