import "server-only";
import { canvasEnv } from "./env";
import { decryptToken } from "./crypto";
import { refreshAccess } from "./oauth";
import { markConnection, updateAccessToken } from "./connection";
import { MOCK_COURSES, mockAssignments, mockCalendarEvents } from "./mock";
import type {
  CanvasActivityItem,
  CanvasAssignment,
  CanvasCalendarEvent,
  CanvasConnectionDoc,
  CanvasCourse,
} from "./types";

/** Thrown when the user must re-authorize (refresh token dead / revoked). */
export class CanvasReauthError extends Error {
  status = 401;
  constructor(message = "Canvas authorization has expired. Please reconnect.") {
    super(message);
  }
}

const MAX_PAGES = 12;
const PER_PAGE = 100;

export class CanvasClient {
  private uid: string;
  private instanceUrl: string;
  private accessToken: string;
  private refreshToken: string | null;
  private refreshedThisRun = false;

  private constructor(conn: CanvasConnectionDoc) {
    this.uid = conn.uid;
    this.instanceUrl = conn.instanceUrl;
    this.accessToken = canvasEnv.mock ? "mock" : decryptToken(conn.accessTokenEnc);
    this.refreshToken =
      conn.refreshTokenEnc && !canvasEnv.mock ? decryptToken(conn.refreshTokenEnc) : null;
  }

  static from(conn: CanvasConnectionDoc): CanvasClient {
    return new CanvasClient(conn);
  }

  /* --------------------------- public API --------------------------- */

  async listActiveCourses(): Promise<CanvasCourse[]> {
    if (canvasEnv.mock) return MOCK_COURSES;
    return this.paginate<CanvasCourse>(
      `/courses?enrollment_state=active&enrollment_type=student` +
        `&include[]=term&include[]=total_scores&include[]=teachers` +
        `&state[]=available&per_page=${PER_PAGE}`,
    );
  }

  async listAssignments(courseId: number | string): Promise<CanvasAssignment[]> {
    if (canvasEnv.mock) return mockAssignments(Number(courseId));
    return this.paginate<CanvasAssignment>(
      `/courses/${courseId}/assignments?include[]=submission` +
        `&order_by=due_at&per_page=${PER_PAGE}`,
    );
  }

  /** Recent account activity — used to detect "something changed on Canvas". */
  async getActivityStream(): Promise<CanvasActivityItem[]> {
    if (canvasEnv.mock) return [];
    const res = await this.fetchWithAuth(
      this.abs("/users/self/activity_stream?per_page=40&only_active_courses=true"),
    );
    const json = (await res.json()) as CanvasActivityItem[];
    return Array.isArray(json) ? json : [];
  }

  async listCalendarEvents(
    contextCodes: string[],
    startISO: string,
    endISO: string,
  ): Promise<CanvasCalendarEvent[]> {
    if (canvasEnv.mock) return mockCalendarEvents();
    if (contextCodes.length === 0) return [];
    const params = new URLSearchParams({
      type: "event",
      start_date: startISO,
      end_date: endISO,
      per_page: String(PER_PAGE),
    });
    for (const c of contextCodes.slice(0, 40)) params.append("context_codes[]", c);
    return this.paginate<CanvasCalendarEvent>(`/calendar_events?${params.toString()}`);
  }

  /* --------------------------- internals --------------------------- */

  private async paginate<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = this.abs(path);
    for (let page = 0; page < MAX_PAGES && url; page++) {
      const res = await this.fetchWithAuth(url);
      const batch = (await res.json()) as T[];
      if (Array.isArray(batch)) out.push(...batch);
      url = nextLink(res.headers.get("link"));
      await this.rateLimitPause(res);
    }
    return out;
  }

  private abs(path: string): string {
    return path.startsWith("http") ? path : `${this.instanceUrl}/api/v1${path}`;
  }

  private async fetchWithAuth(url: string): Promise<Response> {
    let res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: "application/json" },
    });

    if (res.status === 401 && !this.refreshedThisRun && this.refreshToken) {
      this.refreshedThisRun = true;
      await this.doRefresh();
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}`, Accept: "application/json" },
      });
    }

    if (res.status === 401) {
      await markConnection(this.uid, {
        status: "reauth_required",
        lastError: "Canvas returned 401 and the token could not be refreshed.",
      });
      throw new CanvasReauthError();
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Canvas API ${res.status} for ${stripHost(url)}: ${body.slice(0, 300)}`);
    }
    return res;
  }

  private async doRefresh(): Promise<void> {
    if (!this.refreshToken) throw new CanvasReauthError();
    try {
      const token = await refreshAccess(this.instanceUrl, this.refreshToken);
      this.accessToken = token.access_token;
      if (token.refresh_token) this.refreshToken = token.refresh_token;
      await updateAccessToken(this.uid, token);
    } catch (e) {
      await markConnection(this.uid, {
        status: "reauth_required",
        lastError: `Token refresh failed: ${(e as Error).message}`,
      });
      throw new CanvasReauthError();
    }
  }

  private async rateLimitPause(res: Response): Promise<void> {
    const remaining = Number(res.headers.get("x-rate-limit-remaining"));
    if (Number.isFinite(remaining) && remaining < 100) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

/** Parse an RFC-5988 Link header for rel="next". */
function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (m) return m[1];
  }
  return null;
}

function stripHost(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
