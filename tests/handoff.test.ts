import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anchorBounds,
  canWave,
  droppedOutside,
  easePosition,
  wordDelay,
} from "../src/handoff";

test("anchor maps renderer content to native DIP across a negative-coordinate monitor", () => {
  assert.deepEqual(
    anchorBounds(
      { x: 80, y: 220, width: 282, height: 282 },
      { x: -1200, y: 75, width: 1040, height: 740 },
    ),
    { x: -1120, y: 295, width: 282, height: 282 },
  );
  assert.deepEqual(
    anchorBounds(
      { x: 100, y: 100, width: 200, height: 200 },
      { x: 40, y: 60, width: 1200, height: 800 },
      1.25,
    ),
    { x: 165, y: 185, width: 250, height: 250 },
  );
});
test("handoff requires character center outside the onboarding window, not a small overlap", () => {
  const host = { x: 200, y: 100, width: 1000, height: 740 };
  assert.equal(
    droppedOutside({ x: 160, y: 350, width: 282, height: 282 }, host),
    false,
  );
  assert.equal(
    droppedOutside({ x: 50, y: 350, width: 282, height: 282 }, host),
    true,
  );
  assert.equal(
    droppedOutside({ x: 1080, y: 350, width: 282, height: 282 }, host),
    true,
  );
  assert.equal(
    droppedOutside({ x: 500, y: -60, width: 282, height: 282 }, host),
    true,
  );
});
test("return and edge recovery preserve the original viewport throughout the animation", () => {
  const from = { x: -30, y: 400, width: 282, height: 282 };
  const to = { x: 300, y: 340, width: 282, height: 282 };
  assert.deepEqual(easePosition(from, to, 0), from);
  assert.deepEqual(easePosition(from, to, 1), to);
  let last = from.x;
  for (let i = 0; i <= 20; i++) {
    const p = easePosition(from, to, i / 20);
    assert.equal(p.width, 282);
    assert.equal(p.height, 282);
    assert.ok(p.x >= last);
    last = p.x;
  }
});
test("word cadence pauses at punctuation and caps long-word delays", () => {
  assert.ok(wordDelay("teman.") > wordDelay("teman"));
  assert.ok(wordDelay("teman,") > wordDelay("teman"));
  assert.equal(wordDelay("a".repeat(200)), 195);
});

test("native coordinates normalize negative zero at a screen edge", () => {
  const from = { x: -1, y: -1, width: 282, height: 282 };
  const to = { x: 0, y: 0, width: 282, height: 282 };
  const p = easePosition(from, to, 0.99);
  assert.equal(Object.is(p.x, -0), false);
  assert.equal(Object.is(p.y, -0), false);
});

test("onboarding clicks wave only in the first two ready scenes, leaving desktop drag exclusive", () => {
  const scene = { step: 0, phase: "anchored", characterReady: true };
  assert.equal(canWave(scene), true);
  assert.equal(canWave({ ...scene, step: 1 }), true);
  assert.equal(canWave({ ...scene, step: 2 }), false);
  assert.equal(canWave({ ...scene, characterReady: false }), false);
  for (const phase of ["ready", "dragging", "returning", "departing"])
    assert.equal(canWave({ ...scene, phase }), false);
  assert.equal(canWave(undefined), false);
});
