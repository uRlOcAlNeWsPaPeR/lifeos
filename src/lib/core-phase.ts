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

const REFORM_KEY = "lifeos.core.reform";

/** Set right before navigating back to /dashboard from another app (e.g. SAT
 *  Prep), so the Core plays its console→orb reform animation — the same one
 *  Study's own "Back" button uses — instead of silently opening on the orb. */
export function flagCoreReform() {
  try {
    sessionStorage.setItem(REFORM_KEY, "1");
  } catch {
    /* private mode */
  }
}

/** Read-once: true only the first time it's checked after `flagCoreReform`. */
export function consumeCoreReform(): boolean {
  try {
    if (sessionStorage.getItem(REFORM_KEY) !== "1") return false;
    sessionStorage.removeItem(REFORM_KEY);
    return true;
  } catch {
    return false;
  }
}
