import { test } from "node:test";
import assert from "node:assert/strict";
import { insideCapsule, insideHoverBridge, paintedPixelAt } from "../src/pet-hit";

test("transparent padding and gaps do not activate the pet even inside its canvas", () => {
  const bounds = { left: -30, top: -20, width: 200, height: 200 };
  const bitmap = { width: 400, height: 400 };
  // Two painted lobes with a transparent gap; rectangle approximations hit all three.
  const alpha = (x: number, y: number) => y >= 100 && y < 180 &&
    ((x >= 100 && x < 150) || (x >= 200 && x < 250)) ? 255 : 0;
  assert.equal(paintedPixelAt({ x: 30, y: 40 }, bounds, bitmap, alpha), true);
  assert.equal(paintedPixelAt({ x: 55, y: 40 }, bounds, bitmap, alpha), false);
  assert.equal(paintedPixelAt({ x: 80, y: 40 }, bounds, bitmap, alpha), true);
  assert.equal(paintedPixelAt({ x: -20, y: 0 }, bounds, bitmap, alpha), false);
});

test("CSS scaling, negative canvas offsets and Retina coordinates map to the right pixel", () => {
  let sampled: number[] = [];
  assert.equal(paintedPixelAt({ x: 100, y: 80 },
    { left: -50, top: -20, width: 300, height: 200 },
    { width: 1200, height: 800 }, (x, y) => { sampled = [x, y]; return 255; }), true);
  assert.deepEqual(sampled, [600, 400]);
});

test("outside the bitmap never reads pixels; faint anti-aliasing does not expand the hit area", () => {
  const bounds = { left: 0, top: 0, width: 100, height: 100 };
  const bitmap = { width: 200, height: 200 };
  for (const point of [{ x: -1, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }])
    assert.equal(paintedPixelAt(point, bounds, bitmap, () => { throw Error("outside read"); }), false);
  assert.equal(paintedPixelAt({ x: 50, y: 50 }, bounds, bitmap, () => 8), false);
  assert.equal(paintedPixelAt({ x: 50, y: 50 }, bounds, bitmap, () => 200), true);
});

test("pill remains usable but its invisible rectangular corners do not trigger hover", () => {
  const bounds = { left: 20, top: 30, width: 116, height: 30 };
  assert.equal(insideCapsule({ x: 21, y: 31 }, bounds), false);
  assert.equal(insideCapsule({ x: 21, y: 45 }, bounds), true);
  assert.equal(insideCapsule({ x: 78, y: 45 }, bounds), true);
  assert.equal(insideCapsule({ x: 78, y: 28 }, bounds), false);
  assert.equal(insideCapsule({ x: 139, y: 45 }, bounds), false);
  assert.equal(insideCapsule({ x: 33, y: 44 }, { left: 20, top: 42, width: 28, height: 6 }), true);
});


test("the invisible corridor preserves feet-to-pill hover without activating from empty space", () => {
  const visual = { left: 0, top: 0, width: 240, height: 210 };
  const pill = { left: 62, top: 207, width: 116, height: 30 };
  for (const y of [185, 193, 200, 207, 220]) {
    assert.equal(insideHoverBridge({ x: 120, y }, visual, pill, 116, true), true);
    assert.equal(insideHoverBridge({ x: 120, y }, visual, pill, 116, false), false);
  }
  for (const point of [{ x: 20, y: 200 }, { x: 220, y: 200 }, { x: 120, y: 150 }, { x: 120, y: 230 }])
    assert.equal(insideHoverBridge(point, visual, pill, 116, true), false);
});

test("the corridor follows resized and offset pets, in either travel direction", () => {
  for (const size of [162, 212, 292]) {
    const visual = { left: 80, top: 40, width: size, height: size - 30 };
    const pill = { left: 80 + (size - 116) / 2, top: 40 + size - 33, width: 116, height: 30 };
    const x = 80 + size / 2;
    const top = 40 + (size - 30) * .84;
    const bottom = pill.top + 15;
    const points = [top + 1, (top + bottom) / 2, bottom - 1];
    for (const y of [...points, ...points.reverse()])
      assert.equal(insideHoverBridge({ x, y }, visual, pill, 116, true), true);
  }
});
