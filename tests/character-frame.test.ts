import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchingCharacterFrame,
  paintedCharacterFrame,
} from "../src/character-frame";

test("a transparent mascot frame is required; blank and opaque loading surfaces stay hidden", () => {
  for (const rgba of [
    [0, 0, 0, 0],
    [0, 0, 0, 255],
    [255, 255, 255, 255],
    [110, 180, 80, 255],
  ]) {
    assert.equal(
      paintedCharacterFrame(new Uint8ClampedArray([...rgba, ...rgba])),
      false,
    );
  }
  assert.equal(
    paintedCharacterFrame(
      new Uint8ClampedArray([0, 0, 0, 0, 110, 180, 80, 255]),
    ),
    true,
  );
});

test("a frame from the login viewport cannot reveal the resized desktop surface", () => {
  assert.equal(
    matchingCharacterFrame(null, { width: 282, height: 282 }),
    false,
  );
  assert.equal(
    matchingCharacterFrame(
      { width: 104, height: 104 },
      { width: 282, height: 282 },
    ),
    false,
  );
  assert.equal(
    matchingCharacterFrame(
      { width: NaN, height: 282 },
      { width: 282, height: 282 },
    ),
    false,
  );
  assert.equal(
    matchingCharacterFrame({ width: 0, height: 0 }, { width: 0, height: 0 }),
    false,
  );
  assert.equal(
    matchingCharacterFrame(
      { width: 282, height: 282 },
      { width: 282, height: 282 },
    ),
    true,
  );
  assert.equal(
    matchingCharacterFrame(
      { width: 281.5, height: 282.5 },
      { width: 282, height: 282 },
    ),
    true,
  );
});
