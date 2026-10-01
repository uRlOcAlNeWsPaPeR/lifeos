/**
 * Ambient dim checks.
 *
 *   npx tsx src/lib/scene/ambient-dim.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import { ambientDimFactor, holdAmbientDim, EMPTY_STATE_DIM } from "./ambient-dim";

test("full strength with no empty state", () => {
  assert.equal(ambientDimFactor(), 1);
});

test("dims while any empty state is held, restores after the last release", () => {
  const a = holdAmbientDim();
  const b = holdAmbientDim();
  assert.equal(ambientDimFactor(), EMPTY_STATE_DIM);
  a();
  assert.equal(ambientDimFactor(), EMPTY_STATE_DIM);
  b();
  assert.equal(ambientDimFactor(), 1);
});

test("releasing twice doesn't undercount another holder", () => {
  const a = holdAmbientDim();
  const b = holdAmbientDim();
  a();
  a();
  assert.equal(ambientDimFactor(), EMPTY_STATE_DIM);
  b();
  assert.equal(ambientDimFactor(), 1);
});

report("ambient-dim");
