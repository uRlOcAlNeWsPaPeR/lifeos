import "server-only";
import type { QuerySnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { GoogleCalendarClient, GoogleReauthError } from "./client";
import { markConnection, requireConnection } from "./connection";
import type { GoogleCalendarEvent, GoogleSyncCounts } from "./types";

// The Google Calendar → LifeOS sync. One-way pull only — LifeOS never writes
// back to Google. Events are matched on Google's stable event id, so re-running
// a sync updates in place and never duplicates.

const LOOKAHEAD_DAYS = 60;
const LOOKBACK_DAYS = 3; // small trailing window so a just-passed event still shows briefly

type Row = Record<string, unknown> & { id: string };

export async function syncGoogleCalendar(uid: string): Promise<GoogleSyncCounts> {
  const conn = await requireConnection(uid);
  const client = GoogleCalendarClient.from(conn);
  const base = adminDb().collection("users").doc(uid);

  try {
    const nowMs = Date.now();
    const timeMin = new Date(nowMs - LOOKBACK_DAYS * 86400000).toISOString();
    const timeMax = new Date(nowMs + LOOKAHEAD_DAYS * 86400000).toISOString();
    const events = await client.listEvents(timeMin, timeMax);

    const eventSnap = await base.collection("events").get();
    const existingEvents = rows(eventSnap);

    const batch = adminDb().batch();
    let writes = 0;
    const counts: GoogleSyncCounts = { events: 0 };
    const now = new Date().toISOString();

    for (const ge of events) {
      if (ge.status === "cancelled" || !ge.start) continue;
      const desired = fromGoogleEvent(ge);
      if (!desired) continue;

      const existing = existingEvents.find((e) => e.googleEventId === ge.id);
      if (existing) {
        const patch = changedFields(existing, desired);
        if (patch) {
          batch.set(base.collection("events").doc(existing.id), stamped(patch, now), {
            merge: true,
          });
          writes++;
        }
      } else {
        batch.set(base.collection("events").doc(), { ...desired, taskId: null, createdAt: now });
        writes++;
        counts.events++;
      }
    }

    if (writes > 0) await batch.commit();
    await markConnection(uid, { status: "connected", lastError: null, lastSyncedAt: now });
    return counts;
  } catch (e) {
    if (e instanceof GoogleReauthError) throw e;
    const message = e instanceof Error ? e.message : String(e);
    console.error("[google] sync failed for", uid, message);
    await markConnection(uid, { status: "error", lastError: message.slice(0, 500) });
    throw e;
  }
}

/** Remove every Google-sourced event for a user. Used on disconnect when the
 *  student chooses "remove Google Calendar items". Manual LifeOS events are
 *  untouched. */
export async function purgeGoogleData(uid: string): Promise<void> {
  const base = adminDb().collection("users").doc(uid);
  const snap = await base.collection("events").where("provider", "==", "google").get();
  const batch = adminDb().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/* ------------------------------- helpers ------------------------------- */

function fromGoogleEvent(ge: GoogleCalendarEvent): Record<string, unknown> | null {
  const allDay = Boolean(ge.start?.date && !ge.start?.dateTime);
  const startAt = ge.start?.dateTime ?? ge.start?.date;
  if (!startAt) return null;
  const endAt =
    ge.end?.dateTime ?? ge.end?.date ??
    new Date(new Date(startAt).getTime() + 3600000).toISOString();

  return {
    title: ge.summary?.trim() || "Google Calendar event",
    description: cleanText(ge.description),
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    allDay,
    kind: "event",
    location: ge.location?.trim() || null,
    provider: "google",
    googleEventId: ge.id,
    googleUrl: ge.htmlLink ?? null,
  };
}

function cleanText(s: string | null | undefined): string | null {
  if (!s) return null;
  const text = s.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 1000) : null;
}

function rows(snap: QuerySnapshot): Row[] {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
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
    patch[k] = v;
  }
  return Object.keys(patch).length ? patch : null;
}

function stamped(patch: Record<string, unknown>, now: string): Record<string, unknown> {
  return { ...patch, updatedAt: now };
}
