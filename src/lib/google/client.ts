import "server-only";
import { decryptToken } from "./crypto";
import { refreshAccess } from "./oauth";
import { markConnection, updateAccessToken } from "./connection";
import type {
  GoogleCalendarEvent,
  GoogleCalendarEventsPage,
  GoogleCalendarListEntry,
  GoogleCalendarListPage,
  GoogleConnectionDoc,
} from "./types";

/** Thrown when the user must re-authorize (refresh token dead / revoked). */
export class GoogleReauthError extends Error {
  status = 401;
  constructor(message = "Google Calendar authorization has expired. Please reconnect.") {
    super(message);
  }
}

const CALENDAR_LIST_URL = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const EVENTS_BASE_URL = "https://www.googleapis.com/calendar/v3/calendars";
const MAX_PAGES = 8;
const PAGE_SIZE = 250;

export class GoogleCalendarClient {
  private uid: string;
  private accessToken: string;
  private refreshToken: string | null;
  private refreshedThisRun = false;

  private constructor(conn: GoogleConnectionDoc) {
    this.uid = conn.uid;
    this.accessToken = decryptToken(conn.accessTokenEnc);
    this.refreshToken = conn.refreshTokenEnc ? decryptToken(conn.refreshTokenEnc) : null;
  }

  static from(conn: GoogleConnectionDoc): GoogleCalendarClient {
    return new GoogleCalendarClient(conn);
  }

  /** Every calendar the student sees in Google Calendar's own UI — their own
   *  calendar plus anything they've subscribed to (a "Holidays in <Country>"
   *  calendar, a shared family calendar, etc). Google Calendar's UI treats
   *  those exactly like the primary calendar, and so do we. */
  async listCalendars(): Promise<GoogleCalendarListEntry[]> {
    const out: GoogleCalendarListEntry[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ maxResults: "250" });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await this.fetchWithAuth(`${CALENDAR_LIST_URL}?${params.toString()}`);
      const json = (await res.json()) as GoogleCalendarListPage;
      out.push(...(json.items ?? []));
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    }
    return out;
  }

  /** Events on one calendar between two ISO timestamps, single instances
   *  (recurring events expanded), soonest first. Throws a plain Error (not
   *  GoogleReauthError) on a 403 specific to this calendar — e.g. a shared
   *  calendar whose access was revoked — so the caller can skip just that
   *  calendar instead of treating it as the whole connection needing reauth. */
  async listEvents(
    calendarId: string,
    timeMinISO: string,
    timeMaxISO: string,
  ): Promise<GoogleCalendarEvent[]> {
    const out: GoogleCalendarEvent[] = [];
    let pageToken: string | undefined;
    const url = `${EVENTS_BASE_URL}/${encodeURIComponent(calendarId)}/events`;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        timeMin: timeMinISO,
        timeMax: timeMaxISO,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: String(PAGE_SIZE),
      });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await this.fetchWithAuth(`${url}?${params.toString()}`, { allow403: true });
      const json = (await res.json()) as GoogleCalendarEventsPage;
      out.push(...(json.items ?? []));
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    }
    return out;
  }

  /* --------------------------- internals --------------------------- */

  private async fetchWithAuth(
    url: string,
    opts: { allow403?: boolean } = {},
  ): Promise<Response> {
    let res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });

    if (res.status === 401 && !this.refreshedThisRun && this.refreshToken) {
      this.refreshedThisRun = true;
      await this.doRefresh();
      res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    }

    if (res.status === 401) {
      await markConnection(this.uid, {
        status: "reauth_required",
        lastError: "Google Calendar API 401 and the token could not be refreshed.",
      });
      throw new GoogleReauthError();
    }

    // A 403 on one specific calendar (permission revoked on a shared calendar,
    // etc.) isn't a whole-connection auth problem — let the caller skip just
    // that calendar instead of aborting the entire sync as "needs reconnect".
    if (res.status === 403 && !opts.allow403) {
      await markConnection(this.uid, {
        status: "reauth_required",
        lastError: "Google Calendar API 403 and the token could not be refreshed.",
      });
      throw new GoogleReauthError();
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Calendar API ${res.status}: ${body.slice(0, 300)}`);
    }
    return res;
  }

  private async doRefresh(): Promise<void> {
    if (!this.refreshToken) throw new GoogleReauthError();
    try {
      const token = await refreshAccess(this.refreshToken);
      this.accessToken = token.access_token;
      await updateAccessToken(this.uid, token);
    } catch (e) {
      await markConnection(this.uid, {
        status: "reauth_required",
        lastError: `Token refresh failed: ${(e as Error).message}`,
      });
      throw new GoogleReauthError();
    }
  }
}
