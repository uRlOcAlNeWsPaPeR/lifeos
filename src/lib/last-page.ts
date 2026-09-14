// Remembers the last non-Assistant page the student was on, so "Exit AI" can
// return them to wherever they actually came from instead of always landing
// on the dashboard. Session-scoped (sessionStorage) — a fresh tab has nothing
// recorded yet.

const KEY = "lifeos.lastPage";
const EXCLUDE = ["/assistant", "/brain-game"];

export function recordLastPage(pathname: string) {
  if (EXCLUDE.includes(pathname)) return;
  try {
    sessionStorage.setItem(KEY, pathname);
  } catch {
    /* private mode */
  }
}

export function getLastPage(fallback = "/dashboard"): string {
  try {
    return sessionStorage.getItem(KEY) || fallback;
  } catch {
    return fallback;
  }
}
