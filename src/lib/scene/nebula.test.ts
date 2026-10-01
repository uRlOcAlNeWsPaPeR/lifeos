/**
 * Nebula backdrop layout + mood checks.
 *
 *   npx tsx src/lib/scene/nebula.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import {
  mixHue,
  nebulaMood,
  planetDaylight,
  planetLayout,
  ribbonX,
  NEBULA_BASE_HUE,
  RIBBON_PATH,
  ROCKS_BACK,
  ROCKS_FRONT,
} from "./nebula";

const close = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

test("mixHue takes the short way round the wheel", () => {
  close(mixHue(350, 10, 0.5), 0);
  close(mixHue(10, 350, 0.5), 0);
  close(mixHue(152, 227, 0), 152);
  close(mixHue(152, 227, 1), 227);
  close(mixHue(152, 38, 0.5), 95);
});

test("Study on a clear day stays close to the brand green", () => {
  const m = nebulaMood({ stateHue: 152, energy: 0.25, appHue: null, phase: "home" });
  close(m.hue, NEBULA_BASE_HUE);
  assert.equal(m.brightness, 1);
});

test("a heavy day warms the ribbons more than the sky", () => {
  const m = nebulaMood({ stateHue: 38, energy: 0.95, appHue: null, phase: "home" });
  const skyShift = Math.abs(NEBULA_BASE_HUE - m.hue);
  const accentShift = Math.abs(NEBULA_BASE_HUE - m.accentHue);
  assert.ok(skyShift > 0 && accentShift > skyShift);
  const calm = nebulaMood({ stateHue: 152, energy: 0.25, appHue: null, phase: "home" });
  assert.ok(m.speed > calm.speed);
});

test("centring SAT pulls the sky toward its blue", () => {
  const m = nebulaMood({ stateHue: 38, energy: 0.95, appHue: 227, phase: "home" });
  assert.ok(Math.abs(m.hue - 227) < Math.abs(m.hue - NEBULA_BASE_HUE));
});

test("the console dims and slows the backdrop", () => {
  const home = nebulaMood({ stateHue: 150, energy: 0.45, appHue: null, phase: "home" });
  const work = nebulaMood({ stateHue: 150, energy: 0.45, appHue: null, phase: "console" });
  assert.ok(work.brightness < home.brightness);
  assert.ok(work.speed < home.speed);
});

test("planet daylight peaks early afternoon and bottoms out overnight", () => {
  close(planetDaylight(new Date(2026, 9, 1, 13, 0)), 1);
  close(planetDaylight(new Date(2026, 9, 1, 1, 0)), 0);
  const morning = planetDaylight(new Date(2026, 9, 1, 8, 0));
  assert.ok(morning > 0.2 && morning < 0.9);
});

test("planet hugs the top-right corner and shrinks on narrow screens", () => {
  for (const aspect of [0.46, 0.75, 1.33, 1.78, 2.4]) {
    const p = planetLayout(aspect);
    assert.ok(p.x > 0 && p.x < aspect / 2, `x inside the right half at ${aspect}`);
    assert.ok(p.y >= 0.5, `centre at or above the top edge at ${aspect}`);
  }
  assert.ok(planetLayout(0.46).r < planetLayout(1.78).r);
});

test("ribbon runs edge to edge; rock knots cover the full width", () => {
  assert.ok(RIBBON_PATH[0][0] < -1 && RIBBON_PATH[RIBBON_PATH.length - 1][0] > 1);
  assert.equal(ROCKS_BACK.length, 9);
  assert.equal(ROCKS_FRONT.length, 9);
  ROCKS_FRONT.forEach((y, i) => assert.ok(y < ROCKS_BACK[i], `front rocks lower at knot ${i}`));
});

test("ribbon spans the full width on desktop, keeps its S-bend at the left edge on phones", () => {
  close(ribbonX(-1, 1.78), -0.89);
  close(ribbonX(1, 1.78), 0.89);
  const phone = 390 / 844;
  assert.ok(ribbonX(-0.5, phone) < -0.2, "knee pushed toward the left edge");
  close(ribbonX(1, phone), phone / 2);
});

report("nebula");
