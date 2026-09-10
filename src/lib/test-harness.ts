/**
 * A ~30-line test harness so the pure-logic modules can be checked without
 * pulling a test runner (and its transitive tree) into the project.
 *
 * Each test file registers cases with `test()` and ends with `report()`, which
 * prints the failures and sets a non-zero exit code.
 */

let passed = 0;
const failures: string[] = [];

export function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n    ${(e as Error).message.split("\n")[0]}`);
  }
}

export function report(suite: string): void {
  if (failures.length) {
    console.error(`\n✗ ${suite}: ${failures.length} failed, ${passed} passed\n`);
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    process.exit(1);
  }
  console.log(`✓ ${suite}: ${passed} tests passed`);
}
