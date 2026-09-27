/**
 * College Board date parsing — the page layout is theirs to change, so these
 * pin down what we read and, as importantly, what we refuse to trust.
 *
 *   npx tsx src/lib/sat/official-dates.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import {
  FALLBACK_DATES,
  isInPsatWindow,
  isOfficialSat,
  looksComplete,
  parseCollegeBoardDates,
  parseDateLine,
  parseRangeLine,
  upcomingPsat,
  upcomingSat,
} from "./official-dates";

// The shape of satsuite.collegeboard.org/sat/dates-deadlines, cut down. Note the
// "Register" button that sits inside some rows.
const PAGE = `<html><head><script>var x = "Oct. 1, 2099";</script></head><body>
<h2>SAT Weekend August 2026–June 2027 Test Dates</h2>
<table><tr><th>SAT Test Date*</th><th>Registration Deadline</th><th>Deadline for Changes, Regular Cancellation,</th><th>and Late Registration**</th></tr>
<tr><td>Aug. 22, 2026</td><td>Aug. 7, 2026</td><td>Aug. 11, 2026</td></tr>
<tr><td>Sept. 12, 2026</td><td>Aug. 28, 2026</td><td>Sept. 1, 2026</td></tr>
<tr><td>Oct. 3, 2026</td><td>Sept. 18, 2026</td><td>Sept. 22, 2026</td></tr>
<tr><td>Nov. 7, 2026</td><td>Oct. 23, 2026</td><td><a>Register</a></td><td>Oct. 27, 2026</td></tr>
<tr><td>March 6, 2027</td><td>Feb. 19, 2027</td><td>Feb. 23, 2027</td></tr></table>
<h3>In-School Assessments 2026-27 Test Dates</h3>
<p>For Fall 2026: SAT School Day, PSAT/NMSQT, and PSAT 8/9</p><p>October 1–30, 2026</p>
<p>For Spring 2027: SAT School Day, PSAT 10, and PSAT 8/9</p><p>March 1–April 30, 2027</p>
<h3>Anticipated SAT Weekend 2027-28 Test Dates</h3>
<p>Fall 2027</p><p>August 28, 2027</p><p>September 18, 2027</p>
<p>Spring 2028</p><p>March 4, 2028</p>
<h3>Important Dates—Domestic 2026-27</h3><p>Oct. 9, 2026</p>
</body></html>`;

test("date lines read in College Board's abbreviated and full styles", () => {
  assert.equal(parseDateLine("Sept. 12, 2026"), "2026-09-12");
  assert.equal(parseDateLine("March 6, 2027"), "2027-03-06");
  assert.equal(parseDateLine("Aug. 7, 2026"), "2026-08-07");
  assert.equal(parseDateLine("Register"), null);
  assert.equal(parseDateLine("SAT Weekend August 2026–June 2027 Test Dates"), null);
});

test("ranges read within a month and across months", () => {
  assert.deepEqual(parseRangeLine("October 1–30, 2026"), { start: "2026-10-01", end: "2026-10-30" });
  assert.deepEqual(parseRangeLine("March 1–April 30, 2027"), { start: "2027-03-01", end: "2027-04-30" });
  assert.equal(parseRangeLine("Fall 2026"), null);
});

test("the SAT table is read row by row, deadlines included", () => {
  const { sat } = parseCollegeBoardDates(PAGE);
  const confirmed = sat.filter((s) => !s.anticipated);
  assert.deepEqual(confirmed.map((s) => s.date), ["2026-08-22", "2026-09-12", "2026-10-03", "2026-11-07", "2027-03-06"]);
  assert.equal(confirmed[2].registerBy, "2026-09-18");
  assert.equal(confirmed[2].lateBy, "2026-09-22");
});

test("a Register button inside a row doesn't cut the table short", () => {
  const { sat } = parseCollegeBoardDates(PAGE);
  const nov = sat.find((s) => s.date === "2026-11-07")!;
  assert.equal(nov.lateBy, "2026-10-27");
  assert.ok(sat.some((s) => s.date === "2027-03-06"), "rows after the button are still read");
});

test("next year's dates are kept but marked anticipated", () => {
  const { sat } = parseCollegeBoardDates(PAGE);
  const a = sat.filter((s) => s.anticipated).map((s) => s.date);
  assert.deepEqual(a, ["2027-08-28", "2027-09-18", "2028-03-04"]);
});

test("the PSAT/NMSQT window is read, and PSAT 10 is not mistaken for it", () => {
  const { psat } = parseCollegeBoardDates(PAGE);
  assert.deepEqual(psat, [{ start: "2026-10-01", end: "2026-10-30", label: "Fall 2026" }]);
});

test("dates inside scripts are ignored", () => {
  assert.ok(!parseCollegeBoardDates(PAGE).sat.some((s) => s.date === "2099-10-01"));
});

test("a page that no longer parses is not trusted", () => {
  const broken = parseCollegeBoardDates("<html><body><p>We've redesigned!</p></body></html>");
  assert.equal(looksComplete(broken), false);
  assert.equal(looksComplete(parseCollegeBoardDates(PAGE)), true);
});

test("the built-in fallback is itself complete", () => {
  assert.equal(looksComplete(FALLBACK_DATES), true);
});

test("upcoming lists drop dates already past", () => {
  const d = parseCollegeBoardDates(PAGE);
  assert.deepEqual(upcomingSat(d, "2026-10-04").filter((s) => !s.anticipated).map((s) => s.date), ["2026-11-07", "2027-03-06"]);
  assert.equal(upcomingPsat(d, "2026-10-31").length, 0);
  assert.equal(upcomingPsat(d, "2026-10-15").length, 1);
});

test("a saved date is checked against what College Board lists now", () => {
  const d = parseCollegeBoardDates(PAGE);
  assert.equal(isOfficialSat(d, "2026-10-03"), true);
  assert.equal(isOfficialSat(d, "2026-10-10"), false, "a date College Board no longer lists");
  assert.equal(isInPsatWindow(d, "2026-10-14"), true);
  assert.equal(isInPsatWindow(d, "2026-11-14"), false);
});

report("official-dates");
