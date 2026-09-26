/**
 * Date-input formatting checks.
 *
 *   npx tsx src/lib/format.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import { toInputDate } from "./format";

// The bug only shows west of Greenwich, so pin the zone rather than trust the
// machine the tests happen to run on.
const inLosAngeles = (fn: () => void) => {
  const prev = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    assert.equal(new Date("2026-09-08T12:00:00Z").getTimezoneOffset(), 420, "TZ didn't take effect");
    fn();
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
};

test("a bare date from the AI stays on the day it names", () => {
  inLosAngeles(() => assert.equal(toInputDate("2026-09-08"), "2026-09-08"));
});

test("a full timestamp still converts to the student's local day", () => {
  // 03:00 UTC on the 9th is still the evening of the 8th in Los Angeles.
  inLosAngeles(() => assert.equal(toInputDate("2026-09-09T03:00:00.000Z"), "2026-09-08"));
});

test("a Date object converts to its local day", () => {
  inLosAngeles(() => assert.equal(toInputDate(new Date("2026-09-09T03:00:00Z")), "2026-09-08"));
});

test("empty input gives an empty field", () => {
  assert.equal(toInputDate(null), "");
  assert.equal(toInputDate(undefined), "");
  assert.equal(toInputDate(""), "");
});

report("format");
