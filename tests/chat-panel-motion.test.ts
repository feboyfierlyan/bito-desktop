import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chatPanelReveal,
  panelHitBounds,
  clipToPanel,
} from "../src/chat-panel-motion";

test("opening exposes the full panel on either dock, while closing collapses to the near-side corner", () => {
  const frame = { x: 12, y: 100, width: 420, height: 500 };
  for (const side of ["left", "right"] as const) {
    assert.deepEqual(
      panelHitBounds(frame, chatPanelReveal(true, side, 420, 500).clipPath),
      frame,
    );
    const closed = panelHitBounds(
      frame,
      chatPanelReveal(false, side, 420, 500).clipPath,
    );
    assert.deepEqual(closed, {
      x: side === "right" ? 12 : 372,
      y: 540,
      width: 60,
      height: 60,
    });
  }
});

test("during reveal, native hit regions stay inside the same mask as every visible component", () => {
  const frame = { x: -420, y: 40, width: 420, height: 500 };
  const wholeViewport = { x: -600, y: 0, width: 900, height: 900 };
  for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
    const top = 440 * (1 - progress),
      right = 360 * (1 - progress);
    const visible = panelHitBounds(
      frame,
      `inset(${top}px ${right}px 0px 0px round 30px)`,
    );
    assert.deepEqual(clipToPanel(wholeViewport, visible), visible);
    const outside = {
      x: frame.x + visible.width + 1,
      y: frame.y,
      width: 10,
      height: 10,
    };
    assert.equal(clipToPanel(outside, visible), null);
    assert.ok(visible.width >= 60 && visible.width <= 420);
    assert.ok(visible.height >= 60 && visible.height <= 500);
  }
});

test("messages and resize controls extending beyond the panel cannot claim invisible pointer space", () => {
  const visible = { x: 12, y: 100, width: 420, height: 500 };
  assert.deepEqual(
    clipToPanel({ x: 0, y: 90, width: 100, height: 60 }, visible),
    { x: 12, y: 100, width: 88, height: 50 },
  );
  assert.equal(
    clipToPanel({ x: 12, y: 0, width: 40, height: 32 }, visible),
    null,
  );
  assert.deepEqual(panelHitBounds(visible, "inset(0px round 30px)"), visible);
  assert.deepEqual(panelHitBounds(visible, "none"), visible);
});

test("compact panels never produce negative masks and CSS inset shorthand follows the same containment", () => {
  const frame = { x: 0, y: 0, width: 48, height: 48 };
  assert.deepEqual(
    panelHitBounds(frame, chatPanelReveal(false, "right", 48, 48).clipPath),
    frame,
  );
  assert.deepEqual(
    panelHitBounds(
      { x: 0, y: 0, width: 100, height: 100 },
      "inset(5px 10px round 30px)",
    ),
    { x: 10, y: 5, width: 80, height: 90 },
  );
  assert.equal(
    panelHitBounds(frame, "inset(100px 100px 0px 0px round 30px)").width,
    0,
  );
});
