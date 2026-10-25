import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialSway,
  advanceSway,
  swayAtRest,
  safeSwayLimits,
  pivotCompensation,
} from "../src/drag-sway";

test("right and left acceleration give mirrored hanging inertia", () => {
  const right = advanceSway(initialSway(0, 0), { x: 18, y: 0 }, true, 1 / 60);
  const left = advanceSway(initialSway(0, 0), { x: -18, y: 0 }, true, 1 / 60);
  assert.ok(right.angle > 0);
  assert.equal(left.angle, -right.angle);
  assert.equal(left.spin, -right.spin);
});

test("stopping while held produces a damped swing and settles without a repeating loop", () => {
  let s = initialSway(0, 0);
  for (let i = 1; i <= 18; i++)
    s = advanceSway(s, { x: i * 10, y: 0 }, true, 1 / 60);
  let crossed = false;
  for (let i = 0; i < 240; i++) {
    s = advanceSway(s, { x: 180, y: 0 }, true, 1 / 60);
    if (s.angle < -0.1) crossed = true;
  }
  assert.ok(crossed);
  assert.ok(Math.abs(s.angle) < 0.01);
  assert.ok(Math.abs(s.spin) < 0.01);
  assert.ok(s.scaleY > 1);
});

test("a steady drag retains a visible lean instead of becoming visually neutral", () => {
  for (const [speed, minimum] of [
    [150, 2],
    [300, 4.5],
    [600, 9],
  ]) {
    let s = initialSway(0, 0);
    for (let i = 1; i <= 120; i++)
      s = advanceSway(s, { x: (speed * i) / 60, y: 0 }, true, 1 / 60);
    assert.ok(
      s.angle > minimum,
      `${speed}px/s should retain visible hanging inertia`,
    );
  }
});

test("release preserves motion then returns to the exact neutral pose", () => {
  let s = initialSway(0, 0);
  for (let i = 1; i <= 8; i++)
    s = advanceSway(s, { x: i * 16, y: 0 }, true, 1 / 60);
  s = advanceSway(s, { x: 128, y: 0 }, false, 1 / 60);
  assert.ok(
    Math.abs(s.angle) > 0.2,
    "release must not reset rotation instantly",
  );
  for (let i = 0; i < 240; i++)
    s = advanceSway(s, { x: 128, y: 0 }, false, 1 / 60);
  assert.ok(swayAtRest(s));
});

test("rapid reversals stay finite and bounded, including a stalled frame", () => {
  let s = initialSway(0, 0);
  for (let i = 0; i < 500; i++) {
    s = advanceSway(
      s,
      { x: i % 2 ? 3000 : -3000, y: i % 2 ? 2000 : -2000 },
      true,
      i % 20 === 0 ? 1 : 1 / 144,
    );
    assert.ok(Number.isFinite(s.angle) && Number.isFinite(s.spin));
    assert.ok(Math.abs(s.angle) <= 12);
    assert.ok(s.scaleY <= 1.018 && s.scaleX >= 0.99);
  }
});

test("physics remains consistent across 30, 60 and 144 Hz", () => {
  const results = [30, 60, 144].map((hz) => {
    let s = initialSway(0, 0),
      peak = 0;
    for (let i = 1; i <= hz; i++) {
      const t = i / hz;
      s = advanceSway(s, { x: Math.min(t, 0.3) * 800, y: 0 }, true, 1 / hz);
      peak = Math.max(peak, Math.abs(s.angle));
    }
    return peak;
  });
  assert.ok(Math.max(...results) - Math.min(...results) < 0.2);
});

test("pivot changes preserve the current visual position when grabbing during a swing", () => {
  const s = { ...initialSway(0, 0), angle: 5, scaleX: 0.995, scaleY: 1.012 };
  const old = { x: 0.5, y: 0.25 },
    next = { x: 0.3, y: 0.7 };
  const fix = pivotCompensation(s, old, next, 282, 282);
  const transform = (pivot: typeof old) => {
    const a = (s.angle * Math.PI) / 180,
      x = 120 - pivot.x * 282,
      y = 180 - pivot.y * 282;
    return {
      x:
        pivot.x * 282 + x * s.scaleX * Math.cos(a) - y * s.scaleY * Math.sin(a),
      y:
        pivot.y * 282 + x * s.scaleX * Math.sin(a) + y * s.scaleY * Math.cos(a),
    };
  };
  const a = transform(old),
    b = transform(next);
  assert.ok(Math.abs(a.x - b.x - fix.x) < 1e-8);
  assert.ok(Math.abs(a.y - b.y - fix.y) < 1e-8);
});

test("safe swing limits tighten near off-center grab points", () => {
  const center = safeSwayLimits({ x: 0.5, y: 0.3 }, 282, 282);
  const edge = safeSwayLimits({ x: 0.15, y: 0.7 }, 282, 282);
  assert.ok(center.min < 0 && center.max > 0);
  assert.ok(center.min >= -12 && center.max <= 12);
  assert.ok(Math.abs(edge.min) < Math.abs(center.min));
});
