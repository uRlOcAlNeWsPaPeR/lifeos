/**
 * Route-mood lookup checks.
 *
 *   npx tsx src/lib/scene/route-mood.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import { getRouteMood, shouldShowAmbient } from "./route-mood";

test("listed app routes show the ambient layer", () => {
  for (const p of ["/tasks", "/calendar", "/school", "/grades", "/study", "/goals", "/assistant", "/sat"]) {
    assert.equal(shouldShowAmbient(p), true, p);
  }
});

test("the Dashboard, Brain Game, auth and marketing routes don't", () => {
  for (const p of ["/dashboard", "/brain-game", "/", "/login", "/signup", "/pricing", "/onboarding"]) {
    assert.equal(shouldShowAmbient(p), false, p);
  }
});

test("nested SAT routes resolve to the SAT mood", () => {
  assert.equal(getRouteMood("/sat/practice").variant, getRouteMood("/sat").variant);
  assert.equal(getRouteMood("/sat/practice").hue, getRouteMood("/sat").hue);
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
