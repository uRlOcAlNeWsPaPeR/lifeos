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

/** Set right before navigating back to /dashboard from another app's own
 *  pages (e.g. SAT Prep), so the Core plays its console→orb reform animation
 *  — tinted with that app's own hue, same as Study's own "Back" button —
 *  instead of silently opening on the orb centred on whatever was last there.
 *  `appId` is a `LifeApp["id"]` from `@/lib/apps`. */
export function flagCoreReform(appId: string) {
  try {
    sessionStorage.setItem(REFORM_KEY, appId);
  } catch {
    /* private mode */
  }
}

/** Read-once: the flagged app's id, or null if nothing was flagged. */
export function consumeCoreReform(): string | null {
  try {
    const id = sessionStorage.getItem(REFORM_KEY);
    if (!id) return null;
    sessionStorage.removeItem(REFORM_KEY);
    return id;
  } catch {
    return null;
  }
}
