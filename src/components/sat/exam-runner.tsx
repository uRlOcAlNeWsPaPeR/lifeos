"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bookmark, ChevronDown, Coffee, Grid3X3,
  HelpCircle, Pause, Target, Trophy, XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Modal } from "@/components/ui/modal";
import { SectionTitle } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { commit, sat, saveQuietly } from "@/lib/sat/store";
import { cachedQuestion, catalogRows, getQuestions, loadCatalog } from "@/lib/sat/qbank";
import {
  buildModule, formatClock, gradeModule, moduleLabel, routeFor, scoreExam, type ExamResult,
} from "@/lib/sat/exam";
import { award, domainBreakdown, isCorrect, recordAnswer, todayStr } from "@/lib/sat/engine";
import { EXAM_SPECS, SECTION_NAME } from "@/lib/sat/constants";
import { useStudyTimer } from "@/lib/sat/hooks";
import { confetti } from "@/lib/sat/celebrate";
import type { ExamModule, ExamState } from "@/lib/sat/types";
import { cn } from "@/lib/utils";
import { AccuracyRows, ErrorBlock, LoadingBlock, Stat } from "./common";
import { LETTERS, OptionRow, QuestionHtml, Sheet, type OptionState } from "./question";
import { MathTools } from "./tools";
import { SAT_ROUTES } from "./use-sat-actions";

/** The last finished exam, so its results survive a re-render or remount. */
let lastResult: ExamResult | null = null;

type Phase = "loading" | "module" | "break" | "results" | "error";

export function ExamRunner() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const clock = useRef<ReturnType<typeof setInterval> | null>(null);
  const busy = useRef(false);

  const ex = sat().exam;
  const rerender = useCallback(() => tick((n) => n + 1), []);

  const stopClock = useCallback(() => {
    if (clock.current) clearInterval(clock.current);
    clock.current = null;
  }, []);

  /** Load the current module's questions, then run its clock. */
  const openModule = useCallback(async () => {
    const e = sat().exam;
    if (!e) return;
    setPhase("loading");
    try {
      await getQuestions(e.modules[e.cur].qids);
      setPhase("module");
    } catch (err) {
      setError(`${(err as Error).message || "Couldn't load questions"} — your exam is saved; try again.`);
      setPhase("error");
    }
  }, []);

  const finish = useCallback(async () => {
    const e = sat().exam!;
    stopClock();
    setPhase("loading");
    // After a reload, earlier modules may not be cached — fetch for the review.
    try {
      await getQuestions(e.modules.flatMap((m) => m.qids));
    } catch {
      /* the review may be partial offline; scores still work */
    }
    const result = scoreExam(e, cachedQuestion, todayStr());
    commit((s) => {
      // Every answered question feeds normal stats, XP and the streak.
      for (const m of e.modules) {
        for (const id of m.qids) {
          if (m.answers[id] === undefined) continue;
          const q = cachedQuestion(id);
          if (q) recordAnswer(s, q, isCorrect(q, m.answers[id]));
        }
      }
      award(s, "marathon");
      if (!s.examHistory) s.examHistory = [];
      s.examHistory.push({ kind: result.kind, date: result.date, rw: result.rw, math: result.math, total: result.total, lib: e.lib ?? null });
      s.exam = null;
    });
    lastResult = result;
    setPhase("results");
    confetti(140);
  }, [stopClock]);

  /** Submit the module; route module 2, start the break, or finish. */
  const submitModule = useCallback(
    async (auto: boolean) => {
      if (busy.current) return;
      const e = sat().exam;
      if (!e) return;
      const mod = e.modules[e.cur];
      if (mod.submitted) return;
      busy.current = true;
      stopClock();
      setNavOpen(false);
      mod.submitted = true;
      gradeModule(mod, cachedQuestion);
      if (auto) toast("Time's up — module submitted automatically.");

      try {
        if (e.cur === 0 || e.cur === 2) {
          const route = routeFor(mod);
          const catalog = await loadCatalog();
          e.modules.push(buildModule(e, mod.section, route, catalogRows(catalog, e.kind, mod.section)));
          e.cur++;
          commit();
          await openModule();
          toast(route === "hard" ? "Strong module — the next one is tougher." : "Module 2 coming up.");
        } else if (e.cur === 1) {
          e.phase = "break";
          e.breakLeft = EXAM_SPECS[e.kind].breakMinutes * 60;
          commit();
          setPhase("break");
        } else {
          commit();
          await finish();
        }
      } finally {
        busy.current = false;
      }
    },
    [finish, openModule, stopClock],
  );

  const endBreak = useCallback(async () => {
    const e = sat().exam;
    if (!e || busy.current) return;
    busy.current = true;
    stopClock();
    try {
      const catalog = await loadCatalog();
      e.phase = "module";
      e.modules.push(buildModule(e, "math", "base", catalogRows(catalog, e.kind, "math")));
      e.cur = 2;
      commit();
      await openModule();
    } catch (err) {
      setError(`${(err as Error).message || "Couldn't load questions"} — your exam is saved; try again.`);
      setPhase("error");
    } finally {
      busy.current = false;
    }
  }, [openModule, stopClock]);

  // Boot: resume wherever the exam is, or show the last results.
  useEffect(() => {
    const e = sat().exam;
    if (!e || e.phase === "done") {
      if (lastResult) setPhase("results");
      else router.replace(SAT_ROUTES.exams);
      return;
    }
    if (e.phase === "break") setPhase("break");
    else void openModule();
    // Leaving the runner pauses the clock — no time is lost.
    return () => {
      stopClock();
      saveQuietly();
    };
  }, [openModule, router, stopClock]);

  // The clock: one second per tick, saving every 15.
  useEffect(() => {
    if (phase !== "module" && phase !== "break") return;
    stopClock();
    clock.current = setInterval(() => {
      const e = sat().exam;
      if (!e) return stopClock();
      if (e.phase === "module") {
        const mod = e.modules[e.cur];
        mod.timeLeft--;
        if (mod.timeLeft === 300 && !mod.warned) {
          mod.warned = true;
          toast("5 minutes left in this module.");
        }
        if (mod.timeLeft % 15 === 0) saveQuietly();
        if (mod.timeLeft <= 0) void submitModule(true);
      } else if (e.phase === "break") {
        e.breakLeft--;
        if (e.breakLeft % 15 === 0) saveQuietly();
        if (e.breakLeft <= 0) void endBreak();
      }
      rerender();
    }, 1000);
    return stopClock;
  }, [phase, stopClock, submitModule, endBreak, rerender]);

  useStudyTimer(phase === "module");

  function pause() {
    stopClock();
    commit();
    toast("Paused — your time and answers are saved.");
    router.push(SAT_ROUTES.exams);
  }

  if (phase === "results" && lastResult) return <ExamResults r={lastResult} />;
  if (phase === "error") {
    return (
      <ErrorBlock
        message={error ?? "Something went wrong."}
        onRetry={() => (sat().exam?.phase === "break" ? setPhase("break") : void openModule())}
      />
    );
  }
  if (!ex || phase === "loading") return <LoadingBlock label="Loading this module's questions…" />;

  if (phase === "break") return <BreakScreen ex={ex} onEnd={endBreak} />;

  return (
    <>
      <ModuleView
        ex={ex}
        onChange={rerender}
        onPause={pause}
        onOpenNav={() => setNavOpen(true)}
        onHelp={() => setHelpOpen(true)}
      />
      <Navigator
        open={navOpen}
        mod={ex.modules[ex.cur]}
        onClose={() => setNavOpen(false)}
        onJump={(i) => {
          ex.modules[ex.cur].at = i;
          saveQuietly();
          setNavOpen(false);
          rerender();
        }}
        onSubmit={async () => {
          const mod = ex.modules[ex.cur];
          const unanswered = mod.total - Object.keys(mod.answers).length;
          if (unanswered) {
            const yes = await confirm({
              title: "Submit this module?",
              body: `You still have ${unanswered} unanswered question${unanswered > 1 ? "s" : ""}. There's no penalty for guessing.`,
              confirmLabel: "Submit anyway",
            });
            if (!yes) return;
          }
          void submitModule(false);
        }}
      />
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="How this exam works">
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Four timed modules: two Reading &amp; Writing, a 10-minute break, then two Math.</li>
          <li>Module 2 adapts: 60%+ on Module 1 gets you the harder Module 2, with a higher score ceiling.</li>
          <li><strong className="text-foreground">Mark for review</strong> flags a question so you can find it in the question navigator.</li>
          <li>Use the letter beside a choice to cross it out. Clicking the choice itself selects it.</li>
          <li>Math modules include the Desmos calculator and a reference sheet.</li>
          <li>Wrong answers aren&apos;t penalized — always guess.</li>
        </ul>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setHelpOpen(false)}>Got it</Button>
        </div>
      </Modal>
    </>
  );
}

function ModuleView({
  ex,
  onChange,
  onPause,
  onOpenNav,
  onHelp,
}: {
  ex: ExamState;
  onChange: () => void;
  onPause: () => void;
  onOpenNav: () => void;
  onHelp: () => void;
}) {
  const mod = ex.modules[ex.cur];
  const id = mod.qids[mod.at];
  const q = cachedQuestion(id);
  const low = mod.timeLeft < 300;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [mod.at]);

  function save() {
    saveQuietly();
    onChange();
  }

  function pick(letter: string) {
    if (mod.answers[id] === letter) delete mod.answers[id];
    else {
      mod.answers[id] = letter;
      if (mod.crossed[id]) delete mod.crossed[id][letter];
    }
    save();
  }

  function cross(letter: string) {
    const c = mod.crossed[id] ?? (mod.crossed[id] = {});
    c[letter] = !c[letter];
    if (c[letter] && mod.answers[id] === letter) delete mod.answers[id];
    save();
  }

  function move(dir: number) {
    const next = mod.at + dir;
    if (next < 0) return;
    if (next >= mod.total) return onOpenNav(); // past the last question → review
    mod.at = next;
    save();
  }

  function toggleFlag() {
    if (mod.flagged[id]) delete mod.flagged[id];
    else mod.flagged[id] = true;
    save();
  }

  const RouteIcon = mod.route === "hard" ? ArrowUp : mod.route === "easy" ? ArrowDown : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-foreground px-2 text-sm font-semibold text-background">
          {mod.at + 1}
        </span>
        <Button variant={mod.flagged[id] ? "secondary" : "ghost"} size="sm" onClick={toggleFlag} aria-pressed={Boolean(mod.flagged[id])}>
          <Bookmark className={cn("h-3.5 w-3.5", mod.flagged[id] && "fill-current text-primary")} />
          Mark for review
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onOpenNav}>
            <Grid3X3 className="h-3.5 w-3.5" />
            Review
          </Button>
          <Button variant="ghost" size="icon" onClick={onHelp} aria-label="How this exam works">
            <HelpCircle className="h-4 w-4" />
          </Button>
          <MathTools show={mod.section === "math"} />
          <span
            role="timer"
            aria-label={`${formatClock(mod.timeLeft)} left in this module`}
            className={cn(
              "rounded-lg border px-2.5 py-1 font-mono text-sm tabular-nums",
              low ? "border-warning/40 bg-warning/10 text-warning" : "border-white/10",
            )}
          >
            {formatClock(mod.timeLeft)}
          </span>
          <Button variant="ghost" size="icon" onClick={onPause} aria-label="Pause and save" title="Pause and save">
            <Pause className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Progress value={(mod.at / mod.total) * 100} className="h-1.5" />

      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          {EXAM_SPECS[ex.kind].shortLabel} · {moduleLabel(ex)}
          {RouteIcon && (
            <Badge tone="muted" title={mod.route === "hard" ? "Harder module 2" : "Easier module 2"}>
              <RouteIcon className="h-3 w-3" />
              {mod.route === "hard" ? "Harder" : "Easier"}
            </Badge>
          )}
        </span>
        <span className="tabular-nums text-muted-foreground">{mod.at + 1} / {mod.total}</span>
      </div>

      {!q ? (
        <ErrorBlock message="This question couldn't be loaded. Move on and come back — your answers are saved." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Sheet className="lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto">
            <QuestionHtml html={q.stimulus || q.stem} />
          </Sheet>
          <Sheet className="space-y-4">
            {q.stimulus && q.stem && <QuestionHtml html={q.stem} className="font-semibold" />}
            {q.type === "mcq" ? (
              <div className="space-y-2">
                {LETTERS.map((L, i) => {
                  const crossed = Boolean(mod.crossed[id]?.[L]);
                  const state: OptionState = mod.answers[id] === L ? "selected" : "idle";
                  return (
                    <OptionRow
                      key={L}
                      letter={L}
                      html={q.options[i]}
                      state={state}
                      crossed={crossed}
                      onSelect={() => pick(L)}
                      onCross={() => cross(L)}
                    />
                  );
                })}
              </div>
            ) : (
              <div>
                <label htmlFor="ex-spr" className="mb-1.5 block text-sm font-medium">Your answer</label>
                <input
                  id="ex-spr"
                  key={id}
                  defaultValue={mod.answers[id] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (v) mod.answers[id] = v;
                    else delete mod.answers[id];
                    saveQuietly();
                  }}
                  autoComplete="off"
                  placeholder="Type your answer"
                  className="h-11 w-full rounded-xl border-2 border-border bg-card px-3.5 text-base outline-none focus:border-foreground"
                />
              </div>
            )}
          </Sheet>
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-2 border-t border-white/[0.06] bg-background/80 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border">
        <Button variant="ghost" onClick={() => move(-1)} disabled={mod.at === 0}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button variant="outline" onClick={onOpenNav}>
          <Grid3X3 className="h-4 w-4" />
          Questions
        </Button>
        <Button onClick={() => move(1)}>
          {mod.at === mod.total - 1 ? "Review" : "Next"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Navigator({
  open,
  mod,
  onClose,
  onJump,
  onSubmit,
}: {
  open: boolean;
  mod: ExamModule;
  onClose: () => void;
  onJump: (i: number) => void;
  onSubmit: () => void;
}) {
  const unanswered = mod.total - Object.keys(mod.answers).length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Question navigator"
      description={unanswered ? `${unanswered} unanswered — there's no penalty for guessing.` : "All questions answered."}
    >
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
        {mod.qids.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={() => onJump(i)}
            aria-label={`Question ${i + 1}${mod.answers[id] !== undefined ? ", answered" : ""}${mod.flagged[id] ? ", marked for review" : ""}`}
            className={cn(
              "relative flex h-10 items-center justify-center rounded-lg border text-sm tabular-nums transition-colors",
              mod.answers[id] !== undefined ? "border-primary/40 bg-primary/15" : "border-dashed border-white/20",
              i === mod.at && "ring-2 ring-foreground",
            )}
          >
            {i + 1}
            {mod.flagged[id] && <Bookmark className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-primary text-primary" />}
          </button>
        ))}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>Keep working</Button>
        <Button onClick={onSubmit}>Submit module</Button>
      </div>
    </Modal>
  );
}

function BreakScreen({ ex, onEnd }: { ex: ExamState; onEnd: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-8">
      <Card className="p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <Coffee className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Break time</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reading &amp; Writing is done. Stretch, hydrate, breathe — Math starts automatically when the timer runs out.
        </p>
        <p role="timer" className="mt-6 font-mono text-5xl font-semibold tabular-nums">{formatClock(ex.breakLeft)}</p>
        <Button size="lg" className="mt-8" onClick={onEnd}>
          Start Math now
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Card>
    </div>
  );
}

function ExamResults({ r }: { r: ExamResult }) {
  const router = useRouter();
  const spec = EXAM_SPECS[r.kind];
  const { min, max } = spec.scale;
  const target = sat().profile?.tests[r.kind].targetScore;
  const missed = r.modules.flatMap((m, i) =>
    m.review.map((rev) => ({ ...rev, modLabel: `${SECTION_NAME[m.section]} · Module ${(i % 2) + 1}` })),
  );

  return (
    <div className="space-y-6">
      <Card className="p-6 text-center sm:p-8">
        <p className="text-sm text-muted-foreground">
          {spec.label} practice exam{r.lib ? ` ${r.lib}` : ""} · {r.date}
        </p>
        <p className="mt-2 text-6xl font-semibold tabular-nums tracking-tight">{r.total}</p>
        <p className="text-sm text-muted-foreground">out of {max * 2}</p>
        {target ? (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm">
            {r.total >= target ? <Trophy className="h-4 w-4 text-primary" /> : <Target className="h-4 w-4 text-muted-foreground" />}
            {r.total >= target ? `You beat your ${target} target.` : `${target - r.total} points from your ${target} target.`}
          </p>
        ) : null}
        <div className="mx-auto mt-6 grid max-w-md gap-4 sm:grid-cols-2">
          {(["rw", "math"] as const).map((sec) => (
            <div key={sec} className="rounded-xl border border-white/[0.07] p-4 text-left">
              <Stat value={r[sec]} label={SECTION_NAME[sec]} />
              <Progress value={((r[sec] - min) / (max - min)) * 100} className="mt-3 h-1.5" />
            </div>
          ))}
        </div>
        <ul className="mx-auto mt-6 max-w-md divide-y divide-white/[0.06] text-left text-sm">
          {r.modules.map((m, i) => (
            <li key={i} className="flex justify-between gap-3 py-2">
              <span className="text-muted-foreground">
                {SECTION_NAME[m.section]} — Module {(i % 2) + 1}
                {i % 2 ? (m.route === "hard" ? " (harder route)" : m.route === "easy" ? " (easier route)" : "") : ""}
              </span>
              <span className="tabular-nums">{m.correct}/{m.total}</span>
            </li>
          ))}
        </ul>
        <Button className="mt-6" onClick={() => router.push(SAT_ROUTES.home)}>Back to SAT Prep</Button>
      </Card>

      <section>
        <SectionTitle>Strengths &amp; weaknesses — this exam</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          {(["rw", "math"] as const).map((sec) => (
            <Card key={sec} className="p-5">
              <p className="mb-4 font-medium">{SECTION_NAME[sec]}</p>
              <AccuracyRows
                rows={domainBreakdown(r.examDomains[sec], sec).map((d) => ({ key: d.code, label: d.desc, acc: d.acc, att: d.att, tag: d.tag }))}
              />
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Review missed questions</SectionTitle>
        {!missed.length ? (
          <Card className="p-5 text-sm text-muted-foreground">Perfect — nothing to review.</Card>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{missed.length} to review — explanations included.</p>
            {missed.map((item, n) => {
              const q = cachedQuestion(item.id);
              return (
                <Sheet key={`${item.id}-${n}`} className="p-0 sm:p-0">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm">
                      <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="font-medium">{n + 1}. {item.modLabel}</span>
                      {q && <span className="truncate text-muted-foreground">({q.skillDesc})</span>}
                      <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    {q ? (
                      <div className="space-y-3 px-5 pb-5 text-sm">
                        {q.stimulus && <QuestionHtml html={q.stimulus} />}
                        <QuestionHtml html={q.stem} className="font-semibold" />
                        <p>
                          <strong>Your answer:</strong> {item.given ?? "— (blank)"} · <strong>Correct:</strong> {q.correct.join(" or ")}
                        </p>
                        <QuestionHtml html={q.rationale} className="text-muted-foreground" />
                      </div>
                    ) : (
                      <p className="px-5 pb-5 text-sm text-muted-foreground">This question couldn&apos;t be loaded for review.</p>
                    )}
                  </details>
                </Sheet>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
