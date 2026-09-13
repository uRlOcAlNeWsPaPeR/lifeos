// Shared types for the Google Calendar integration.

/** The persisted server-side connection (Firestore: googleConnections/{uid}). */
export interface GoogleConnectionDoc {
  uid: string;
  /** AES-256-GCM: "iv:authTag:ciphertext" (all base64). */
  accessTokenEnc: string;
  /** Present unless Google withheld it (already consented, not re-prompted). */
  refreshTokenEnc: string | null;
  /** ISO string — when the access token stops working. */
  accessTokenExpiresAt: string | null;
  scope: string | null;
  status: GoogleConnectionStatus;
  /** Technical detail for server logs / debugging. NEVER sent to the browser. */
  lastError: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type GoogleConnectionStatus = "connected" | "error" | "reauth_required";

/** The safe, non-sensitive view returned by GET /api/google/status. */
export interface GoogleStatusDTO {
  configured: boolean;
  /** False on the Free plan — Google Calendar is a Student+ feature. */
  enabled: boolean;
  connected: boolean;
  status: GoogleConnectionStatus | null;
  lastSyncedAt: string | null;
  message: string | null;
}

export interface GoogleSyncCounts {
  events: number;
}

/** Google's token endpoint response (authorization_code and refresh_token grants). */
export interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  /** Present on the FIRST authorization_code grant (access_type=offline,
   *  prompt=consent forces this); absent on refresh and on a re-consent Google
   *  decides not to re-issue one for. */
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

/* ---- Minimal shape of the Calendar API resources we consume (read-only) ---- */

export interface GoogleCalendarEventTime {
  date?: string; // all-day
  dateTime?: string; // timed
}

export interface GoogleCalendarEvent {
  id: string;
  status?: string; // "confirmed" | "tentative" | "cancelled"
  summary?: string;
  description?: string | null;
  location?: string | null;
  htmlLink?: string;
  start?: GoogleCalendarEventTime;
  end?: GoogleCalendarEventTime;
}

export interface GoogleCalendarEventsPage {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

/** One entry from the user's calendar list — the calendars they see in Google
 *  Calendar's own UI (their own + anything they've subscribed to, e.g. a
 *  "Holidays in <Country>" calendar, a shared family calendar). */
export interface GoogleCalendarListEntry {
  id: string;
  summary?: string;
  primary?: boolean;
  /** Shown in the user's Google Calendar UI. Absent/false = hidden there too. */
  selected?: boolean;
  /** "owner" | "writer" | "reader" | "freeBusyReader" — the last exposes only
   *  free/busy blocks, no event details, so it's not useful to sync. */
  accessRole?: string;
}

export interface GoogleCalendarListPage {
  items: GoogleCalendarListEntry[];
  nextPageToken?: string;
}
