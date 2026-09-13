import "server-only";
import { decryptToken } from "./crypto";
import { refreshAccess } from "./oauth";
import { markConnection, updateAccessToken } from "./connection";
import type { GoogleCalendarEvent, GoogleCalendarEventsPage, GoogleConnectionDoc } from "./types";

/** Thrown when the user must re-authorize (refresh token dead / revoked). */
export class GoogleReauthError extends Error {
  status = 401;
  constructor(message = "Google Calendar authorization has expired. Please reconnect.") {
    super(message);
  }
}

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
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

  /** Events on the primary calendar between two ISO timestamps, single instances
   *  (recurring events expanded), soonest first. */
  async listEvents(timeMinISO: string, timeMaxISO: string): Promise<GoogleCalendarEvent[]> {
    const out: GoogleCalendarEvent[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        timeMin: timeMinISO,
        timeMax: timeMaxISO,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: String(PAGE_SIZE),
      });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await this.fetchWithAuth(`${EVENTS_URL}?${params.toString()}`);
      const json = (await res.json()) as GoogleCalendarEventsPage;
      out.push(...(json.items ?? []));
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    }
    return out;
  }

  /* --------------------------- internals --------------------------- */

  private async fetchWithAuth(url: string): Promise<Response> {
    let res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });

    if (res.status === 401 && !this.refreshedThisRun && this.refreshToken) {
      this.refreshedThisRun = true;
      await this.doRefresh();
      res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    }

    if (res.status === 401 || res.status === 403) {
      await markConnection(this.uid, {
        status: "reauth_required",
        lastError: `Google Calendar API ${res.status} and the token could not be refreshed.`,
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
