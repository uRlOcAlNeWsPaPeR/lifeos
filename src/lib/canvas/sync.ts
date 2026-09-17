import "server-only";
import type { QuerySnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { courseNameWithTeacher } from "@/lib/format";
import { CanvasClient, CanvasReauthError } from "./client";
import { getConnection, markConnection, requireConnection } from "./connection";
import type {
  CanvasAssignment,
  CanvasAssignmentGroup,
  CanvasCourse,
  CanvasSubmission,
  CanvasSyncCounts,
} from "./types";

// The Canvas → LifeOS sync. Canvas is the source of school data; LifeOS keeps it
// organised. Everything is matched on stable Canvas IDs (never on title), so
// re-running a sync updates in place and never duplicates. LifeOS never writes
// back to Canvas.

const COURSE_PALETTE = [
  "#22d67e", "#14c9b8", "#4f7dff", "#a855f7", "#ec4899", "#f59e0b", "#ef4444",
];
const EVENT_LOOKAHEAD_DAYS = 60;

type Row = Record<string, unknown> & { id: string };

/**
 * Collapse the raw `/courses` list to one row per live student course.
 * Canvas returns a row per enrollment, so cross-listed sections repeat; it also
 * hands back archived / concluded / dropped courses. Shared by the sync and the
 * "choose which courses sync" picker so both see exactly the same set.
 */
export function liveCanvasCourses(raw: CanvasCourse[]): CanvasCourse[] {
  const DEAD_ENROLLMENT = new Set(["completed", "inactive", "deleted", "rejected"]);
  const seen = new Set<string>();
  return raw.filter((cc) => {
    const id = String(cc.id);
    if (seen.has(id)) return false;
    seen.add(id);
    if (cc.workflow_state && cc.workflow_state !== "available") return false;
    const enr = cc.enrollments?.find((e) => e.type === "student") ?? cc.enrollments?.[0];
    if (enr?.enrollment_state && DEAD_ENROLLMENT.has(enr.enrollment_state)) return false;
    return true;
  });
}

export async function syncCanvas(
  uid: string,
  opts: { additive?: boolean } = {},
): Promise<CanvasSyncCounts> {
  // `additive` (the course picker) may pull in a Canvas class that isn't in
  // LifeOS yet. A plain re-sync ("Sync now", auto-sync) never does — it only
  // refreshes what's already here, so a deleted course stays deleted.
  const additive = opts.additive ?? false;
  const conn = await requireConnection(uid);
  const client = CanvasClient.from(conn);
  const base = adminDb().collection("users").doc(uid);

  try {
    const [courseSnap, assignmentSnap, taskSnap, eventSnap] = await Promise.all([
      base.collection("courses").get(),
      base.collection("assignments").get(),
      base.collection("tasks").get(),
      base.collection("events").get(),
    ]);
    const existingCourses = rows(courseSnap);
    let existingAssignments = rows(assignmentSnap);
    const existingTasks = rows(taskSnap);
    const existingEvents = rows(eventSnap);

    const batch = adminDb().batch();
    let writes = 0;
    const counts: CanvasSyncCounts = {
      courses: 0,
      assignments: 0,
      tasks: 0,
      events: 0,
      duplicatesRemoved: 0,
      assignmentsRemoved: 0,
    };
    const now = new Date().toISOString();
    const nowMs = Date.now();

    /* ------------------------------- courses ------------------------------- */
    const rawCanvasCourses = await client.listActiveCourses();
    const liveCourses = liveCanvasCourses(rawCanvasCourses);

    // Which Canvas courses does this sync touch?
    //
    // `selectedCanvasCourseIds` on the connection is the student's explicit pick
    // list (Settings → School, or the prompt after connecting):
    //   • an array   → exactly those ids.
    //   • null/absent → never chosen.
    //
    // A plain re-sync only REFRESHES the Canvas courses already mirrored in
    // LifeOS — it never pulls in a new class, and a course the student deleted
    // here stays gone. Only the course picker (`additive`) can add a course
    // that isn't here yet. The first sync right after connecting (nothing
    // mirrored, nothing picked) imports everything so the picker has a full list.
    const explicitSelection = conn.selectedCanvasCourseIds ?? null;
    const knownCanvasIds = existingCourses
      .filter((c) => c.provider === "canvas" && c.canvasCourseId)
      .map((c) => String(c.canvasCourseId));

    let selection: string[] | null;
    if (additive) {
      selection = explicitSelection ?? (knownCanvasIds.length ? knownCanvasIds : null);
    } else if (explicitSelection) {
      // an explicit pick list exists — refresh only the picked courses still
      // mirrored here; if the student has deleted them all, sync nothing.
      selection = knownCanvasIds.filter((id) => explicitSelection.includes(id));
    } else if (knownCanvasIds.length) {
      selection = knownCanvasIds; // never used the picker — refresh what's here
    } else {
      selection = null; // never picked, nothing here yet — first sync imports all
    }

    const canvasCourses = selection
      ? liveCourses.filter((c) => selection!.includes(String(c.id)))
      : liveCourses;
    const activeCourseIds = new Set(canvasCourses.map((c) => String(c.id)));

    // canvasCourseId -> LifeOS course doc id
    const courseIdByCanvas = new Map<string, string>();
    let paletteCursor = existingCourses.filter((c) => c.provider === "canvas").length;
    // adopt an exactly-named course the user added manually instead of duplicating it
    const manualByName = new Map(
      existingCourses
        .filter((c) => !c.canvasCourseId)
        .map((c) => [String(c.name ?? "").trim().toLowerCase(), c]),
    );

    // Grade categories, fetched only for courses that actually turned on weighted
    // grading — a course with assignment groups but weighting switched off (the
    // common case: groups used purely to organize, not to grade) gets no fetch
    // and no gradeWeights, same as if it had none.
    const groupsByCourseId = new Map<number, CanvasAssignmentGroup[]>();
    await Promise.all(
      canvasCourses
        .filter((cc) => cc.apply_assignment_group_weights)
        .map(async (cc) => {
          groupsByCourseId.set(cc.id, await client.listAssignmentGroups(cc.id));
        }),
    );

    for (const cc of canvasCourses) {
      const canvasCourseId = String(cc.id);
      const enrollment = cc.enrollments?.find((e) => e.type === "student") ?? cc.enrollments?.[0];
      const teacher = cc.teachers?.[0]?.display_name?.trim() || null;
      const baseName = cc.name?.trim() || `Canvas course ${canvasCourseId}`;
      const groups = groupsByCourseId.get(cc.id) ?? [];
      // Canvas is the source of truth for a synced course's weights, same as its
      // score/letter grade — always reflect its current state, clearing back to
      // null the moment the teacher turns weighting off or removes every group.
      const gradeWeights = cc.apply_assignment_group_weights
        ? groups
            .filter((g) => typeof g.group_weight === "number" && g.group_weight! > 0 && g.name?.trim())
            .map((g) => ({ category: g.name!.trim(), weight: g.group_weight! }))
        : null;
      const desired = {
        // "AP Calculus AB" + teacher "Ms. York" → "AP Calculus AB - York"
        name: courseNameWithTeacher(baseName, teacher),
        code: cc.course_code?.trim() || null,
        term: cc.term?.name ?? null,
        currentGrade: enrollment?.computed_current_grade ?? null,
        currentScore: enrollment?.computed_current_score ?? null,
        provider: "canvas",
        canvasCourseId,
        canvasUrl: `${conn.instanceUrl}/courses/${canvasCourseId}`,
        gradeWeights: gradeWeights?.length ? gradeWeights : null,
      };

      const match =
        existingCourses.find((c) => c.canvasCourseId === canvasCourseId) ??
        manualByName.get(desired.name.trim().toLowerCase()) ??
        manualByName.get(baseName.trim().toLowerCase());
      if (match) {
        courseIdByCanvas.set(canvasCourseId, match.id);
        const patch = changedFields(match, desired);
        if (patch) {
          batch.set(base.collection("courses").doc(match.id), stamped(patch, now), { merge: true });
          writes++;
        }
        // keep the in-memory row current so a repeat id / name doesn't re-adopt it
        Object.assign(match, desired);
      } else {
        const doc = base.collection("courses").doc();
        courseIdByCanvas.set(canvasCourseId, doc.id);
        batch.set(doc, {
          ...desired,
          instructor: teacher,
          color: COURSE_PALETTE[paletteCursor++ % COURSE_PALETTE.length],
          createdAt: now,
          updatedAt: now,
        });
        writes++;
        counts.courses++;
        existingCourses.push({ id: doc.id, ...desired } as Row);
      }
    }

    // Prune Canvas courses that are no longer active (archived / concluded / dropped).
    // Their mirrored assignments go too; open tasks are removed, completed ones kept
    // (as history) but unlinked from the vanished course.
    for (const ec of existingCourses) {
      if (ec.provider !== "canvas" || !ec.canvasCourseId) continue;
      if (activeCourseIds.has(ec.canvasCourseId as string)) continue;

      batch.delete(base.collection("courses").doc(ec.id));
      writes++;
      for (const a of existingAssignments) {
        if (a.provider === "canvas" && a.canvasCourseId === ec.canvasCourseId) {
          batch.delete(base.collection("assignments").doc(a.id));
          writes++;
        }
      }
      for (const t of existingTasks) {
        if (t.source !== "canvas" || t.courseId !== ec.id) continue;
        if (t.status === "done") {
          batch.set(
            base.collection("tasks").doc(t.id),
            stamped({ courseId: null, assignmentId: null, canvasAssignmentId: null }, now),
            { merge: true },
          );
        } else {
          batch.delete(base.collection("tasks").doc(t.id));
        }
        writes++;
      }
    }

    /* ---------------------------- assignments + tasks --------------------- */
    // Fetch every course's assignments concurrently — this is the dominant cost
    // of a sync (one Canvas round trip, often several with pagination, per
    // course) and courses don't depend on each other, so there's no reason to
    // serialize them.
    const assignmentsByCourse = await Promise.all(
      canvasCourses.map(async (cc) => ({
        cc,
        assignments: await client.listAssignments(cc.id),
        groups: groupsByCourseId.get(cc.id) ?? [],
      })),
    );

    // Every Canvas assignment id this sync actually saw, across all synced
    // courses — anything mirrored here under an actively-synced course that
    // ISN'T in this set was deleted on Canvas and gets pruned below.
    const seenCanvasAssignmentIds = new Set<string>();
    // Assignments the student deleted inside LifeOS. A resync only ever
    // refreshes what's already mirrored here — it must not treat "still open
    // on Canvas" as a reason to bring a deleted one back.
    const deletedIds = new Set(conn.deletedCanvasAssignmentIds ?? []);
    for (const { cc, assignments: canvasAssignments, groups } of assignmentsByCourse) {
      const canvasCourseId = String(cc.id);
      const lifeosCourseId = courseIdByCanvas.get(canvasCourseId)!;
      const groupNameById = new Map(groups.map((g) => [g.id, (g.name ?? "").trim()]));

      for (const ca of canvasAssignments) {
        const canvasAssignmentId = String(ca.id);
        // Unpublished is a draft state, not a deletion — keep whatever's here
        // untouched rather than pruning it out from under the student.
        seenCanvasAssignmentIds.add(canvasAssignmentId);
        if (ca.published === false) continue;

        const existingA = existingAssignments.find(
          (a) => a.canvasAssignmentId === canvasAssignmentId,
        );
        // Deleted here and Canvas hasn't moved on it — stay gone. (If it
        // somehow already has a row, e.g. a stale deny-list entry, fall
        // through and treat it normally rather than silently ignoring it.)
        if (!existingA && deletedIds.has(canvasAssignmentId)) continue;

        const derivedStatus = deriveStatus(ca.submission ?? null);

        // Never downgrade a locally-advanced assignment when Canvas gives us no
        // submission signal.
        const keepStatus =
          existingA &&
          derivedStatus === "open" &&
          (existingA.status === "submitted" || existingA.status === "graded");
        const status = keepStatus ? (existingA!.status as string) : derivedStatus;

        const desiredA: Record<string, unknown> = {
          title: ca.name?.trim() || `Canvas assignment ${canvasAssignmentId}`,
          description: cleanDescription(ca.description),
          courseId: lifeosCourseId,
          dueAt: ca.due_at ?? null,
          status,
          pointsPossible: ca.points_possible ?? null,
          provider: "canvas",
          canvasAssignmentId,
          canvasCourseId,
          canvasUrl: ca.html_url ?? null,
          source: "canvas",
          category:
            ca.assignment_group_id != null ? groupNameById.get(ca.assignment_group_id) || null : null,
        };
        // The real "when was this created" answer, when Canvas gives us one —
        // patched onto an existing row too, so an assignment synced before this
        // was tracked self-corrects on its next sync instead of staying stuck
        // on its LifeOS import time.
        if (ca.created_at) desiredA.createdAt = ca.created_at;
        // Canvas itself now reports this submitted/graded — that's the real
        // answer, so a "mark as done" override the user set while it was still
        // open has served its purpose. Clear it (only writes if it was set).
        if (derivedStatus !== "open" && existingA?.localDone) {
          desiredA.localDone = false;
        }
        if (status === "graded" && ca.submission?.score != null) {
          desiredA.pointsEarned = ca.submission.score;
          desiredA.gradeValue = ca.submission.grade ?? String(ca.submission.score);
        }

        let lifeosAssignmentId: string;
        if (existingA) {
          lifeosAssignmentId = existingA.id;
          const patch = changedFields(existingA, desiredA);
          if (patch) {
            batch.set(
              base.collection("assignments").doc(existingA.id),
              stamped(patch, now),
              { merge: true },
            );
            writes++;
          }
          // keep the in-memory row current so the de-dup pass below sees truth
          Object.assign(existingA, desiredA);
        } else {
          const doc = base.collection("assignments").doc();
          lifeosAssignmentId = doc.id;
          // Prefer Canvas's real creation date; fall back to "now" (this sync)
          // only when Canvas doesn't supply one.
          batch.set(doc, {
            ...desiredA,
            createdAt: (desiredA.createdAt as string | undefined) ?? now,
            updatedAt: now,
          });
          writes++;
          counts.assignments++;
          existingAssignments.push({ id: doc.id, ...desiredA } as Row);
        }
        /* ---- linked planning task ----
         * The assignment is the item that shows. LifeOS does NOT auto-create a
         * mirror task. If a linked task exists (from an older sync or the user),
         * keep it only when it carries real planning info; otherwise remove the
         * duplicate. Once Canvas reports the work turned in or graded, the
         * task's job is done — remove it outright rather than leaving it
         * sitting "done" in the list. This only ever applies to Canvas-sourced
         * tasks; a manual task is never auto-removed, the student deletes it
         * themselves. */
        const linkedTask = existingTasks.find(
          (t) =>
            t.canvasAssignmentId === canvasAssignmentId ||
            (t.assignmentId && t.assignmentId === lifeosAssignmentId),
        );

        if (linkedTask) {
          const isDone = status === "submitted" || status === "graded";
          const hasPlanningInfo =
            Boolean(linkedTask.notes) ||
            linkedTask.estimatedMinutes != null ||
            Boolean(linkedTask.scheduledAt);

          if (isDone) {
            batch.delete(base.collection("tasks").doc(linkedTask.id));
            writes++;
          } else if (linkedTask.status !== "done" && !hasPlanningInfo) {
            // bare duplicate of the assignment — drop it
            batch.delete(base.collection("tasks").doc(linkedTask.id));
            writes++;
          } else if (linkedTask.status !== "done") {
            const patch = changedFields(linkedTask, {
              title: desiredA.title,
              dueAt: desiredA.dueAt,
              courseId: lifeosCourseId,
              canvasUrl: desiredA.canvasUrl,
            });
            if (patch) {
              batch.set(base.collection("tasks").doc(linkedTask.id), stamped(patch, now), {
                merge: true,
              });
              writes++;
            }
          }
        }
      }
    }

    /* ------------------------- prune deleted assignments ------------------ *
     * An assignment Canvas no longer returns for an actively-synced course was
     * deleted there — mirror that here. A finished task keeps its history but
     * loses the dangling Canvas link; an open one (nothing to keep) is removed
     * outright, same as when its whole course disappears. */
    const deletedOnCanvas = existingAssignments.filter((a) => {
      if (a.provider !== "canvas" || !a.canvasCourseId) return false;
      if (!activeCourseIds.has(a.canvasCourseId as string)) return false; // course not touched this run
      const cid = a.canvasAssignmentId ? String(a.canvasAssignmentId) : null;
      return !(cid && seenCanvasAssignmentIds.has(cid));
    });
    for (const a of deletedOnCanvas) {
      batch.delete(base.collection("assignments").doc(a.id));
      writes++;
      counts.assignmentsRemoved++;
      for (const t of existingTasks) {
        if (t.assignmentId !== a.id && t.canvasAssignmentId !== a.canvasAssignmentId) continue;
        if (t.status === "done") {
          batch.set(
            base.collection("tasks").doc(t.id),
            stamped({ assignmentId: null, canvasAssignmentId: null }, now),
            { merge: true },
          );
        } else {
          batch.delete(base.collection("tasks").doc(t.id));
        }
        writes++;
      }
    }
    if (deletedOnCanvas.length) {
      const removedIds = new Set(deletedOnCanvas.map((a) => a.id));
      existingAssignments = existingAssignments.filter((a) => !removedIds.has(a.id));
    }

    /* --------------------------- de-dup assignments ----------------------- *
     * Fold together assignments that describe the same work: exact repeats of
     * one Canvas assignment id, and — regardless of source — any that share a
     * course and a name (case / whitespace-insensitive). Canvas-backed rows and
     * then the oldest win. Tasks pointing at a removed row are re-pointed. */
    {
      const norm = (s: unknown) =>
        String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const keptByCanvasId = new Map<string, Row>();
      const keptByTitleCourse = new Map<string, Row>();
      const remap = new Map<string, string>(); // removed assignment id -> keeper id
      const removed = new Set<string>();

      // Canvas-backed rows first, then oldest — the survivor is deterministic.
      const ordered = [...existingAssignments].sort((a, b) => {
        const rank = (r: Row) => (r.canvasAssignmentId ? 0 : 1);
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
      });

      for (const a of ordered) {
        if (removed.has(a.id)) continue;
        const cid = a.canvasAssignmentId ? String(a.canvasAssignmentId) : null;
        const titleKey = `${norm(a.title)}|${a.courseId ?? ""}`;

        let keeper: Row | undefined;
        if (cid && keptByCanvasId.has(cid)) {
          keeper = keptByCanvasId.get(cid);
        } else if (norm(a.title) && keptByTitleCourse.has(titleKey)) {
          keeper = keptByTitleCourse.get(titleKey);
        }

        if (keeper && keeper.id !== a.id) {
          batch.delete(base.collection("assignments").doc(a.id));
          writes++;
          removed.add(a.id);
          remap.set(a.id, keeper.id);
          continue;
        }
        if (cid) keptByCanvasId.set(cid, a);
        if (norm(a.title)) keptByTitleCourse.set(titleKey, a);
      }

      if (removed.size) {
        for (const t of existingTasks) {
          const linkedTo = t.assignmentId ? String(t.assignmentId) : null;
          if (linkedTo && remap.has(linkedTo)) {
            batch.set(
              base.collection("tasks").doc(t.id),
              stamped({ assignmentId: remap.get(linkedTo) }, now),
              { merge: true },
            );
            writes++;
          }
        }
        existingAssignments = existingAssignments.filter((a) => !removed.has(a.id));
        counts.duplicatesRemoved = removed.size;
      }
    }

    /* ------------------------------- events ------------------------------- */
    const contextCodes = [...courseIdByCanvas.keys()].map((c) => `course_${c}`);
    const startISO = new Date().toISOString();
    const endISO = new Date(nowMs + EVENT_LOOKAHEAD_DAYS * 86400000).toISOString();
    const canvasEvents = await client.listCalendarEvents(contextCodes, startISO, endISO);

    for (const ce of canvasEvents) {
      if (ce.hidden || ce.workflow_state === "deleted" || !ce.start_at) continue;
      const canvasEventId = String(ce.id);
      const start = ce.start_at;
      const end = ce.end_at ?? new Date(new Date(start).getTime() + 3600000).toISOString();
      const desiredE = {
        title: ce.title?.trim() || "Canvas event",
        startAt: start,
        endAt: end,
        kind: "event",
        provider: "canvas",
        canvasEventId,
        canvasUrl: ce.html_url ?? null,
      };
      const existingE = existingEvents.find((e) => e.canvasEventId === canvasEventId);
      if (existingE) {
        const patch = changedFields(existingE, desiredE);
        if (patch) {
          batch.set(base.collection("events").doc(existingE.id), stamped(patch, now), {
            merge: true,
          });
          writes++;
        }
      } else {
        batch.set(base.collection("events").doc(), {
          ...desiredE,
          description: null,
          allDay: false,
          location: null,
          taskId: null,
          createdAt: now,
        });
        writes++;
        counts.events++;
      }
    }

    if (writes > 0) await batch.commit();
    await markConnection(uid, { status: "connected", lastError: null, lastSyncedAt: now });
    return counts;
  } catch (e) {
    if (e instanceof CanvasReauthError) {
      // status already set to reauth_required inside the client
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error("[canvas] sync failed for", uid, message);
    await markConnection(uid, { status: "error", lastError: message.slice(0, 500) });
    throw e;
  }
}

/** Remove every Canvas-sourced doc for a user. Used on disconnect when the user
 *  chooses "remove Canvas items". Manual LifeOS data is untouched. */
export async function purgeCanvasData(
  uid: string,
  opts: { removeTasks: boolean },
): Promise<void> {
  const base = adminDb().collection("users").doc(uid);
  const [courseSnap, assignmentSnap, taskSnap, eventSnap] = await Promise.all([
    base.collection("courses").where("provider", "==", "canvas").get(),
    base.collection("assignments").where("provider", "==", "canvas").get(),
    base.collection("tasks").where("source", "==", "canvas").get(),
    base.collection("events").where("provider", "==", "canvas").get(),
  ]);

  const batch = adminDb().batch();
  courseSnap.docs.forEach((d) => batch.delete(d.ref));
  assignmentSnap.docs.forEach((d) => batch.delete(d.ref));
  eventSnap.docs.forEach((d) => batch.delete(d.ref));
  if (opts.removeTasks) {
    taskSnap.docs.forEach((d) => batch.delete(d.ref));
  } else {
    // keep the tasks but sever the Canvas link so they read as normal LifeOS tasks
    taskSnap.docs.forEach((d) =>
      batch.set(
        d.ref,
        { source: "manual", canvasAssignmentId: null, assignmentId: null, updatedAt: new Date().toISOString() },
        { merge: true },
      ),
    );
  }
  await batch.commit();
}

/* ------------------------------- helpers ------------------------------- */

function rows(snap: QuerySnapshot): Row[] {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
}

function deriveStatus(sub: CanvasSubmission | null): "open" | "submitted" | "graded" {
  if (!sub) return "open";
  if (sub.workflow_state === "graded" || sub.graded_at) return "graded";
  if (sub.submitted_at || sub.workflow_state === "submitted" || sub.workflow_state === "pending_review") {
    return "submitted";
  }
  return "open";
}

function cleanDescription(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 1000) : null;
}

/** Return only the fields whose value differs from `existing`, or null if none. */
function changedFields(
  existing: Row,
  desired: Record<string, unknown>,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(desired)) {
    const cur = existing[k];
    if (cur === v) continue;
    if (cur == null && v == null) continue;
    // Reference equality never holds for a freshly-built array/object (e.g.
    // gradeWeights) even when its content is identical — compare by value so
    // an unchanged Canvas weighting scheme doesn't trigger a write every sync.
    if (Array.isArray(v) && Array.isArray(cur) && JSON.stringify(cur) === JSON.stringify(v)) continue;
    patch[k] = v;
  }
  return Object.keys(patch).length ? patch : null;
}

function stamped(patch: Record<string, unknown>, now: string): Record<string, unknown> {
  return { ...patch, updatedAt: now };
}
