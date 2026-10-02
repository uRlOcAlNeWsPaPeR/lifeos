/**
 * Route-mood lookup checks.
 *
 *   npx tsx src/lib/scene/route-mood.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import { getRouteMood, shouldShowAmbient } from "./route-mood";

test("listed app routes show the ambient layer", () => {
  for (const p of ["/tasks", "/calendar", "/school", "/grades", "/study", "/goals", "/assistant", "/sat/practice"]) {
    assert.equal(shouldShowAmbient(p), true, p);
  }
});

test("the Dashboard, Brain Game, auth and marketing routes don't", () => {
  for (const p of ["/dashboard", "/brain-game", "/", "/login", "/signup", "/pricing", "/onboarding"]) {
    assert.equal(shouldShowAmbient(p), false, p);
  }
});

test("the SAT overview gets the persistent nebula instead, not this layer", () => {
  // <PersistentNebula/> (components/three) covers /dashboard and /sat so the
  // same background survives that navigation — this lighter layer steps
  // aside for the exact overview path, but still covers SAT's sub-pages.
  assert.equal(shouldShowAmbient("/sat"), false);
  assert.equal(shouldShowAmbient("/sat/practice"), true);
  assert.equal(shouldShowAmbient("/sat/exams"), true);
});

test("nested SAT pages share one plain mood", () => {
  const nested = getRouteMood("/sat/practice");
  assert.equal(nested.hue, 150);
  assert.equal(getRouteMood("/sat/exams").hue, nested.hue);
  assert.equal(getRouteMood("/sat/settings").variant, nested.variant);
});

test("calendar is a grid, goals orbit, everything else listed scatters", () => {
  assert.equal(getRouteMood("/calendar").variant, "grid");
  assert.equal(getRouteMood("/goals").variant, "orbit");
  assert.equal(getRouteMood("/tasks").variant, "scatter");
});

test("an unlisted-but-allowed route falls back to the default mood", () => {
  const def = getRouteMood("/settings");
  assert.equal(def.variant, "scatter");
  assert.equal(def.hue, 152);
});

report("route-mood");
