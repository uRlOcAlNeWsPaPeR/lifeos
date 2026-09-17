import "server-only";
import type { CanvasAssignment, CanvasAssignmentGroup, CanvasCalendarEvent, CanvasCourse } from "./types";

// Canned Canvas data for CANVAS_MOCK=1 — lets the full connect → sync → dedupe →
// UI path be exercised end-to-end without a real developer key. IDs are stable
// across calls so re-syncing must NOT create duplicates.

function daysFromNow(n: number, hour = 23, minute = 59): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const MOCK_COURSES: CanvasCourse[] = [
  {
    id: 101,
    name: "AP Calculus AB",
    course_code: "MATH-AP-CALC",
    workflow_state: "available",
    term: { id: 1, name: "Fall 2026" },
    enrollments: [
      { type: "student", enrollment_state: "active", computed_current_grade: "A-", computed_current_score: 91 },
    ],
    teachers: [{ id: 900, display_name: "Ms. Diane York" }],
    apply_assignment_group_weights: true,
  },
  {
    id: 102,
    name: "Physics 1",
    course_code: "SCI-PHYS-1",
    workflow_state: "available",
    term: { id: 1, name: "Fall 2026" },
    enrollments: [
      { type: "student", enrollment_state: "active", computed_current_grade: "B+", computed_current_score: 88 },
    ],
    teachers: [{ id: 901, display_name: "Mr. Alan Reyes" }],
  },
  {
    id: 103,
    name: "English Literature",
    course_code: "ENG-LIT",
    workflow_state: "available",
    term: { id: 1, name: "Fall 2026" },
    enrollments: [{ type: "student", enrollment_state: "active" }],
    teachers: [{ id: 902, display_name: "Mrs. Karen Odom" }],
  },
  // duplicate row for a cross-listed section — must NOT create a second subject
  {
    id: 103,
    name: "English Literature",
    course_code: "ENG-LIT-B",
    workflow_state: "available",
    term: { id: 1, name: "Fall 2026" },
    enrollments: [{ type: "student", enrollment_state: "active" }],
    teachers: [{ id: 902, display_name: "Mrs. Karen Odom" }],
  },
  // last year's class — concluded, must be skipped on import
  {
    id: 104,
    name: "World History",
    course_code: "HIST-1",
    workflow_state: "completed",
    term: { id: 0, name: "Spring 2026" },
    enrollments: [{ type: "student", enrollment_state: "completed", computed_current_grade: "A" }],
  },
];

export function mockAssignments(courseId: number): CanvasAssignment[] {
  const base = `https://mock.instructure.com/courses/${courseId}/assignments`;
  switch (courseId) {
    case 101:
      return [
        {
          id: 5001,
          course_id: 101,
          name: "Math Homework 4",
          description: "Section 3.2 – 3.4, all odd problems.",
          due_at: daysFromNow(2),
          html_url: `${base}/5001`,
          points_possible: 20,
          published: true,
          submission: { workflow_state: "unsubmitted", submitted_at: null },
          assignment_group_id: 9002,
        },
        {
          id: 5003,
          course_id: 101,
          name: "Unit 1 Test: Limits",
          description: null,
          due_at: daysFromNow(-8, 15, 0),
          html_url: `${base}/5003`,
          points_possible: 50,
          published: true,
          submission: {
            workflow_state: "graded",
            submitted_at: daysFromNow(-8, 14, 0),
            graded_at: daysFromNow(-6, 9, 0),
            score: 46,
            grade: "A-",
          },
          assignment_group_id: 9001,
        },
        {
          id: 5004,
          course_id: 101,
          name: "Math Homework 1-3",
          description: null,
          due_at: daysFromNow(-12),
          html_url: `${base}/5004`,
          points_possible: 60,
          published: true,
          submission: {
            workflow_state: "graded",
            submitted_at: daysFromNow(-13, 20, 0),
            graded_at: daysFromNow(-11, 12, 0),
            score: 57,
            grade: "95%",
          },
          assignment_group_id: 9002,
        },
        {
          id: 5002,
          course_id: 101,
          name: "Related Rates Quiz",
          description: null,
          due_at: daysFromNow(6, 15, 0),
          html_url: `${base}/5002`,
          points_possible: 50,
          published: true,
          submission: { workflow_state: "unsubmitted", submitted_at: null },
          assignment_group_id: 9003,
        },
      ];
    case 102:
      return [
        {
          id: 5101,
          course_id: 102,
          name: "Lab Report: Projectile Motion",
          description: "Full write-up with error analysis.",
          due_at: daysFromNow(4, 23, 59),
          html_url: `${base}/5101`,
          points_possible: 100,
          published: true,
          submission: { workflow_state: "unsubmitted", submitted_at: null },
        },
        {
          id: 5102,
          course_id: 102,
          name: "Reading Check 7",
          description: null,
          due_at: daysFromNow(1, 8, 0),
          html_url: `${base}/5102`,
          points_possible: 10,
          published: true,
          // already submitted on Canvas — sync should reflect this, not create a task
          submission: { workflow_state: "submitted", submitted_at: daysFromNow(-1, 20, 0) },
        },
      ];
    case 103:
      return [
        {
          id: 5201,
          course_id: 103,
          name: "Essay: Theme in Chapter 5",
          description: "750–1000 words, MLA format.",
          due_at: daysFromNow(9, 23, 59),
          html_url: `${base}/5201`,
          points_possible: 100,
          published: true,
          submission: { workflow_state: "unsubmitted", submitted_at: null },
        },
        {
          id: 5202,
          course_id: 103,
          name: "Reading Quiz 1",
          description: null,
          due_at: daysFromNow(-10, 9, 0),
          html_url: `${base}/5202`,
          points_possible: 10,
          published: true,
          submission: {
            workflow_state: "graded",
            submitted_at: daysFromNow(-10, 8, 0),
            graded_at: daysFromNow(-9, 10, 0),
            score: 9,
          },
        },
        {
          id: 5203,
          course_id: 103,
          name: "Vocabulary Test",
          description: null,
          due_at: daysFromNow(-4, 9, 0),
          html_url: `${base}/5203`,
          points_possible: 25,
          published: true,
          submission: {
            workflow_state: "graded",
            submitted_at: daysFromNow(-4, 8, 0),
            graded_at: daysFromNow(-2, 10, 0),
            score: 22,
            grade: "B+",
          },
        },
      ];
    default:
      return [];
  }
}

export function mockAssignmentGroups(courseId: number): CanvasAssignmentGroup[] {
  switch (courseId) {
    case 101:
      return [
        { id: 9001, name: "Tests", group_weight: 50 },
        { id: 9002, name: "Homework", group_weight: 20 },
        { id: 9003, name: "Quizzes", group_weight: 30 },
      ];
    default:
      return [];
  }
}

export function mockCalendarEvents(): CanvasCalendarEvent[] {
  return [
    {
      id: 7001,
      title: "Physics — Midterm Exam",
      start_at: daysFromNow(7, 10, 0),
      end_at: daysFromNow(7, 11, 30),
      workflow_state: "active",
      html_url: "https://mock.instructure.com/calendar?event_id=7001",
      context_code: "course_102",
      type: "event",
    },
    {
      id: 7002,
      title: "English — Guest Lecture",
      start_at: daysFromNow(3, 13, 0),
      end_at: daysFromNow(3, 14, 0),
      workflow_state: "active",
      html_url: "https://mock.instructure.com/calendar?event_id=7002",
      context_code: "course_103",
      type: "event",
    },
  ];
}
