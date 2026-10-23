import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Rive } from "@rive-app/canvas";
import { defaultState } from "../electron/core";
import type { Snapshot } from "../src/shared";
import {
  approach,
  canTrackGaze,
  gazeInViewport,
  gazeOffset,
} from "../src/gaze";
import { createEyeRig } from "../src/eye-rig";

test("gaze works only in onboarding steps one and two, never during drag or reduced motion", () => {
  const s: Snapshot = {
    ...defaultState(),
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
    presentation: {
      step: 0,
      phase: "anchored",
      characterReady: true,
      talking: true,
    },
  };
  assert.equal(canTrackGaze(s), true);
  s.presentation!.step = 1;
  assert.equal(canTrackGaze(s), true);
  s.presentation!.step = 2;
  assert.equal(canTrackGaze(s), false);
  s.presentation!.step = 0;
  s.dragging = true;
  assert.equal(canTrackGaze(s), false);
  s.dragging = false;
  s.settings.reducedMotion = true;
  assert.equal(canTrackGaze(s), false);
  s.presentation = undefined;
  assert.equal(canTrackGaze(s), false);
});

test("native cursor mapping handles Retina DIP and negative monitor coordinates", () => {
  assert.deepEqual(
    gazeInViewport(
      { x: -850, y: 250 },
      { x: -1000, y: 100, width: 300, height: 300 },
    ),
    { active: true, x: 0.5, y: 0.5 },
  );
});

test("pupils follow the cursor in both axes and stay within their safe ellipse", () => {
  for (const x of [-100, 0, 0.5, 1, 100]) {
    for (const y of [-100, 0, 0.5, 1, 100]) {
      const p = gazeOffset(x, y, 0.5, 0.5);
      assert.ok((p.x / 11) ** 2 + (p.y / 7) ** 2 <= 1.000001);
      assert.equal(Math.sign(p.x), Math.sign(x - 0.5));
      assert.equal(Math.sign(p.y), Math.sign(y - 0.5));
    }
  }
});

test("smoothing is independent of refresh rate and cannot overshoot", () => {
  let thirty = -11,
    sixty = -11;
  for (let i = 0; i < 30; i++) thirty = approach(thirty, 11, 1 / 30);
  for (let i = 0; i < 60; i++) sixty = approach(sixty, 11, 1 / 60);
  assert.ok(Math.abs(thirty - sixty) < 1e-10);
  assert.ok(sixty < 11 && sixty > -11);
});

test("eye rig returns smoothly to the original pupil positions and releases control", () => {
  const makeNode = (x: number) => ({
    x,
    y: 0.5,
    worldTransform: () => ({
      xx: 1,
      xy: 0,
      yx: 0,
      yy: 1,
      tx: 250 + x,
      ty: 250.5,
      delete() {},
    }),
  });
  const l = makeNode(-15.5),
    r = makeNode(15.5);
  const rive = {
    artboard: {
      node: (name: string) => (name === "Pupil_L" ? l : r),
      advance() {},
    },
    bounds: { minX: 0, minY: 0, maxX: 500, maxY: 500 },
  } as unknown as Rive;
  const rig = createEyeRig(rive)!;
  for (let i = 0; i < 60; i++)
    rig.advance({ active: true, x: 1, y: 0 }, 1 / 60, true);
  assert.ok(l.x > 0 && r.x > 0);
  const before = l.x;
  rig.advance({ active: true, x: 1, y: 0 }, 1 / 60, false);
  assert.ok(l.x > -15.5 && l.x < before); // exit does not snap
  for (let i = 0; i < 60; i++)
    rig.advance({ active: false, x: 1, y: 0 }, 1 / 60, false);
  assert.deepEqual([l.x, l.y, r.x, r.y], [-15.5, 0.5, 15.5, 0.5]);
  l.x = 3; // another animation owns this property after release
  rig.advance({ active: false, x: 1, y: 0 }, 1 / 60, false);
  assert.equal(l.x, 3);
});

test("prepared Rive adds only pupil names and preserves all original animation bytes", () => {
  const source = readFileSync(
    new URL("../assets/bito-original.riv", import.meta.url),
  );
  const prepared = readFileSync(new URL("../public/bito.riv", import.meta.url));
  let restored = prepared;
  for (const name of ["Pupil_L", "Pupil_R"]) {
    const property = Buffer.concat([
      Buffer.from([4, name.length]),
      Buffer.from(name),
    ]);
    const offset = restored.indexOf(property);
    assert.ok(offset > 0);
    restored = Buffer.concat([
      restored.subarray(0, offset),
      restored.subarray(offset + property.length),
    ]);
  }
  assert.deepEqual(restored, source);
});
