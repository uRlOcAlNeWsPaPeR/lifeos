import { z } from "zod";

export const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

const isoDate = z
  .string()
  .datetime()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
  .nullable()
  .optional();

export const signupSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({ email: z.string().email() });

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

export const onboardingSchema = z.object({
  name: z.string().min(1).max(80),
  gradeYear: z.string().max(40).optional().default(""),
  school: z.string().max(120).optional().default(""),
  goalsText: z.string().max(2000).optional().default(""),
  schedule: z
    .array(
      z.object({
        day: z.string(),
        label: z.string().max(80),
        start: z.string().max(12),
        end: z.string().max(12),
      }),
    )
    .max(40)
    .optional()
    .default([]),
  extracurriculars: z.array(z.string().max(80)).max(20).optional().default([]),
  helpWith: z.array(z.string().max(80)).max(20).optional().default([]),
});

export const taskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(4000).optional().nullable(),
  priority: priorityEnum.optional().default("medium"),
  category: z.string().max(60).optional().nullable(),
  dueAt: isoDate,
  estimatedMinutes: z.number().int().min(0).max(1440).optional().nullable(),
  goalId: z.string().optional().nullable(),
  courseId: z.string().optional().nullable(),
  assignmentId: z.string().optional().nullable(),
  source: z.string().optional(),
});

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  status: z.enum(["todo", "done"]).optional(),
  sortOrder: z.number().int().optional(),
});

export const reorderSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export const goalCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(60).optional().nullable(),
  targetType: z.enum(["milestone", "habit"]).default("milestone"),
  habitPerWeek: z.number().int().min(1).max(21).optional().nullable(),
  dueAt: isoDate,
  milestones: z.array(z.string().max(200)).max(20).optional().default([]),
});

export const goalUpdateSchema = goalCreateSchema.partial().extend({
  progress: z.number().int().min(0).max(100).optional(),
  status: z.enum(["active", "achieved", "archived"]).optional(),
});

export const milestoneSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  done: z.boolean().optional(),
  dueAt: isoDate,
});

export const courseSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().max(40).optional().nullable(),
  instructor: z.string().max(120).optional().nullable(),
  color: z.string().max(20).optional(),
  term: z.string().max(60).optional().nullable(),
  currentGrade: z.string().max(20).optional().nullable(),
});

export const assignmentSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  courseId: z.string().optional().nullable(),
  dueAt: isoDate,
  status: z.enum(["open", "submitted", "graded"]).optional(),
  gradeValue: z.string().max(20).optional().nullable(),
  pointsEarned: z.number().optional().nullable(),
  pointsPossible: z.number().optional().nullable(),
});

export const eventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  allDay: z.boolean().optional().default(false),
  kind: z.enum(["event", "study_session", "class", "deadline"]).optional().default("event"),
  location: z.string().max(200).optional().nullable(),
  taskId: z.string().optional().nullable(),
});

export const brainDumpSchema = z.object({
  text: z.string().min(3, "Type at least a sentence").max(5000),
});

export const brainDumpCommitSchema = z.object({
  brainDumpId: z.string(),
  items: z.array(
    z.object({
      title: z.string().min(1).max(200),
      category: z.string().max(60).optional().nullable(),
      priority: priorityEnum,
      dueAt: isoDate,
      estimatedMinutes: z.number().int().min(0).max(1440).optional().nullable(),
      suggestedSlot: z.string().max(120).optional().nullable(),
      reason: z.string().max(600).optional().nullable(),
      accepted: z.boolean(),
    }),
  ),
});

export const assistantSchema = z.object({
  question: z.string().min(2).max(1000),
});

export const planUpgradeSchema = z.object({
  plan: z.enum(["free", "student_plus"]),
});

export const canvasConnectSchema = z.object({
  instanceUrl: z.string().min(3).max(255),
  origin: z.enum(["settings", "onboarding", "school"]).optional().default("settings"),
});

export const canvasDisconnectSchema = z.object({
  // What to do with Canvas-imported tasks — made explicit, never silent.
  canvasTasks: z.enum(["keep", "remove"]).default("keep"),
});

// DEV ONLY — pasted Canvas personal access token.
export const canvasTokenConnectSchema = z.object({
  instanceUrl: z.string().min(3).max(255),
  accessToken: z.string().min(20).max(300),
});
