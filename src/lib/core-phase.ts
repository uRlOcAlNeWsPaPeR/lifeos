// Which stable phase of the LifeOS Core (the dashboard orb, or the working
// console) the student was last on. Shared by the Core itself and anything
// elsewhere in the app that needs to send them back to it — kept in its own
// module (rather than inside core-portal.tsx) so it can be imported from the
// sidebar without the two components importing each other.

export type CorePhase = "home" | "console";

const PHASE_KEY = "lifeos.core.phase";

/** A fresh tab has nothing stored yet, so it opens on the Core. */
export function loadCorePhase(): CorePhase {
  try {
    return sessionStorage.getItem(PHASE_KEY) === "console" ? "console" : "home";
  } catch {
    return "home";
  }
}

export function saveCorePhase(phase: CorePhase) {
  try {
    sessionStorage.setItem(PHASE_KEY, phase);
  } catch {
    /* private mode */
  }
}

/** Forces the next /dashboard visit to open on the Core orb, overriding
 *  whatever was remembered from earlier in the tab. Used by anywhere a click
 *  should always land on the Core, not wherever the console was left. */
export function resetCoreToHome() {
  try {
    sessionStorage.removeItem(PHASE_KEY);
  } catch {
    /* private mode */
  }
}
