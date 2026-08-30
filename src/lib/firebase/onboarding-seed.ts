"use client";

import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./client";
import { col, userDoc, withPrefs, type Prefs } from "./schema";
import { guessCategory, splitFragments, titleCase } from "@/lib/ai/nlp";

export interface OnboardingInput {
  name: string;
  gradeYear: string;
  school: string;
  goalsText: string;
  schedule: { day: string; label: string; start: string; end: string }[];
  extracurriculars: string[];
  helpWith: string[];
  prefs?: Partial<Prefs>;
}

const COURSE_COLORS = ["#22d67e", "#14c9b8", "#4f7dff", "#a855f7", "#ec4899", "#f59e0b", "#ef4444"];
const iso = () => new Date().toISOString();
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function parseHM(hm: string): [number | null, number | null] {
  const m = (hm ?? "").trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return [null, null];
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return [h, min];
}

/**
 * Write the profile + a starter dashboard (courses / goals / class blocks /
 * orientation tasks) to Firestore in one batch. No fake deadlines are invented.
 */
export async function completeOnboarding(uid: string, input: OnboardingInput) {
  const batch = writeBatch(db());
  const now = new Date();
  const dayIndex: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };

  // profile
  batch.set(
    userDoc(uid),
    {
      name: input.name.trim(),
      gradeYear: input.gradeYear || null,
      school: input.school || null,
      goalsText: input.goalsText || null,
      schedule: input.schedule.filter((b) => b.label.trim()),
      extracurriculars: input.extracurriculars,
      helpWith: input.helpWith,
      prefs: withPrefs(input.prefs),
      onboardedAt: iso(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // courses from schedule
  const classLabels = Array.from(
    new Set(
      input.schedule
        .map((b) => b.label.trim())
        .filter((l) => l && !/^(free|lunch|study hall|advisory|break)$/i.test(l)),
    ),
  );
  classLabels.forEach((label, i) => {
    batch.set(doc(col(uid, "courses")), {
      name: titleCase(label),
      code: null,
      instructor: null,
      color: COURSE_COLORS[i % COURSE_COLORS.length],
      term: "Current term",
      currentGrade: null,
      provider: null,
      createdAt: iso(),
    });
  });

  // goals from free text
  splitFragments(input.goalsText).slice(0, 5).forEach((phrase) => {
    const title = titleCase(phrase.replace(/^i want to |^i'd like to |^my goal is to /i, ""));
    const perWeek = phrase.match(/\b(\d+)\s*(x|times)\s*(a|per)\s*week\b/i);
    const isHabit = Boolean(perWeek) || /\bevery day\b|\bdaily\b/i.test(phrase);
    batch.set(doc(col(uid, "goals")), {
      title,
      description: null,
      category: guessCategory(phrase),
      targetType: isHabit ? "habit" : "milestone",
      habitPerWeek: isHabit ? (perWeek ? parseInt(perWeek[1], 10) : 5) : null,
      progress: 0,
      status: "active",
      dueAt: null,
      milestones: isHabit
        ? []
        : [
            { id: rid(), title: "Define what success looks like", done: false, dueAt: null, sortOrder: 0 },
            { id: rid(), title: "Make a weekly plan", done: false, dueAt: null, sortOrder: 1 },
            { id: rid(), title: "First checkpoint review", done: false, dueAt: null, sortOrder: 2 },
          ],
      habitLogs: [],
      createdAt: iso(),
    });
  });

  // class blocks on the calendar (this week)
  input.schedule.forEach((block) => {
    const di = dayIndex[block.day?.toLowerCase() ?? ""];
    if (di === undefined || !block.label.trim()) return;
    const [sh, sm] = parseHM(block.start);
    const [eh, em] = parseHM(block.end);
    if (sh === null) return;
    const date = new Date(now);
    date.setDate(date.getDate() + ((di - date.getDay() + 7) % 7));
    const startAt = new Date(date);
    startAt.setHours(sh, sm ?? 0, 0, 0);
    const endAt = new Date(date);
    endAt.setHours(eh ?? sh + 1, em ?? 0, 0, 0);
    batch.set(doc(col(uid, "events")), {
      title: titleCase(block.label),
      description: null,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      allDay: false,
      kind: "class",
      location: null,
      taskId: null,
      createdAt: iso(),
    });
  });

  // orientation tasks
  const starter = [
    { title: "Add this week's assignments on the School page", minutes: 10 },
    { title: "Try a Brain Dump — type everything on your mind", minutes: 5 },
  ];
  if (classLabels[0]) {
    starter.push({ title: `Set your target grade for ${titleCase(classLabels[0])}`, minutes: 5 });
  }
  starter.forEach((s, i) => {
    batch.set(doc(col(uid, "tasks")), {
      title: s.title,
      notes: null,
      status: "todo",
      priority: "low",
      category: "LifeOS",
      dueAt: null,
      estimatedMinutes: s.minutes,
      completedAt: null,
      sortOrder: i,
      source: "ai",
      goalId: null,
      courseId: null,
      assignmentId: null,
      createdAt: iso(),
    });
  });

  await batch.commit();
}
