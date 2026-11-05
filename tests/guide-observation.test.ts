import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GuideObservationGate,
  guideImageChanged,
} from "../electron/guide-observation";
import { resolveGroundingTarget, parseGroundingResult } from "../src/grounding";
import type { InterfaceObservation } from "../electron/screen-context";
const view = (activity = "1"): InterfaceObservation => ({
  frontPid: 7,
  activity,
  accessible: true,
  elements: [],
});
const pixels = () => new Uint8Array(160 * 100 * 4).fill(255);
test("a small settled menu plus user activity wakes verification; movement or clicks alone do not", () => {
  const base = pixels(),
    menu = base.slice(),
    caret = base.slice();
  menu.fill(0, 0, 400 * 4);
  caret.fill(0, 0, 4);
  assert.equal(guideImageChanged(base, menu), true);
  assert.equal(guideImageChanged(base, caret), false);
  const gate = new GuideObservationGate(view(), base);
  assert.equal(gate.needsCapture(view(), 100), false);
  assert.equal(
    gate.sample(view(), menu, 100),
    false,
    "background motion cannot wake AI",
  );
  assert.equal(gate.needsCapture(view("2"), 200), true);
  assert.equal(
    gate.sample(view("2"), base, 200),
    false,
    "click alone is not progress",
  );
  assert.equal(
    gate.sample(view("2"), menu, 500),
    false,
    "first changed frame is not settled",
  );
  assert.equal(gate.sample(view("2"), menu, 900), true);
  assert.equal(
    gate.sample(view("2"), menu, 1200),
    false,
    "same interaction consumed once",
  );
});
test("continuous animation and expired activity do not create an analysis loop", () => {
  const base = pixels(),
    dark = new Uint8Array(base.length),
    gate = new GuideObservationGate(view(), base);
  gate.needsCapture(view("2"), 100);
  assert.equal(gate.sample(view("2"), dark, 500), false);
  assert.equal(gate.sample(view("2"), base, 900), false);
  assert.equal(gate.sample(view("2"), dark, 1500), false);
  assert.equal(gate.needsCapture(view("2"), 7000), false);
  assert.equal(gate.sample(view("2"), dark, 7000), false);
  assert.equal(gate.needsCapture(null, 7100), false);
});
test("settling requires both stable native controls and pixels, including the capture frame", () => {
  const base = pixels(),
    changed = base.slice();
  changed.fill(0, 0, 400 * 4);
  const frame = { x: 0, y: 0, width: 1440, height: 900 };
  const gate = new GuideObservationGate(view(), base, frame);
  gate.needsCapture(view("2"), 100);
  const a = {
    ...view("2"),
    elements: [
      {
        id: "menu",
        name: "Insert",
        role: "AXMenu",
        enabled: true,
        bounds: frame,
      },
    ],
  };
  assert.equal(gate.sample(a, changed, 200, frame), false);
  const b = {
    ...a,
    elements: [{ ...a.elements[0], name: "Table of contents" }],
  };
  assert.equal(
    gate.sample(b, changed, 400, frame),
    false,
    "pixels alone cannot prove a settled menu",
  );
  assert.equal(gate.sample(b, changed, 600, { ...frame, x: 100 }), false);
  assert.equal(gate.sample(b, changed, 800, { ...frame, x: 100 }), true);
});
test("returning to the app preserves the original baseline and can verify the same click", () => {
  const base = pixels(),
    menu = base.slice();
  menu.fill(0, 0, 400 * 4);
  const gate = new GuideObservationGate(view(), base);
  gate.continueTransition(100);
  assert.equal(gate.unchanged(view(), base), true);
  assert.equal(
    gate.sample(view(), base, 200),
    false,
    "focus alone is not success",
  );
  assert.equal(gate.sample(view(), menu, 400), false);
  assert.equal(gate.sample(view(), menu, 600), true);
});
test("native candidates cannot invent IDs, select hidden/out-of-frame controls, or override conflicting visible coordinates", () => {
  const frame = { x: -1000, y: 0, width: 1000, height: 1000 };
  const result = parseGroundingResult({
    status: "found",
    answer: "Klik Settings.",
    label: "Settings",
    confidence: 0.97,
    box: [100, 100, 140, 180],
    guide: {
      progress: "initial",
      expected: "Menu Settings terbuka",
      evidence: "",
      elementId: "a",
    },
  });
  const element = {
    id: "a",
    name: "Settings",
    role: "AXButton",
    enabled: true,
    bounds: { x: -900, y: 100, width: 80, height: 40 },
  };
  assert.deepEqual(
    resolveGroundingTarget(result, frame, [element]),
    element.bounds,
  );
  assert.equal(resolveGroundingTarget(result, frame, []), null);
  assert.equal(
    resolveGroundingTarget(result, frame, [{ ...element, enabled: false }]),
    null,
  );
  assert.equal(
    resolveGroundingTarget(result, frame, [
      { ...element, bounds: { ...element.bounds, x: 200 } },
    ]),
    null,
  );
  assert.equal(
    resolveGroundingTarget(result, frame, [
      { ...element, bounds: { ...element.bounds, y: 700 } },
    ]),
    null,
  );
  assert.throws(() =>
    parseGroundingResult({
      ...result,
      guide: { ...result.guide, progress: "done" },
    }),
  );
});

test("native UI changes wake verification without a mouse/keyboard counter change", () => {
  const base = pixels(),
    gate = new GuideObservationGate(view(), base);
  const menu = {
    ...view(),
    elements: [
      {
        id: "menu.1",
        name: "Insert",
        role: "AXMenuItem",
        enabled: true,
        bounds: { x: 10, y: 10, width: 50, height: 20 },
      },
    ],
  };
  assert.equal(gate.needsCapture(menu, 100), true);
  assert.equal(gate.sample(menu, base, 100), false);
  assert.equal(gate.settling, true);
  assert.equal(gate.sample(menu, base, 250), true);
  assert.equal(
    gate.needsCapture(menu, 8000),
    false,
    "an unchanged tree cannot reopen verification",
  );
  const changed = {
    ...menu,
    elements: [{ ...menu.elements[0], name: "Daftar isi" }],
  };
  assert.equal(
    gate.needsCapture(changed, 8100),
    true,
    "a later programmatic UI change wakes again",
  );
  assert.equal(gate.sample(changed, base, 8100), false);
  assert.equal(gate.sample(changed, base, 8250), true);
});
