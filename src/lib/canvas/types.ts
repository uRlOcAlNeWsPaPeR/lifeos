// Shared types for the Canvas LMS integration.

/** The persisted server-side connection (Firestore: canvasConnections/{uid}). */
export interface CanvasConnectionDoc {
  uid: string;
  /** Normalised, e.g. "https://canvas.school.edu" — no trailing slash. */
  instanceUrl: string;
  /** "oauth" = full OAuth2 flow; "personal_token" = dev-only pasted access token. */
  authMode: "oauth" | "personal_token";
  canvasUserId: string;
  canvasUserName: string | null;
  /** AES-256-GCM: "iv:authTag:ciphertext" (all base64). */
  accessTokenEnc: string;
  /** Canvas re-uses the same refresh token; still encrypted at rest. */
  refreshTokenEnc: string | null;
  /** ISO string — when the access token stops working. */
  accessTokenExpiresAt: string | null;
  scope: string | null;
  /**
   * Canvas course ids (as strings) the student chose to sync into LifeOS.
   * An array = sync exactly those, nothing else (a new Canvas class is not
   * auto-added). `null` / absent = not chosen yet: the first sync imports all,
   * then only the already-imported set keeps syncing until the picker is used.
   *
   * A plain re-sync only ever refreshes the courses already mirrored in LifeOS,
   * so deleting a course here keeps it gone; deleting it also drops its id from
   * this list (see `forgetCourseFromSelection`) so the picker stays truthful.
   */
  selectedCanvasCourseIds?: string[] | null;
  /**
   * Canvas assignment ids (as strings) the student deleted inside LifeOS. A
   * plain re-sync would otherwise re-import any of these the moment it sees
   * them still open on Canvas — this is the deny-list that stops that. Dropped
   * again on undo (see `forgetAssignmentFromSelection`) or once the assignment
   * itself disappears from Canvas.
   */
  deletedCanvasAssignmentIds?: string[];
  status: CanvasConnectionStatus;
  /** Technical detail for server logs / debugging. NEVER sent to the browser. */
  lastError: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CanvasConnectionStatus = "connected" | "error" | "reauth_required";

/** The safe, non-sensitive view returned by GET /api/canvas/status. */
export interface CanvasStatusDTO {
  configured: boolean;
  connected: boolean;
  school: string | null;
  canvasUserName: string | null;
  status: CanvasConnectionStatus | null;
  lastSyncedAt: string | null;
  /** Pre-fill hint for the "connect" field, e.g. "https://canvas.instructure.com". */
  defaultInstanceUrl: string | null;
  /**
   * True when the deployment is locked to a single Canvas institution
   * (one entry in CANVAS_ALLOWED_INSTANCE_HOSTS) — the UI then hides the URL
   * field and just shows a "Connect Canvas" button.
   */
  lockedInstanceUrl: string | null;
  /** DEV ONLY — deployment allows pasting a personal access token instead of OAuth. */
  personalTokenMode: boolean;
  /** How the current connection was established (null when not connected). */
  authMode: "oauth" | "personal_token" | null;
  /** A user-facing hint when something needs attention. */
  message: string | null;
}

export interface CanvasSyncCounts {
  courses: number;
  assignments: number;
  tasks: number;
  events: number;
  /** Duplicate assignments folded into their canonical row this sync. */
  duplicatesRemoved: number;
  /** Assignments deleted on Canvas and removed here to match. */
  assignmentsRemoved: number;
}

/** One selectable Canvas course, for the "choose which courses sync" picker. */
export interface CanvasCourseOption {
  canvasCourseId: string;
  name: string;
  code: string | null;
  term: string | null;
}

/** GET /api/canvas/courses — the picker's data. */
export interface CanvasCoursesDTO {
  courses: CanvasCourseOption[];
  /** `null` = every active course syncs; an array = only those ids. */
  selectedIds: string[] | null;
}

/** Canvas token endpoint response (authorization_code and refresh_token grants). */
export interface CanvasTokenResponse {
  access_token: string;
  token_type: string;
  /** Present on authorization_code grant; absent on refresh. */
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  user?: { id: number | string; name?: string; global_id?: string };
}

/* ---- Minimal shapes of the Canvas REST resources we consume ---- */

export interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string;
  workflow_state?: string;
  term?: { id: number; name: string } | null;
  enrollments?: {
    type: string;
    enrollment_state: string;
    computed_current_grade?: string | null;
    computed_current_score?: number | null;
  }[];
  /** Present with `include[]=teachers` — the course's teacher(s). */
  teachers?: { id: number; display_name?: string; short_name?: string }[];
}

export interface CanvasSubmission {
  workflow_state?: string; // "unsubmitted" | "submitted" | "graded" | "pending_review"
  submitted_at?: string | null;
  graded_at?: string | null;
  score?: number | null;
  grade?: string | null;
}

export interface CanvasAssignment {
  id: number;
  course_id: number;
  name: string;
  description?: string | null;
  due_at?: string | null;
  html_url?: string;
  points_possible?: number | null;
  submission?: CanvasSubmission | null;
  published?: boolean;
  /** When the teacher created it on Canvas — not always present. */
  created_at?: string | null;
}

export interface CanvasActivityItem {
  id: number;
  type: string; // "Submission" | "Message" | "DiscussionTopic" | "Announcement" | ...
  created_at?: string;
  updated_at?: string;
  /** on type "Message" — e.g. "Due Date", "Grading", "Late Grading" */
  notification_category?: string;
  course_id?: number;
  title?: string;
}

export interface CanvasCalendarEvent {
  id: number;
  title: string;
  start_at?: string | null;
  end_at?: string | null;
  workflow_state?: string;
  html_url?: string;
  context_code?: string; // "course_123"
  type?: string; // "event" | "assignment"
  hidden?: boolean;
}
