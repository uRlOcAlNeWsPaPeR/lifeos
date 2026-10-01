/**
 * Lets an on-page empty state quiet the ambient 3D backdrop: with nothing in
 * the foreground, the floating shapes otherwise become the most visible thing
 * on screen. Plain module state, read every frame by ambient-root.tsx — no
 * React re-render needed.
 */

/** Opacity multiplier while any empty state is showing. */
export const EMPTY_STATE_DIM = 0.4;

let holders = 0;

/** Register an empty state; returns the release function. Safe to call twice. */
export function holdAmbientDim(): () => void {
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
  };
}

export function ambientDimFactor(): number {
  return holders > 0 ? EMPTY_STATE_DIM : 1;
}
