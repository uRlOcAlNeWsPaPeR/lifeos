/**
 * Scene store checks — what re-renders React, and what doesn't.
 *
 *   npx tsx src/lib/scene/scene-store.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import { sceneStore } from "./scene-store";

const el = (name: string) => ({ name }) as unknown as HTMLElement;

function counting() {
  sceneStore.reset();
  let n = 0;
  const off = sceneStore.subscribe(() => n++);
  return { count: () => n, off };
}

test("adding and removing anchors notifies; the key is sorted and stable", () => {
  const c = counting();
  sceneStore.setAnchor("orbit:study", el("a"));
  sceneStore.setAnchor("hero", el("b"));
  assert.equal(sceneStore.anchorKey(), "hero,orbit:study");
  assert.equal(c.count(), 2);
  sceneStore.setAnchor("hero", null);
  assert.equal(sceneStore.anchorKey(), "orbit:study");
  assert.equal(c.count(), 3);
  c.off();
});

test("re-registering the same anchor (a re-rendered ref) doesn't notify", () => {
  const c = counting();
  sceneStore.setAnchor("orbit:sat", el("a"));
  const before = c.count();
  sceneStore.setAnchor("orbit:sat", el("a2")); // new element, same id
  assert.equal(c.count(), before);
  assert.equal((sceneStore.getScene().els.get("orbit:sat") as unknown as { name: string }).name, "a2");
  c.off();
});

test("looks are read per frame and never notify; unset fields keep defaults", () => {
  const c = counting();
  sceneStore.setLook("hero", { hue: 38 });
  sceneStore.setLook("hero", { energy: 0.95, active: true });
  assert.equal(c.count(), 0);
  assert.deepEqual(sceneStore.lookOf("hero"), { hue: 38, energy: 0.95, kind: "orbit", active: true });
  assert.equal(sceneStore.lookOf("unknown").hue, 150);
  c.off();
});

test("status changes notify once; repeats don't", () => {
  const c = counting();
  sceneStore.setStatus("loading");
  sceneStore.setStatus("ready");
  sceneStore.setStatus("ready");
  assert.equal(c.count(), 2);
  sceneStore.setStatus("failed", "context-lost");
  assert.equal(sceneStore.getScene().reason, "context-lost");
  assert.equal(c.count(), 3);
  c.off();
});

report("scene-store");
