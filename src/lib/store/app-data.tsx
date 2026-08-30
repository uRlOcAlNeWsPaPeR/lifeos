"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  withPrefs,
  type ProfileDoc,
  type Prefs,
} from "@/lib/firebase/schema";
import { deriveAnalytics, goalProgress, type AnalyticsSummary } from "@/lib/analytics-derive";
import { limitsFor, effectivePlan } from "@/lib/plan-limits";
import { api } from "@/lib/client";
import { toast } from "@/components/ui/toaster";
import type {
  AlarmDTO,
  AssignmentDTO,
  CourseDTO,
  EventDTO,
  FocusSessionDTO,
  GoalDTO,
  MilestoneDTO,
  TaskDTO,
} from "@/lib/types";

const rid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const now = () => new Date().toISOString();

type Raw<T> = T & { id: string };

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
  tasks: TaskDTO[];
  goals: GoalDTO[];
  courses: CourseDTO[];
  assignments: AssignmentDTO[];
  events: EventDTO[];
  alarms: AlarmDTO[];
  focusSessions: FocusSessionDTO[];
  ai: { engine: string; label: string };
  limits: {
    plan: string;
    brainDumpsPerDay: number | null;
    brainDumpsUsedToday: number;
    assistantPerDay: number | null;
    assistantUsedToday: number;
    maxActiveGoals: number | null;
    maxCourses: number | null;
    fullAnalytics: boolean;
  };
}

const orNull = (n: number) => (n === Infinity ? null : n);

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
  const [loaded, setLoaded] = useState({ profile: false, tasks: false, goals: false, courses: false, assignments: false, events: false });

  useEffect(() => {
    api<{ engine: string; label: string }>("/api/session")
      .then(setAi)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const mark = (k: keyof typeof loaded) => setLoaded((s) => (s[k] ? s : { ...s, [k]: true }));
    const snap =
      <T,>(
        name: "tasks" | "goals" | "courses" | "assignments" | "events" | "alarms" | "focusSessions",
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
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  const ready = Object.values(loaded).every(Boolean);

  /* -------- derive enriched DTOs (writes stay flat, reads are rich) -------- */
  const data = useMemo<StoreData>(() => {
    const courseLite = new Map(
      coursesRaw.map((c) => [c.id, { id: c.id, name: c.name as string, color: (c.color as string) ?? "#22d67e" }]),
    );
    const goalLite = new Map(goalsRaw.map((g) => [g.id, { id: g.id, title: g.title as string }]));

    const tasks: TaskDTO[] = tasksRaw.map((t) => ({
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
    }));

    const goals: GoalDTO[] = goalsRaw.map((g) => {
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
        tasks: tasks
          .filter((t) => t.goalId === g.id)
          .map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt })),
      };
    });

    const assignments: AssignmentDTO[] = assignmentsRaw.map((a) => ({
      id: a.id,
      title: (a.title as string) ?? "",
      description: (a.description as string) ?? null,
      courseId: (a.courseId as string) ?? null,
      dueAt: (a.dueAt as string) ?? null,
      status: (a.status as AssignmentDTO["status"]) ?? "open",
      gradeValue: (a.gradeValue as string) ?? null,
      pointsEarned: (a.pointsEarned as number) ?? null,
      pointsPossible: (a.pointsPossible as number) ?? null,
      course: a.courseId ? courseLite.get(a.courseId as string) ?? null : null,
      tasks: tasks.filter((t) => t.assignmentId === a.id).map((t) => ({ id: t.id, status: t.status })),
    }));

    const courses: CourseDTO[] = coursesRaw.map((c) => ({
      id: c.id,
      name: (c.name as string) ?? "",
      code: (c.code as string) ?? null,
      instructor: (c.instructor as string) ?? null,
      color: (c.color as string) ?? "#22d67e",
      term: (c.term as string) ?? null,
      currentGrade: (c.currentGrade as string) ?? null,
      provider: (c.provider as string) ?? null,
      assignments: assignments
        .filter((a) => a.courseId === c.id)
        .sort((a, b) => (a.dueAt ?? "z").localeCompare(b.dueAt ?? "z")),
    }));

    const events: EventDTO[] = eventsRaw.map((e) => ({
      id: e.id,
      title: (e.title as string) ?? "",
      description: (e.description as string) ?? null,
      startAt: (e.startAt as string) ?? now(),
      endAt: (e.endAt as string) ?? now(),
      allDay: Boolean(e.allDay),
      kind: (e.kind as EventDTO["kind"]) ?? "event",
      location: (e.location as string) ?? null,
      taskId: (e.taskId as string) ?? null,
    }));

    const alarms: AlarmDTO[] = alarmsRaw
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
      goals,
      courses,
      assignments,
      events,
      alarms,
      focusSessions,
      ai,
      limits: {
        plan,
        brainDumpsPerDay: orNull(planLimits.brainDumpsPerDay),
        brainDumpsUsedToday: profile?.brainDumpUsage?.[todayKey()] ?? 0,
        assistantPerDay: orNull(planLimits.assistantPerDay),
        assistantUsedToday: profile?.assistantUsage?.[todayKey()] ?? 0,
        maxActiveGoals: orNull(planLimits.maxActiveGoals),
        maxCourses: orNull(planLimits.maxCourses),
        fullAnalytics: planLimits.fullAnalytics,
      },
    };
  }, [profile, authEmail, tasksRaw, goalsRaw, coursesRaw, assignmentsRaw, eventsRaw, alarmsRaw, focusRaw, ai]);

  const analytics = useMemo(
    () => deriveAnalytics(data.tasks, data.goals, data.assignments),
    [data.tasks, data.goals, data.assignments],
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
        }, "Couldn't update task").then(() => undefined),

      deleteTask: (id) =>
        guard(() => deleteDoc(entityDoc(uid, "tasks", id)), "Couldn't delete task").then(() => undefined),

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
            taskId: null,
            createdAt: now(),
          };
          const ref = await addDoc(col(uid, "events"), payload);
          return { ...(payload as unknown as EventDTO), id: ref.id };
        }, "Couldn't add event"),

      updateEvent: (id, patch) =>
        guard(() => updateDoc(entityDoc(uid, "events", id), patch as Record<string, unknown>), "Couldn't update event").then(() => undefined),

      deleteEvent: (id) =>
        guard(() => deleteDoc(entityDoc(uid, "events", id)), "Couldn't delete event").then(() => undefined),

      addGoal: (input) => {
        const cap = data.limits.maxActiveGoals;
        if (cap !== null && goalsRaw.filter((g) => (g.status ?? "active") === "active").length >= cap) {
          toast(`The ${data.limits.plan === "free" ? "Free" : "Pro"} plan tops out at ${cap} active goals. Upgrade for more.`, "error");
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
        guard(() => deleteDoc(entityDoc(uid, "goals", id)), "Couldn't delete goal").then(() => undefined),

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
          toast(`The ${data.limits.plan === "free" ? "Free" : "Pro"} plan tops out at ${cap} courses. Upgrade for more.`, "error");
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
          const batch = writeBatch(db());
          batch.delete(entityDoc(uid, "courses", id));
          assignmentsRaw.filter((a) => a.courseId === id).forEach((a) => batch.delete(entityDoc(uid, "assignments", a.id)));
          await batch.commit();
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
        guard(() => deleteDoc(entityDoc(uid, "assignments", id)), "Couldn't delete assignment").then(() => undefined),

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
            for (const it of items) {
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
                courseId: null,
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
        const key = todayKey();
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
        guard(() => deleteDoc(entityDoc(uid, "alarms", id)), "Couldn't delete alarm").then(() => undefined),

      logFocusSession: (s) =>
        guard(async () => {
          await addDoc(col(uid, "focusSessions"), { ...s, createdAt: now() });
        }, "Couldn't save session").then(() => undefined),
    };
  }, [data, analytics, ready, uid, profile, tasksRaw, goalsRaw, coursesRaw, assignmentsRaw, eventsRaw, alarmsRaw, focusRaw]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { goalProgress };
