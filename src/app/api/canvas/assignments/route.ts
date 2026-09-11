import { route, ok, readJson, ApiError } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { assertCanvasConfigured } from "@/lib/canvas/env";
import {
  getConnection,
  forgetAssignmentFromSelection,
  restoreAssignmentToSelection,
} from "@/lib/canvas/connection";
import { canvasAssignmentSelectionPatchSchema } from "@/lib/validation";

// Drop / re-add one Canvas assignment from the deny-list without a full
// re-sync. Fired when the student deletes a Canvas-sourced assignment inside
// LifeOS (and on undo), so a later sync — which still sees it open on Canvas —
// doesn't bring it straight back. Mirrors /api/canvas/courses's course PATCH.
export const PATCH = route(async (req) => {
  const uid = await requireUid(req);
  assertCanvasConfigured();

  const conn = await getConnection(uid);
  if (!conn) throw new ApiError(409, "Canvas is not connected.");

  const { canvasAssignmentId, op } = canvasAssignmentSelectionPatchSchema.parse(
    await readJson(req),
  );
  if (op === "forget") await forgetAssignmentFromSelection(uid, canvasAssignmentId);
  else await restoreAssignmentToSelection(uid, canvasAssignmentId);

  return ok({ ok: true });
});
