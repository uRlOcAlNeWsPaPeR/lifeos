import { route, ok, readJson, ApiError } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { assertCanvasConfigured } from "@/lib/canvas/env";
import { getConnection, setCourseSelection } from "@/lib/canvas/connection";
import { CanvasClient, CanvasReauthError } from "@/lib/canvas/client";
import { liveCanvasCourses, syncCanvas } from "@/lib/canvas/sync";
import { canvasCoursesSelectSchema } from "@/lib/validation";
import type { CanvasCoursesDTO } from "@/lib/canvas/types";

// Powers the "choose which courses sync" picker. GET lists the student's live
// Canvas courses; PUT saves the choice and immediately re-syncs so de-selected
// courses (and their assignments) drop out of LifeOS.

export const GET = route(async (req) => {
  const uid = await requireUid(req);
  assertCanvasConfigured();

  const conn = await getConnection(uid);
  if (!conn) throw new ApiError(409, "Canvas is not connected.");

  try {
    const raw = await CanvasClient.from(conn).listActiveCourses();
    const courses = liveCanvasCourses(raw).map((c) => ({
      canvasCourseId: String(c.id),
      name: c.name?.trim() || `Canvas course ${c.id}`,
      code: c.course_code?.trim() || null,
      term: c.term?.name ?? null,
    }));
    const dto: CanvasCoursesDTO = {
      courses,
      selectedIds: conn.selectedCanvasCourseIds ?? null,
    };
    return ok(dto);
  } catch (e) {
    if (e instanceof CanvasReauthError) {
      throw new ApiError(401, "Your Canvas authorization expired. Please reconnect.");
    }
    throw new ApiError(502, "Couldn't load your Canvas courses right now.");
  }
});

export const PUT = route(async (req) => {
  const uid = await requireUid(req);
  assertCanvasConfigured();

  const conn = await getConnection(uid);
  if (!conn) throw new ApiError(409, "Canvas is not connected.");

  const { selectedIds } = canvasCoursesSelectSchema.parse(await readJson(req));
  await setCourseSelection(uid, selectedIds);

  try {
    const counts = await syncCanvas(uid);
    return ok({ ok: true, counts });
  } catch (e) {
    if (e instanceof CanvasReauthError) {
      throw new ApiError(401, "Your Canvas authorization expired. Please reconnect.");
    }
    throw new ApiError(
      502,
      "Saved your course choices, but Canvas couldn't sync right now. We'll retry soon.",
    );
  }
});
