"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  col,
  entityDoc,
  userDoc,
  todayKey,
  weekKey,
  withPrefs,
  type ProfileDoc,
  type Prefs,
} from "@/lib/firebase/schema";
import { deriveAnalytics, goalProgress, type AnalyticsSummary } from "@/lib/analytics-derive";
import { limitsFor, effectivePlan } from "@/lib/plan-limits";
import { authedApi } from "@/lib/client";
import { toast } from "@/components/ui/toaster";
import { pushUndo } from "@/components/ui/undo-bar";
import { deckMastery, hydrateCard, newCard } from "@/lib/practice/srs";
import type {
  AlarmDTO,
  AssignmentDTO,
  CardDTO,
  CourseDTO,
  DeckDTO,
  EventDTO,
  FocusSessionDTO,
  GameMode,
  GoalDTO,
  MilestoneDTO,
  TaskDTO,
} from "@/lib/types";

const rid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const now = () => new Date().toISOString();

/** Drop the synthetic `id` so a captured snapshot can be written straight back. */
const stripId = <T extends { id: string }>(o: T): Omit<T, "id"> => {
  const { id: _omit, ...rest } = o;
  return rest;
};

type Raw<T> = T & { id: string };

/** Card inputs -> storable cards with fresh spaced-repetition state. */
const toCards = (input: { front: string; back: string; hint?: string | null }[]): CardDTO[] =>
  input
    .map((c) => ({ id: rid(), ...newCard(c.front, c.back, c.hint ?? null) }))
    .filter((c) => c.front && c.back);

interface StoreData {
  profile: {
    name: string;
    email: string;
    plan: string;
    onboarded: boolean;
    gradeYear: string | null;
    school: string | null;
    goalsText: string | null;
    schedule: ProfileDoc["schedule"];
    extracurriculars: string[];
    helpWith: string[];
    prefs: Prefs;
  };
  /** Tasks shown in lists — excludes ones that shadow an assignment. */
  tasks: TaskDTO[];
  /** Every task, including assignment shadows (for analytics + assignment detail). */
  allTasks: TaskDTO[];
  goals: GoalDTO[];
  courses: CourseDTO[];
  assignments: AssignmentDTO[];
  events: EventDTO[];
  alarms: AlarmDTO[];
  focusSessions: FocusSessionDTO[];
  /** Practice study sets, most recently studied first. */
  decks: DeckDTO[];
  ai: { engine: string; label: string };
  limits: {
    plan: string;
    brainDumpsPerWeek: number | null;
    brainDumpsUsedThisWeek: number;
    assistantPerDay: number | null;
    assistantUsedToday: number;
    maxActiveGoals: number | null;
    maxCourses: number | null;
    maxDecks: number | null;
    fullAnalytics: boolean;
  };
}

/** What a caller hands us to build a card — the SRS fields are ours to set. */
export type CardInput = { front: string; back: string; hint?: string | null };

const orNull = (n: number) => (n === Infinity ? null : n);

/* --------------------------- duplicate detection --------------------------- *
 * One pass, reused for every collection: group rows by a key, and inside any
 * group of 2+ keep the highest-scoring row (ties → oldest, then lowest id).
 * Feeds both the UI (hide the extras) and a background cleanup (delete them).  */

type DupRow = Raw<Record<string, unknown>>;
type DupResult = { drop: Set<string>; mergeInto: Map<string, string> };

const normStr = (s: unknown) =>
  String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** ISO string → "YYYY-MM-DD"; anything unparseable is passed through as-is. */
const dayOf = (v: unknown) => {
  const s = String(v ?? "");
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
};

function findDuplicates(
  rows: DupRow[],
  keyOf: (r: DupRow) => string,
  scoreOf: (r: DupRow) => number,
): DupResult {
  const groups = new Map<string, DupRow[]>();
  for (const r of rows) {
    const key = keyOf(r);
    if (!key) continue; // "" opts a row out of de-duping
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const drop = new Set<string>();
  const mergeInto = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [keeper, ...rest] = [...group].sort(
      (a, b) =>
        scoreOf(b) - scoreOf(a) ||
        String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) ||
        a.id.localeCompare(b.id),
    );
    for (const r of rest) {
      drop.add(r.id);
      mergeInto.set(r.id, keeper.id);
    }
  }
  return { drop, mergeInto };
}

/** How each collection decides "same thing twice", and which copy to keep. */
const DUPLICATE_RULES: Record<
  "tasks" | "goals" | "courses" | "assignments" | "events" | "alarms",
  { keyOf: (r: DupRow) => string; scoreOf: (r: DupRow) => number }
> = {
  tasks: {
    // recurring tasks legitimately repeat — never fold those
    keyOf: (t) =>
      t.recurrence && t.recurrence !== "none"
        ? ""
        : `${normStr(t.title)}|${dayOf(t.dueAt)}|${(t.courseId as string) ?? ""}|${(t.goalId as string) ?? ""}`,
    scoreOf: (t) =>
      (t.status === "done" ? 8 : 0) +
      (t.notes || t.estimatedMinutes != null || t.scheduledAt ? 4 : 0) +
      (t.assignmentId ? 2 : 0) +
      (t.dueAt ? 1 : 0),
  },
  goals: {
    keyOf: (g) => normStr(g.title),
    scoreOf: (g) =>
      (Number(g.progress) || 0) + (((g.milestones as unknown[]) ?? []).length ? 50 : 0),
  },
  courses: {
    keyOf: (c) => normStr(c.name),
    scoreOf: (c) => (c.canvasCourseId ? 8 : 0) + (c.currentGrade ? 2 : 0) + (c.code ? 1 : 0),
  },
  assignments: {
    keyOf: (a) => `${(a.courseId as string) ?? ""}|${normStr(a.title)}`,
    scoreOf: (a) =>
      (a.canvasAssignmentId ? 8 : 0) +
      (a.pointsEarned != null || a.gradeValue ? 4 : 0) +
      (a.status && a.status !== "open" ? 2 : 0) +
      (a.dueAt ? 1 : 0),
  },
  events: {
    keyOf: (e) => `${normStr(e.title)}|${String(e.startAt ?? "")}`,
    scoreOf: (e) => (e.canvasEventId ? 4 : 0) + (e.description ? 1 : 0),
  },
  alarms: {
    keyOf: (a) => `${String(a.time ?? "")}|${normStr(a.label)}`,
    scoreOf: (a) =>
      (a.enabled !== false ? 2 : 0) + (((a.repeatDays as unknown[]) ?? []).length ? 1 : 0),
  },
};

type TaskInput = {
  title?: string;
  notes?: string | null;
  status?: string;
  priority?: string;
  category?: string | null;
  dueAt?: string | null;
  dueTime?: string | null;
  scheduledAt?: string | null;
  respectSleep?: boolean;
  recurrence?: string | null;
  estimatedMinutes?: number | null;
  source?: string;
  goalId?: string | null;
  courseId?: string | null;
  assignmentId?: string | null;
};

interface AppDataValue {
  data: StoreData;
  analytics: AnalyticsSummary;
  ready: boolean;
  refresh: () => Promise<void>;

  addTask: (input: TaskInput) => Promise<TaskDTO | undefined>;
  updateTask: (id: string, patch: TaskInput) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  reorderTasks: (ids: string[]) => Promise<void>;

  addEvent: (input: {
    title: string;
    startAt: string;
    endAt: string;
    kind?: string;
    location?: string | null;
    description?: string | null;
    locked?: boolean;
  }) => Promise<EventDTO | undefined>;
  updateEvent: (id: string, patch: Partial<EventDTO>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;

  addGoal: (input: Record<string, unknown>) => Promise<GoalDTO | undefined>;
  updateGoal: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  goalAction: (id: string, body: { action: string; title?: string }) => Promise<void>;
  toggleMilestone: (goalId: string, milestoneId: string, done: boolean) => Promise<void>;

  addCourse: (input: Record<string, unknown>) => Promise<CourseDTO | undefined>;
  updateCourse: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;
  addAssignment: (input: Record<string, unknown>) => Promise<AssignmentDTO | undefined>;
  updateAssignment: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  createTaskForAssignment: (assignmentId: string) => Promise<void>;

  commitBrainDump: (
    items: {
      title: string;
      category: string | null;
      priority: string;
      dueAt: string | null;
      estimatedMinutes: number | null;
      notes: string | null;
    }[],
    rawText: string,
  ) => Promise<number>;
  noteBrainDumpUsed: () => void;

  setPlan: (plan: string) => void;
  patchProfile: (patch: Partial<StoreData["profile"]>) => void;
  updatePrefs: (patch: Partial<Prefs>) => Promise<void>;

  addAlarm: (input: Partial<AlarmDTO> & { label: string; time: string }) => Promise<void>;
  updateAlarm: (id: string, patch: Partial<AlarmDTO>) => Promise<void>;
  deleteAlarm: (id: string) => Promise<void>;

  logFocusSession: (s: Omit<FocusSessionDTO, "id">) => Promise<void>;

  addDeck: (input: {
    title: string;
    description?: string | null;
    courseId?: string | null;
    subject?: string | null;
    source?: DeckDTO["source"];
    cards: CardInput[];
  }) => Promise<DeckDTO | undefined>;
  updateDeck: (
    id: string,
    patch: Partial<Pick<DeckDTO, "title" | "description" | "courseId" | "subject">>,
  ) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;
  /** Replace a deck's cards wholesale — what the deck editor saves. */
  setDeckCards: (id: string, cards: CardInput[]) => Promise<void>;
  /**
   * Persist the result of one study session: the cards carry their updated
   * spaced-repetition state, and `score` updates the deck's personal best.
   */
  recordSession: (
    id: string,
    result: { cards: CardDTO[]; mode: GameMode; score?: number; elapsedMs?: number },
  ) => Promise<void>;
}

const Ctx = createContext<AppDataValue | null>(null);

export function useAppData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppData must be used inside <AppDataProvider>");
  return v;
}

export function AppDataProvider({
  uid,
  email: authEmail,
  children,
}: {
  uid: string;
  email?: string | null;
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<ProfileDoc | null>(null);
  const [ai, setAi] = useState<{ engine: string; label: string }>({ engine: "heuristic", label: "AI" });
  const [tasksRaw, setTasksRaw] = useState<Raw<Record<string, unknown>>[]>([]);
  const [goalsRaw, setGoalsRaw] = useState<Raw<Record<string, unknown>>[]>([]);
  const [coursesRaw, setCoursesRaw] = useState<Raw<Record<string, unknown>>[]>([]);
  const [assignmentsRaw, setAssignmentsRaw] = useState<Raw<Record<string, unknown>>[]>([]);
  const [eventsRaw, setEventsRaw] = useState<Raw<Record<string, unknown>>[]>([]);
  const [alarmsRaw, setAlarmsRaw] = useState<Raw<Record<string, unknown>>[]>([]);
  const [focusRaw, setFocusRaw] = useState<Raw<Record<string, unknown>>[]>([]);
  const [decksRaw, setDecksRaw] = useState<Raw<Record<string, unknown>>[]>([]);
  const [loaded, setLoaded] = useState({ profile: false, tasks: false, goals: false, courses: false, assignments: false, events: false });

  useEffect(() => {
    // authed so the engine label reflects this student's own plan (Free always
    // reads as the offline engine — see /api/session)
    authedApi<{ engine: string; label: string }>("/api/session")
      .then(setAi)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const mark = (k: keyof typeof loaded) => setLoaded((s) => (s[k] ? s : { ...s, [k]: true }));
    const snap =
      <T,>(
        name: "tasks" | "goals" | "courses" | "assignments" | "events" | "alarms" | "focusSessions" | "decks",
        set: (v: T[]) => void,
        markKey?: keyof typeof loaded,
      ) =>
        onSnapshot(col(uid, name), (qs) => {
          set(qs.docs.map((d) => ({ id: d.id, ...d.data() })) as T[]);
          if (markKey) mark(markKey);
        }, (err) => {
          console.error(`[store] ${name} snapshot error`, err);
          if (markKey) mark(markKey);
        });

    const unsubs = [
      onSnapshot(userDoc(uid), (d) => {
        setProfile((d.exists() ? d.data() : null) as ProfileDoc | null);
        mark("profile");
      }),
      snap("tasks", setTasksRaw, "tasks"),
      snap("goals", setGoalsRaw, "goals"),
      snap("courses", setCoursesRaw, "courses"),
      snap("assignments", setAssignmentsRaw, "assignments"),
      snap("events", setEventsRaw, "events"),
      snap("alarms", setAlarmsRaw),
      snap("focusSessions", setFocusRaw),
      snap("decks", setDecksRaw),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  const ready = Object.values(loaded).every(Boolean);

  /* Background cleanup: once data is loaded, permanently delete the duplicate
     rows the UI is already hiding (keeping the richest copy of each) and
     re-point anything that linked to a deleted row at its survivor. Re-runs
     only when a fresh batch of dupes shows up. */
  const deduping = useRef(false);
  useEffect(() => {
    if (!ready || deduping.current) return;

    const d = {
      tasks: findDuplicates(tasksRaw, DUPLICATE_RULES.tasks.keyOf, DUPLICATE_RULES.tasks.scoreOf),
      goals: findDuplicates(goalsRaw, DUPLICATE_RULES.goals.keyOf, DUPLICATE_RULES.goals.scoreOf),
      courses: findDuplicates(coursesRaw, DUPLICATE_RULES.courses.keyOf, DUPLICATE_RULES.courses.scoreOf),
      assignments: findDuplicates(assignmentsRaw, DUPLICATE_RULES.assignments.keyOf, DUPLICATE_RULES.assignments.scoreOf),
      events: findDuplicates(eventsRaw, DUPLICATE_RULES.events.keyOf, DUPLICATE_RULES.events.scoreOf),
      alarms: findDuplicates(alarmsRaw, DUPLICATE_RULES.alarms.keyOf, DUPLICATE_RULES.alarms.scoreOf),
    };
    const total =
      d.tasks.drop.size + d.goals.drop.size + d.courses.drop.size +
      d.assignments.drop.size + d.events.drop.size + d.alarms.drop.size;
    if (total === 0) return;

    deduping.current = true;
    (async () => {
      const batch = writeBatch(db());
      const remap = (id: unknown, m: Map<string, string>) =>
        typeof id === "string" && m.has(id) ? m.get(id) : undefined;

      // surviving tasks: follow merged course / goal / assignment links
      for (const t of tasksRaw) {
        if (d.tasks.drop.has(t.id)) continue;
        const patch: Record<string, unknown> = {};
        const c = remap(t.courseId, d.courses.mergeInto);
        const g = remap(t.goalId, d.goals.mergeInto);
        const a = remap(t.assignmentId, d.assignments.mergeInto);
        if (c !== undefined) patch.courseId = c;
        if (g !== undefined) patch.goalId = g;
        if (a !== undefined) patch.assignmentId = a;
        if (Object.keys(patch).length) {
          patch.updatedAt = serverTimestamp();
          batch.update(entityDoc(uid, "tasks", t.id), patch);
        }
      }
      // surviving assignments: follow merged course links
      for (const a of assignmentsRaw) {
        if (d.assignments.drop.has(a.id)) continue;
        const c = remap(a.courseId, d.courses.mergeInto);
        if (c !== undefined) {
          batch.update(entityDoc(uid, "assignments", a.id), {
            courseId: c,
            updatedAt: serverTimestamp(),
          });
        }
      }

      const del = (name: Parameters<typeof entityDoc>[1], ids: Set<string>) =>
        ids.forEach((id) => batch.delete(entityDoc(uid, name, id)));
      del("tasks", d.tasks.drop);
      del("goals", d.goals.drop);
      del("courses", d.courses.drop);
      del("assignments", d.assignments.drop);
      del("events", d.events.drop);
      del("alarms", d.alarms.drop);

      await batch.commit();
      toast(`Removed ${total} duplicate item${total === 1 ? "" : "s"}`, "success");
    })()
      .catch((e) => console.error("[store] dedupe failed", e))
      .finally(() => {
        deduping.current = false;
      });
  }, [ready, uid, tasksRaw, goalsRaw, coursesRaw, assignmentsRaw, eventsRaw, alarmsRaw]);

  /* A finished study session is spent — it never becomes a grade record like an
     assignment does, so it's just clutter on the calendar. Delete each one a
     little after it ends. */
  const sweeping = useRef(false);
  useEffect(() => {
    if (!ready || sweeping.current) return;
    const done = eventsRaw.filter(
      (e) =>
        e.kind === "study_session" &&
        typeof e.endAt === "string" &&
        Number.isFinite(Date.parse(e.endAt as string)) &&
        Date.parse(e.endAt as string) < Date.now(),
    );
    if (done.length === 0) return;
    sweeping.current = true;
    (async () => {
      const batch = writeBatch(db());
      done.forEach((e) => batch.delete(entityDoc(uid, "events", e.id)));
      await batch.commit();
    })()
      .catch((e) => console.error("[store] study-session sweep failed", e))
      .finally(() => {
        sweeping.current = false;
      });
  }, [ready, uid, eventsRaw]);

  /* -------- derive enriched DTOs (writes stay flat, reads are rich) -------- */
  const data = useMemo<StoreData>(() => {
    // Hide every kind of duplicate (same-name goal, course, event, alarm, task,
    // assignment) so nothing shows twice; a background pass deletes the extras.
    const dup = {
      tasks: findDuplicates(tasksRaw, DUPLICATE_RULES.tasks.keyOf, DUPLICATE_RULES.tasks.scoreOf),
      goals: findDuplicates(goalsRaw, DUPLICATE_RULES.goals.keyOf, DUPLICATE_RULES.goals.scoreOf),
      courses: findDuplicates(coursesRaw, DUPLICATE_RULES.courses.keyOf, DUPLICATE_RULES.courses.scoreOf),
      assignments: findDuplicates(assignmentsRaw, DUPLICATE_RULES.assignments.keyOf, DUPLICATE_RULES.assignments.scoreOf),
      events: findDuplicates(eventsRaw, DUPLICATE_RULES.events.keyOf, DUPLICATE_RULES.events.scoreOf),
      alarms: findDuplicates(alarmsRaw, DUPLICATE_RULES.alarms.keyOf, DUPLICATE_RULES.alarms.scoreOf),
    };

    const courseRows = coursesRaw.filter((c) => !dup.courses.drop.has(c.id));
    const goalRows = goalsRaw.filter((g) => !dup.goals.drop.has(g.id));
    const taskRows = tasksRaw.filter((t) => !dup.tasks.drop.has(t.id));

    const courseLite = new Map(
      courseRows.map((c) => [c.id, { id: c.id, name: c.name as string, color: (c.color as string) ?? "#22d67e" }]),
    );
    const goalLite = new Map(goalRows.map((g) => [g.id, { id: g.id, title: g.title as string }]));
    // a link to a duplicate that's about to be deleted resolves to its survivor
    for (const [gone, keeper] of dup.courses.mergeInto) {
      const v = courseLite.get(keeper);
      if (v) courseLite.set(gone, v);
    }
    for (const [gone, keeper] of dup.goals.mergeInto) {
      const v = goalLite.get(keeper);
      if (v) goalLite.set(gone, v);
    }

    const allTasks: TaskDTO[] = taskRows.map((t) => ({
      id: t.id,
      title: (t.title as string) ?? "",
      notes: (t.notes as string) ?? null,
      status: (t.status as TaskDTO["status"]) ?? "todo",
      priority: (t.priority as TaskDTO["priority"]) ?? "medium",
      category: (t.category as string) ?? null,
      dueAt: (t.dueAt as string) ?? null,
      estimatedMinutes: (t.estimatedMinutes as number) ?? null,
      completedAt: (t.completedAt as string) ?? null,
      sortOrder: (t.sortOrder as number) ?? 0,
      source: (t.source as string) ?? "manual",
      goalId: (t.goalId as string) ?? null,
      courseId: (t.courseId as string) ?? null,
      assignmentId: (t.assignmentId as string) ?? null,
      createdAt: (t.createdAt as string) ?? undefined,
      dueTime: (t.dueTime as string) ?? null,
      scheduledAt: (t.scheduledAt as string) ?? null,
      respectSleep: t.respectSleep === undefined ? true : Boolean(t.respectSleep),
      recurrence: (t.recurrence as TaskDTO["recurrence"]) ?? "none",
      goal: t.goalId ? goalLite.get(t.goalId as string) ?? null : null,
      course: t.courseId ? courseLite.get(t.courseId as string) ?? null : null,
      canvasUrl: (t.canvasUrl as string) ?? null,
      canvasAssignmentId: (t.canvasAssignmentId as string) ?? null,
      shadowOfAssignmentId: null,
      assignment: null,
    }));

    const goals: GoalDTO[] = goalRows.map((g) => {
      const milestones = ((g.milestones as MilestoneDTO[]) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
      return {
        id: g.id,
        title: (g.title as string) ?? "",
        description: (g.description as string) ?? null,
        category: (g.category as string) ?? null,
        targetType: (g.targetType as GoalDTO["targetType"]) ?? "milestone",
        habitPerWeek: (g.habitPerWeek as number) ?? null,
        progress: (g.progress as number) ?? 0,
        status: (g.status as GoalDTO["status"]) ?? "active",
        dueAt: (g.dueAt as string) ?? null,
        milestones,
        habitLogs: ((g.habitLogs as { id: string; date: string }[]) ?? []),
        tasks: allTasks
          .filter((t) => t.goalId === g.id)
          .map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt })),
      };
    });

    const assignments: AssignmentDTO[] = assignmentsRaw
      .filter((a) => !dup.assignments.drop.has(a.id))
      .map((a) => ({
        id: a.id,
        title: (a.title as string) ?? "",
        description: (a.description as string) ?? null,
        courseId: (a.courseId as string) ?? null,
        dueAt: (a.dueAt as string) ?? null,
        status: (a.status as AssignmentDTO["status"]) ?? "open",
        gradeValue: (a.gradeValue as string) ?? null,
        pointsEarned: (a.pointsEarned as number) ?? null,
        pointsPossible: (a.pointsPossible as number) ?? null,
        provider: (a.provider as string) ?? null,
        canvasAssignmentId: (a.canvasAssignmentId as string) ?? null,
        canvasUrl: (a.canvasUrl as string) ?? null,
        course: a.courseId ? courseLite.get(a.courseId as string) ?? null : null,
        tasks: allTasks.filter((t) => t.assignmentId === a.id).map((t) => ({ id: t.id, status: t.status })),
        linkedTask: null as AssignmentDTO["linkedTask"],
      }));

    /* --- shadow-task dedup: a task that mirrors an assignment (same name, same
       due day, or an explicit link) becomes that assignment's planning layer and
       is hidden from the task lists. --- */
    {
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      const dayKey = (iso: string | null) =>
        iso ? new Date(iso).toISOString().slice(0, 10) : "";
      const byId = new Map(assignments.map((a) => [a.id, a]));
      const byTitleDay = new Map<string, AssignmentDTO>();
      for (const a of assignments) byTitleDay.set(`${norm(a.title)}|${dayKey(a.dueAt)}`, a);

      for (const t of allTasks) {
        let shadow: AssignmentDTO | undefined;
        if (t.assignmentId && byId.has(t.assignmentId)) shadow = byId.get(t.assignmentId);
        else if (t.dueAt) shadow = byTitleDay.get(`${norm(t.title)}|${dayKey(t.dueAt)}`);
        if (shadow) {
          t.shadowOfAssignmentId = shadow.id;
          t.assignment = { id: shadow.id, title: shadow.title };
        }
      }
      for (const a of assignments) {
        const lt =
          allTasks.find((t) => t.shadowOfAssignmentId === a.id && t.assignmentId === a.id) ??
          allTasks.find((t) => t.shadowOfAssignmentId === a.id);
        a.linkedTask = lt
          ? {
              id: lt.id,
              status: lt.status,
              notes: lt.notes,
              estimatedMinutes: lt.estimatedMinutes,
              scheduledAt: lt.scheduledAt ?? null,
              priority: lt.priority,
              dueTime: lt.dueTime ?? null,
              completedAt: lt.completedAt,
            }
          : null;
      }
    }

    const tasks = allTasks.filter((t) => !t.shadowOfAssignmentId);

    const courses: CourseDTO[] = courseRows.map((c) => ({
      id: c.id,
      name: (c.name as string) ?? "",
      code: (c.code as string) ?? null,
      instructor: (c.instructor as string) ?? null,
      color: (c.color as string) ?? "#22d67e",
      term: (c.term as string) ?? null,
      currentGrade: (c.currentGrade as string) ?? null,
      currentScore: (c.currentScore as number) ?? null,
      provider: (c.provider as string) ?? null,
      canvasCourseId: (c.canvasCourseId as string) ?? null,
      canvasUrl: (c.canvasUrl as string) ?? null,
      assignments: assignments
        .filter((a) => a.courseId === c.id)
        .sort((a, b) => (a.dueAt ?? "z").localeCompare(b.dueAt ?? "z")),
    }));

    const events: EventDTO[] = eventsRaw
      .filter((e) => !dup.events.drop.has(e.id))
      .map((e) => ({
      id: e.id,
      title: (e.title as string) ?? "",
      description: (e.description as string) ?? null,
      startAt: (e.startAt as string) ?? now(),
      endAt: (e.endAt as string) ?? now(),
      allDay: Boolean(e.allDay),
      kind: (e.kind as EventDTO["kind"]) ?? "event",
      location: (e.location as string) ?? null,
      locked: typeof e.locked === "boolean" ? (e.locked as boolean) : undefined,
      taskId: (e.taskId as string) ?? null,
      provider: (e.provider as string) ?? null,
      canvasUrl: (e.canvasUrl as string) ?? null,
      canvasEventId: (e.canvasEventId as string) ?? null,
    }));

    const alarms: AlarmDTO[] = alarmsRaw
      .filter((a) => !dup.alarms.drop.has(a.id))
      .map((a) => ({
        id: a.id,
        label: (a.label as string) ?? "Alarm",
        time: (a.time as string) ?? "07:00",
        enabled: a.enabled !== false,
        kind: (a.kind as AlarmDTO["kind"]) ?? "custom",
        repeatDays: (a.repeatDays as string[]) ?? [],
        sound: a.sound !== false,
      }))
      .sort((x, y) => x.time.localeCompare(y.time));

    const focusSessions: FocusSessionDTO[] = focusRaw
      .map((f) => ({
        id: f.id,
        startedAt: (f.startedAt as string) ?? now(),
        endedAt: (f.endedAt as string) ?? now(),
        minutes: (f.minutes as number) ?? 0,
        subject: (f.subject as string) ?? null,
        taskId: (f.taskId as string) ?? null,
        taskTitle: (f.taskTitle as string) ?? null,
      }))
      .sort((x, y) => y.startedAt.localeCompare(x.startedAt));

    const decks: DeckDTO[] = decksRaw
      .map((d) => ({
        id: d.id,
        title: (d.title as string) ?? "Untitled deck",
        description: (d.description as string) ?? null,
        courseId: (d.courseId as string) ?? null,
        subject: (d.subject as string) ?? null,
        // Cards are hydrated defensively: a deck may predate a field, or have
        // been written by an older build of the app.
        cards: (((d.cards as Partial<CardDTO>[]) ?? []) as Partial<CardDTO>[])
          .filter((c) => c && (c.front || c.back))
          .map((c, i) => hydrateCard({ ...c, id: c.id ?? `${d.id}-${i}` })),
        source: (d.source as DeckDTO["source"]) ?? "manual",
        createdAt: (d.createdAt as string) ?? now(),
        lastStudiedAt: (d.lastStudiedAt as string) ?? null,
        bestMatchMs: typeof d.bestMatchMs === "number" ? d.bestMatchMs : null,
        bestRushScore: typeof d.bestRushScore === "number" ? d.bestRushScore : 0,
        sessions: typeof d.sessions === "number" ? d.sessions : 0,
      }))
      // Studied most recently first; never-studied decks fall back to creation.
      .sort((a, b) =>
        (b.lastStudiedAt ?? b.createdAt).localeCompare(a.lastStudiedAt ?? a.createdAt),
      );

    const email = profile?.email || authEmail || "";
    const plan = effectivePlan(profile?.plan, email);
    const planLimits = limitsFor(plan);

    return {
      profile: {
        name: profile?.name ?? "",
        email,
        plan,
        onboarded: Boolean(profile?.onboardedAt),
        gradeYear: profile?.gradeYear ?? null,
        school: profile?.school ?? null,
        goalsText: profile?.goalsText ?? null,
        schedule: profile?.schedule ?? [],
        extracurriculars: profile?.extracurriculars ?? [],
        helpWith: profile?.helpWith ?? [],
        prefs: withPrefs(profile?.prefs),
      },
      tasks,
      allTasks,
      goals,
      courses,
      assignments,
      events,
      alarms,
      focusSessions,
      decks,
      ai,
      limits: {
        plan,
        brainDumpsPerWeek: orNull(planLimits.brainDumpsPerWeek),
        brainDumpsUsedThisWeek: profile?.brainDumpUsage?.[weekKey()] ?? 0,
        assistantPerDay: orNull(planLimits.assistantPerDay),
        assistantUsedToday: profile?.assistantUsage?.[todayKey()] ?? 0,
        maxActiveGoals: orNull(planLimits.maxActiveGoals),
        maxCourses: orNull(planLimits.maxCourses),
        maxDecks: orNull(planLimits.maxDecks),
        fullAnalytics: planLimits.fullAnalytics,
      },
    };
  }, [profile, authEmail, tasksRaw, goalsRaw, coursesRaw, assignmentsRaw, eventsRaw, alarmsRaw, focusRaw, decksRaw, ai]);

  const analytics = useMemo(
    () => deriveAnalytics(data.allTasks, data.goals, data.assignments),
    [data.allTasks, data.goals, data.assignments],
  );

  /* --------------------------------- writes -------------------------------- */
  async function guard<T>(fn: () => Promise<T>, msg: string): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      console.error(msg, e);
      toast(e instanceof Error && e.message.includes("permission") ? "You don't have access to that." : msg, "error");
      return undefined;
    }
  }

  const value = useMemo<AppDataValue>(() => {
    const goalById = () => new Map(goalsRaw.map((g) => [g.id, g]));

    async function recomputeGoal(id: string, milestones: MilestoneDTO[], targetType: string, prevStatus: string) {
      if (targetType !== "milestone" || milestones.length === 0) return {};
      const pct = Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100);
      return {
        progress: pct,
        status: pct === 100 ? "achieved" : prevStatus === "achieved" ? "active" : prevStatus,
      };
    }

    return {
      data,
      analytics,
      ready,
      async refresh() {
        // snapshots keep us live; this force-reads once for good measure
        await Promise.all(["tasks", "goals", "courses", "assignments", "events"].map((n) => getDocs(col(uid, n as never))));
      },

      addTask: (input) =>
        guard(async () => {
          const maxOrder = Math.max(0, ...tasksRaw.map((t) => (t.sortOrder as number) ?? 0));
          const payload = {
            title: input.title ?? "Untitled",
            notes: input.notes ?? null,
            status: input.status ?? "todo",
            priority: input.priority ?? "medium",
            category: input.category ?? null,
            dueAt: input.dueAt ?? null,
            dueTime: input.dueTime ?? null,
            scheduledAt: input.scheduledAt ?? null,
            respectSleep: input.respectSleep ?? true,
            recurrence: input.recurrence ?? "none",
            estimatedMinutes: input.estimatedMinutes ?? null,
            completedAt: null,
            sortOrder: maxOrder + 1,
            source: input.source ?? "manual",
            goalId: input.goalId ?? null,
            courseId: input.courseId ?? null,
            assignmentId: input.assignmentId ?? null,
            createdAt: now(),
            updatedAt: serverTimestamp(),
          };
          const ref = await addDoc(col(uid, "tasks"), payload);
          return { ...(payload as unknown as TaskDTO), id: ref.id };
        }, "Couldn't add task"),

      updateTask: (id, patch) =>
        guard(async () => {
          const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
          for (const [k, v] of Object.entries(patch)) {
            if (["goal", "course", "id"].includes(k)) continue;
            clean[k] = v;
          }
          await updateDoc(entityDoc(uid, "tasks", id), clean);
        }, "Couldn't update task").then(() => undefined),

      toggleTask: (id) =>
        guard(async () => {
          const cur = tasksRaw.find((t) => t.id === id);
          const nextDone = cur?.status !== "done";
          await updateDoc(entityDoc(uid, "tasks", id), {
            status: nextDone ? "done" : "todo",
            completedAt: nextDone ? now() : null,
            updatedAt: serverTimestamp(),
          });
          if (nextDone) {
            pushUndo({
              label: `Completed “${String(cur?.title || "task")}”`,
              undoneMessage: "Marked as not done",
              onUndo: () =>
                updateDoc(entityDoc(uid, "tasks", id), {
                  status: "todo",
                  completedAt: null,
                  updatedAt: serverTimestamp(),
                }),
            });
          }
        }, "Couldn't update task").then(() => undefined),

      deleteTask: (id) =>
        guard(async () => {
          const snap = tasksRaw.find((t) => t.id === id);
          await deleteDoc(entityDoc(uid, "tasks", id));
          if (snap) {
            const restore = stripId(snap);
            pushUndo({
              label: `Deleted “${String(snap.title || "task")}”`,
              onUndo: () => setDoc(entityDoc(uid, "tasks", id), restore),
            });
          }
        }, "Couldn't delete task").then(() => undefined),

      reorderTasks: (ids) =>
        guard(async () => {
          const batch = writeBatch(db());
          ids.forEach((id, i) => batch.update(entityDoc(uid, "tasks", id), { sortOrder: i }));
          await batch.commit();
        }, "Couldn't reorder").then(() => undefined),

      addEvent: (input) =>
        guard(async () => {
          const payload = {
            title: input.title,
            description: input.description ?? null,
            startAt: input.startAt,
            endAt: input.endAt,
            allDay: false,
            kind: input.kind ?? "event",
            location: input.location ?? null,
            locked: input.locked ?? null,
            taskId: null,
            createdAt: now(),
          };
          const ref = await addDoc(col(uid, "events"), payload);
          return { ...(payload as unknown as EventDTO), id: ref.id };
        }, "Couldn't add event"),

      updateEvent: (id, patch) =>
        guard(() => updateDoc(entityDoc(uid, "events", id), patch as Record<string, unknown>), "Couldn't update event").then(() => undefined),

      deleteEvent: (id) =>
        guard(async () => {
          const snap = eventsRaw.find((e) => e.id === id);
          await deleteDoc(entityDoc(uid, "events", id));
          if (snap) {
            const restore = stripId(snap);
            pushUndo({
              label: `Deleted “${String(snap.title || "event")}”`,
              onUndo: () => setDoc(entityDoc(uid, "events", id), restore),
            });
          }
        }, "Couldn't delete event").then(() => undefined),

      addGoal: (input) => {
        const cap = data.limits.maxActiveGoals;
        if (cap !== null && goalsRaw.filter((g) => (g.status ?? "active") === "active").length >= cap) {
          toast(`Your plan tops out at ${cap} active goals. Upgrade to Student+ for more.`, "error");
          return Promise.resolve(undefined);
        }
        return guard(async () => {
          const targetType = (input.targetType as string) ?? "milestone";
          const milestones = ((input.milestones as string[]) ?? [])
            .filter(Boolean)
            .map((title, i) => ({ id: rid(), title, done: false, dueAt: null, sortOrder: i }));
          const payload = {
            title: (input.title as string).trim(),
            description: (input.description as string) ?? null,
            category: (input.category as string) ?? null,
            targetType,
            habitPerWeek: targetType === "habit" ? (input.habitPerWeek as number) ?? 3 : null,
            progress: 0,
            status: "active",
            dueAt: (input.dueAt as string) ?? null,
            milestones,
            habitLogs: [],
            createdAt: now(),
          };
          const ref = await addDoc(col(uid, "goals"), payload);
          return { ...(payload as unknown as GoalDTO), id: ref.id, tasks: [] };
        }, "Couldn't create goal");
      },

      updateGoal: (id, patch) =>
        guard(async () => {
          const clean: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(patch)) {
            if (["milestones", "habitLogs", "tasks", "id"].includes(k)) continue;
            clean[k] = v;
          }
          if (patch.status === "achieved") clean.progress = 100;
          await updateDoc(entityDoc(uid, "goals", id), clean);
        }, "Couldn't update goal").then(() => undefined),

      deleteGoal: (id) =>
        guard(async () => {
          const snap = goalsRaw.find((g) => g.id === id);
          await deleteDoc(entityDoc(uid, "goals", id));
          if (snap) {
            const restore = stripId(snap);
            pushUndo({
              label: `Deleted goal “${String(snap.title || "goal")}”`,
              onUndo: () => setDoc(entityDoc(uid, "goals", id), restore),
            });
          }
        }, "Couldn't delete goal").then(() => undefined),

      goalAction: (id, body) =>
        guard(async () => {
          const g = goalById().get(id);
          if (!g) return;
          if (body.action === "log-habit") {
            const logs = [...((g.habitLogs as unknown[]) ?? []), { id: rid(), date: now() }];
            await updateDoc(entityDoc(uid, "goals", id), { habitLogs: logs });
          } else if (body.action === "add-milestone" && body.title) {
            const ms = ((g.milestones as MilestoneDTO[]) ?? []);
            ms.push({ id: rid(), title: body.title.slice(0, 200), done: false, dueAt: null, sortOrder: ms.length });
            await updateDoc(entityDoc(uid, "goals", id), { milestones: ms });
          }
        }, "Couldn't update goal").then(() => undefined),

      toggleMilestone: (goalId, milestoneId, done) =>
        guard(async () => {
          const g = goalById().get(goalId);
          if (!g) return;
          const ms = ((g.milestones as MilestoneDTO[]) ?? []).map((m) =>
            m.id === milestoneId ? { ...m, done } : m,
          );
          const extra = await recomputeGoal(goalId, ms, g.targetType as string, g.status as string);
          await updateDoc(entityDoc(uid, "goals", goalId), { milestones: ms, ...extra });
        }, "Couldn't update milestone").then(() => undefined),

      addCourse: (input) => {
        const cap = data.limits.maxCourses;
        if (cap !== null && coursesRaw.length >= cap) {
          toast(`Your plan tops out at ${cap} courses. Upgrade to Student+ for more.`, "error");
          return Promise.resolve(undefined);
        }
        return guard(async () => {
          const payload = {
            name: (input.name as string).trim(),
            code: (input.code as string) || null,
            instructor: (input.instructor as string) || null,
            color: (input.color as string) || "#22d67e",
            term: (input.term as string) || null,
            currentGrade: (input.currentGrade as string) || null,
            provider: null,
            createdAt: now(),
          };
          const ref = await addDoc(col(uid, "courses"), payload);
          return { ...(payload as unknown as CourseDTO), id: ref.id, assignments: [] };
        }, "Couldn't add course");
      },

      updateCourse: (id, patch) =>
        guard(() => updateDoc(entityDoc(uid, "courses", id), patch as Record<string, unknown>), "Couldn't update course").then(() => undefined),

      deleteCourse: (id) =>
        guard(async () => {
          const courseSnap = coursesRaw.find((c) => c.id === id);
          const children = assignmentsRaw.filter((a) => a.courseId === id);
          const batch = writeBatch(db());
          batch.delete(entityDoc(uid, "courses", id));
          children.forEach((a) => batch.delete(entityDoc(uid, "assignments", a.id)));
          await batch.commit();

          // A deleted Canvas course must stay gone across re-syncs: drop it from
          // the Canvas pick list too (best-effort — a plain sync already only
          // refreshes courses still present, this just keeps the picker honest).
          const canvasCourseId =
            courseSnap && courseSnap.provider === "canvas" && courseSnap.canvasCourseId
              ? String(courseSnap.canvasCourseId)
              : null;
          const patchSelection = (op: "forget" | "restore") =>
            void authedApi("/api/canvas/courses", {
              method: "PATCH",
              body: { canvasCourseId, op },
            }).catch(() => {});
          if (canvasCourseId) patchSelection("forget");

          if (courseSnap) {
            const courseRestore = stripId(courseSnap);
            const childRestore = children.map((a) => ({ id: a.id, data: stripId(a) }));
            pushUndo({
              label: `Deleted course “${String(courseSnap.name || "course")}”`,
              onUndo: async () => {
                const b = writeBatch(db());
                b.set(entityDoc(uid, "courses", id), courseRestore);
                childRestore.forEach((c) => b.set(entityDoc(uid, "assignments", c.id), c.data));
                await b.commit();
                if (canvasCourseId) patchSelection("restore");
              },
            });
          }
        }, "Couldn't delete course").then(() => undefined),

      addAssignment: (input) =>
        guard(async () => {
          const payload = {
            title: (input.title as string).trim(),
            description: (input.description as string) ?? null,
            courseId: (input.courseId as string) ?? null,
            dueAt: (input.dueAt as string) ?? null,
            status: (input.status as string) ?? "open",
            gradeValue: (input.gradeValue as string) ?? null,
            pointsEarned: (input.pointsEarned as number) ?? null,
            pointsPossible: (input.pointsPossible as number) ?? null,
            createdAt: now(),
          };
          const ref = await addDoc(col(uid, "assignments"), payload);
          return { ...(payload as unknown as AssignmentDTO), id: ref.id };
        }, "Couldn't add assignment"),

      updateAssignment: (id, patch) =>
        guard(() => updateDoc(entityDoc(uid, "assignments", id), patch as Record<string, unknown>), "Couldn't update assignment").then(() => undefined),

      deleteAssignment: (id) =>
        guard(async () => {
          const snap = assignmentsRaw.find((a) => a.id === id);
          await deleteDoc(entityDoc(uid, "assignments", id));
          if (snap) {
            const restore = stripId(snap);
            pushUndo({
              label: `Deleted “${String(snap.title || "assignment")}”`,
              onUndo: () => setDoc(entityDoc(uid, "assignments", id), restore),
            });
          }
        }, "Couldn't delete assignment").then(() => undefined),

      createTaskForAssignment: (assignmentId) =>
        guard(async () => {
          const a = assignmentsRaw.find((x) => x.id === assignmentId);
          if (!a) return;
          const maxOrder = Math.max(0, ...tasksRaw.map((t) => (t.sortOrder as number) ?? 0));
          await addDoc(col(uid, "tasks"), {
            title: a.title,
            notes: null,
            status: "todo",
            priority: "high",
            category: null,
            dueAt: (a.dueAt as string) ?? null,
            estimatedMinutes: null,
            completedAt: null,
            sortOrder: maxOrder + 1,
            source: "assignment",
            goalId: null,
            courseId: (a.courseId as string) ?? null,
            assignmentId,
            createdAt: now(),
          });
          toast("Added to your tasks", "success");
        }, "Couldn't create task").then(() => undefined),

      commitBrainDump: async (items, rawText) => {
        return (
          (await guard(async () => {
            const batch = writeBatch(db());
            let order = Math.max(0, ...tasksRaw.map((t) => (t.sortOrder as number) ?? 0));
            // link a task to a real course when its subject matches one
            const courseByName = new Map(
              coursesRaw.map((c) => [String(c.name ?? "").trim().toLowerCase(), c.id]),
            );
            for (const it of items) {
              const cat = (it.category ?? "").trim();
              const courseId = cat ? courseByName.get(cat.toLowerCase()) ?? null : null;
              batch.set(doc(col(uid, "tasks")), {
                title: it.title.trim(),
                notes: it.notes ?? null,
                status: "todo",
                priority: it.priority,
                category: it.category ?? null,
                dueAt: it.dueAt ?? null,
                estimatedMinutes: it.estimatedMinutes ?? null,
                completedAt: null,
                sortOrder: ++order,
                source: "brain_dump",
                goalId: null,
                courseId,
                assignmentId: null,
                createdAt: now(),
              });
            }
            batch.set(doc(col(uid, "brainDumps")), {
              rawText,
              createdAt: now(),
              count: items.length,
            });
            await batch.commit();
            return items.length;
          }, "Couldn't save those tasks")) ?? 0
        );
      },

      noteBrainDumpUsed: () => {
        const key = weekKey();
        const usage = { ...(profile?.brainDumpUsage ?? {}) };
        usage[key] = (usage[key] ?? 0) + 1;
        updateDoc(userDoc(uid), { brainDumpUsage: usage }).catch(() => {});
      },

      setPlan: (plan) => {
        updateDoc(userDoc(uid), { plan, planUpdatedAt: now() }).catch(() => {});
      },

      patchProfile: (patch) => {
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          if (k === "prefs" || k === "onboarded") continue;
          clean[k] = v;
        }
        updateDoc(userDoc(uid), clean).catch(() => {});
      },

      updatePrefs: (patch: Partial<Prefs>) => {
        const next = { ...withPrefs(profile?.prefs), ...patch };
        if (patch.reminders) next.reminders = { ...withPrefs(profile?.prefs).reminders, ...patch.reminders };
        return updateDoc(userDoc(uid), { prefs: next }).catch((e) => {
          console.error("updatePrefs failed", e);
          toast("Couldn't save that setting", "error");
        });
      },

      addAlarm: (input) =>
        guard(async () => {
          await addDoc(col(uid, "alarms"), {
            label: input.label.trim() || "Alarm",
            time: input.time,
            enabled: input.enabled ?? true,
            kind: input.kind ?? "custom",
            repeatDays: input.repeatDays ?? [],
            sound: input.sound ?? true,
            createdAt: now(),
          });
        }, "Couldn't create alarm").then(() => undefined),

      updateAlarm: (id, patch) =>
        guard(() => updateDoc(entityDoc(uid, "alarms", id), patch as Record<string, unknown>), "Couldn't update alarm").then(() => undefined),

      deleteAlarm: (id) =>
        guard(async () => {
          const snap = alarmsRaw.find((a) => a.id === id);
          await deleteDoc(entityDoc(uid, "alarms", id));
          if (snap) {
            const restore = stripId(snap);
            pushUndo({
              label: `Deleted alarm “${String(snap.label || "alarm")}”`,
              onUndo: () => setDoc(entityDoc(uid, "alarms", id), restore),
            });
          }
        }, "Couldn't delete alarm").then(() => undefined),

      logFocusSession: (s) =>
        guard(async () => {
          await addDoc(col(uid, "focusSessions"), { ...s, createdAt: now() });
        }, "Couldn't save session").then(() => undefined),

      /* ------------------------------ Practice ------------------------------ */

      addDeck: (input) =>
        guard(async () => {
          const cards = toCards(input.cards);
          if (!cards.length) throw new Error("A deck needs at least one card.");
          const doc = {
            title: input.title.trim().slice(0, 120) || "Untitled deck",
            description: input.description?.trim() || null,
            courseId: input.courseId ?? null,
            subject: input.subject?.trim() || null,
            cards,
            source: input.source ?? "manual",
            createdAt: now(),
            lastStudiedAt: null,
            bestMatchMs: null,
            bestRushScore: 0,
            sessions: 0,
          };
          const ref = await addDoc(col(uid, "decks"), doc);
          return { id: ref.id, ...doc } as DeckDTO;
        }, "Couldn't create that deck"),

      updateDeck: (id, patch) =>
        guard(
          () => updateDoc(entityDoc(uid, "decks", id), patch as Record<string, unknown>),
          "Couldn't update that deck",
        ).then(() => undefined),

      deleteDeck: (id) =>
        guard(async () => {
          const snap = decksRaw.find((d) => d.id === id);
          await deleteDoc(entityDoc(uid, "decks", id));
          if (snap) {
            const restore = stripId(snap);
            pushUndo({
              label: `Deleted deck \u201C${String(snap.title || "deck")}\u201D`,
              onUndo: () => setDoc(entityDoc(uid, "decks", id), restore),
            });
          }
        }, "Couldn't delete that deck").then(() => undefined),

      setDeckCards: (id, cards) =>
        guard(async () => {
          const existing = decksRaw.find((d) => d.id === id);
          const before = ((existing?.cards as Partial<CardDTO>[]) ?? []).filter(Boolean);
          // Preserve each surviving card's spaced-repetition history: match on
          // the front text so editing a definition doesn't reset the streak.
          const byFront = new Map(
            before.map((c) => [String(c.front ?? "").trim().toLowerCase(), c]),
          );
          const next = toCards(cards).map((c) => {
            const prev = byFront.get(c.front.trim().toLowerCase());
            return prev
              ? { ...c, streak: prev.streak ?? 0, ease: prev.ease ?? 2.5, dueAt: prev.dueAt ?? null,
                  lapses: prev.lapses ?? 0, seen: prev.seen ?? 0, correct: prev.correct ?? 0,
                  id: prev.id ?? c.id }
              : c;
          });
          if (!next.length) throw new Error("A deck needs at least one card.");
          await updateDoc(entityDoc(uid, "decks", id), { cards: next });
        }, "Couldn't save those cards").then(() => undefined),

      recordSession: (id, result) =>
        guard(async () => {
          const existing = decksRaw.find((d) => d.id === id);
          const patch: Record<string, unknown> = {
            cards: result.cards,
            lastStudiedAt: now(),
            sessions: (typeof existing?.sessions === "number" ? existing.sessions : 0) + 1,
          };
          // Personal bests: fastest Match run, highest Rush score.
          if (result.mode === "match" && result.elapsedMs != null) {
            const best = existing?.bestMatchMs;
            if (typeof best !== "number" || result.elapsedMs < best) patch.bestMatchMs = result.elapsedMs;
          }
          if (result.mode === "rush" && result.score != null) {
            const best = typeof existing?.bestRushScore === "number" ? existing.bestRushScore : 0;
            if (result.score > best) patch.bestRushScore = result.score;
          }
          await updateDoc(entityDoc(uid, "decks", id), patch);
        }, "Couldn't save your progress").then(() => undefined),
    };
  }, [data, analytics, ready, uid, profile, tasksRaw, goalsRaw, coursesRaw, assignmentsRaw, eventsRaw, alarmsRaw, decksRaw]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { goalProgress };
