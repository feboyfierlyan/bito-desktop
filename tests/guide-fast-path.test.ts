import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GuideResultCache,
  menuContinuation,
  resolveMenuContinuation,
  GuideTimings,
} from "../electron/guide-fast-path";
import type { GroundingResult, ScreenElement } from "../src/grounding";
const frame = { x: 0, y: 0, width: 1000, height: 1000 };
const window = {
  id: "1",
  pid: 123,
  app: "Editor",
  title: "Doc",
  bounds: frame,
};
const trigger: ScreenElement = {
  id: "menu.1",
  name: "Insert",
  role: "AXMenuBarItem",
  enabled: true,
  hitVerified: true,
  bounds: { x: 100, y: 20, width: 70, height: 25 },
};
const item: ScreenElement = {
  id: "menu.1.0.2",
  name: "Table of contents",
  role: "AXMenuItem",
  enabled: true,
  hitVerified: true,
  bounds: { x: 100, y: 50, width: 160, height: 30 },
};
const view = {
  frontPid: 123,
  activity: "1",
  accessible: true,
  elements: [trigger],
};
const result: GroundingResult = {
  status: "found",
  answer: "Klik Insert.",
  label: "Insert",
  confidence: 0.97,
  box: [20, 100, 45, 170],
  guide: {
    progress: "initial",
    elementId: trigger.id,
    evidence: "",
    expected: "Insert menu visible",
    nextMenu: {
      name: item.name,
      instruction: "Klik Table of contents.",
      expected: "Daftar isi terlihat",
    },
  },
};
const observation = () => ({
  window: structuredClone(window),
  frame: { ...frame },
  view: structuredClone(view),
  pixels: new Uint8Array(160 * 100 * 4).fill(255),
  context: { goal: "Bikin daftar isi", step: 1 },
  style: "chill",
});
test("a planned menu step uses only an exact unique live hit-tested descendant of its original trigger", () => {
  const plan = menuContinuation(result, window, view);
  assert.ok(plan);
  const current = { ...view, elements: [trigger, item] };
  const r = resolveMenuContinuation(plan, window, current, frame);
  assert.equal(r?.answer, "Klik Table of contents.");
  assert.equal(r?.guide?.progress, "advanced");
  assert.equal(r?.guide?.elementId, item.id);
  assert.equal(
    r?.guide?.nextMenu,
    undefined,
    "one local hop, no speculative chain",
  );
  for (const bad of [
    { ...current, frontPid: 999 },
    { ...current, accessible: false },
    { ...current, elements: [trigger, { ...item, enabled: false }] },
    { ...current, elements: [trigger, { ...item, hitVerified: false }] },
    { ...current, elements: [trigger, { ...item, name: "Table" }] },
    { ...current, elements: [trigger, { ...item, id: "other.2" }] },
    { ...current, elements: [trigger, item, { ...item, id: "menu.1.0.3" }] },
    { ...current, elements: [{ ...trigger, name: "Format" }, item] },
    {
      ...current,
      elements: [trigger, { ...item, bounds: { ...item.bounds, x: 2000 } }],
    },
  ])
    assert.equal(resolveMenuContinuation(plan, window, bad, frame), null);
  assert.equal(
    resolveMenuContinuation(plan, { ...window, id: "other" }, current, frame),
    null,
  );
  assert.equal(
    menuContinuation(result, window, {
      ...view,
      elements: [{ ...trigger, hitVerified: false }],
    }),
    undefined,
  );
});
test("cache needs the same goal, style, exact screen/window/native state, fresh enabled target and unexpired entry", () => {
  const cache = new GuideResultCache(),
    o = observation();
  cache.put(o, result, 100);
  assert.equal(cache.get(o, 101)?.answer, result.answer);
  const edits = [
    (x: ReturnType<typeof observation>) => {
      x.context.goal = "Autre tâche";
    },
    (x: ReturnType<typeof observation>) => {
      x.style = "care";
    },
    (x: ReturnType<typeof observation>) => {
      x.window.id = "2";
    },
    (x: ReturnType<typeof observation>) => {
      x.window.title = "Other";
    },
    (x: ReturnType<typeof observation>) => {
      x.frame.x = -1000;
    },
    (x: ReturnType<typeof observation>) => {
      x.pixels[0] = 0;
    },
    (x: ReturnType<typeof observation>) => {
      x.view.elements[0].hitVerified = false;
    },
    (x: ReturnType<typeof observation>) => {
      x.view.elements[0].enabled = false;
    },
    (x: ReturnType<typeof observation>) => {
      x.view.frontPid = 999;
    },
  ];
  for (const edit of edits) {
    const x = observation();
    edit(x);
    assert.equal(cache.get(x, 101), null);
  }
  assert.equal(cache.get(o, 120101), null);
  assert.equal(
    new GuideResultCache().get(o, 101),
    null,
    "never shared across sessions/users",
  );
});
test("cache does not memoize completion, uncertainty or pixel-only targets", () => {
  const o = observation();
  for (const r of [
    { ...result, confidence: 0.8 },
    { ...result, guide: { ...result.guide!, elementId: "" } },
    {
      ...result,
      status: "not_found" as const,
      box: [],
      guide: { ...result.guide!, progress: "done" as const },
    },
  ]) {
    const cache = new GuideResultCache();
    cache.put(o, r, 100);
    assert.equal(cache.get(o, 101), null);
  }
});
test("performance diagnostics contain only bounded timings and return copies", async () => {
  const metrics = new GuideTimings();
  for (let i = 0; i < 90; i++) await metrics.measure("capture", async () => i);
  assert.equal(metrics.snapshot().length, 80);
  assert.ok(
    metrics
      .snapshot()
      .every((s) => s.milliseconds >= 0 && Object.keys(s).length === 2),
  );
  const copy = metrics.snapshot();
  copy[0].stage = "tampered";
  assert.equal(metrics.snapshot()[0].stage, "capture");
  await assert.rejects(
    metrics.measure("model", async () => {
      throw Error("secret prompt");
    }),
  );
  assert.deepEqual(Object.keys(metrics.snapshot().at(-1)!), [
    "stage",
    "milliseconds",
  ]);
});
