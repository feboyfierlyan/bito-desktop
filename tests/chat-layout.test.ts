import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clipRegion,
  pointInRegions,
  transcriptHeight,
  placeChatPanel,
} from "../src/chat-layout";
import { placeChat } from "../electron/core";

test("conversation rectangle captures gaps while the desktop outside stays clickable", () => {
  const regions = [
    { x: 10, y: 40, width: 280, height: 155 },
    { x: 10, y: 220, width: 280, height: 48 },
  ];
  assert.equal(pointInRegions({ x: 30, y: 60 }, regions), true);
  assert.equal(pointInRegions({ x: 260, y: 125 }, regions), true);
  assert.equal(pointInRegions({ x: 40, y: 240 }, regions), true);
  assert.equal(pointInRegions({ x: 20, y: 125 }, regions), true);
  assert.equal(pointInRegions({ x: 120, y: 180 }, regions), true);
  assert.equal(pointInRegions({ x: 5, y: 125 }, regions), false);
  assert.equal(pointInRegions({ x: 120, y: 10 }, regions), false);
});
test("scrolled-out messages cannot leave invisible click targets above the transcript", () => {
  const viewport = { x: 0, y: 20, width: 320, height: 180 };
  assert.equal(
    clipRegion({ x: 20, y: -70, width: 200, height: 60 }, viewport),
    null,
  );
  assert.deepEqual(
    clipRegion({ x: 20, y: 0, width: 200, height: 70 }, viewport),
    { x: 20, y: 20, width: 200, height: 50 },
  );
  assert.equal(
    pointInRegions({ x: 40, y: 10 }, [
      clipRegion({ x: 20, y: 0, width: 200, height: 70 }, viewport)!,
    ]),
    false,
  );
});
test("compact chat keeps its composer near Bito's feet with the full pair inside either monitor", () => {
  const roomy = placeChat({ x: 200, y: 250 }, 282, {
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
  });
  assert.ok(roomy.chat.height <= Math.round(900 * 0.65));
  assert.ok(roomy.chat.width >= 420 && roomy.chat.width <= 460);
  assert.equal(
    roomy.chat.y + roomy.chat.height - 12,
    roomy.pet.y + Math.round(282 * 0.92),
  );
  const lower = placeChat({ x: 200, y: 600 }, 282, {
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
  });
  assert.equal(lower.chat.height, Math.round(900 * 0.65));
  for (const area of [
    { x: 0, y: 25, width: 1024, height: 650 },
    { x: -1440, y: -900, width: 1440, height: 900 },
  ]) {
    const layout = placeChat(
      { x: area.x + area.width - 100, y: area.y + area.height - 100 },
      282,
      area,
    );
    assert.equal(layout.side, "left");
    assert.ok(layout.chat.x + layout.chat.width <= layout.pet.x);
    assert.ok(layout.chat.x + layout.chat.width <= area.x + area.width);
    assert.ok(layout.chat.y + layout.chat.height <= area.y + area.height);
    assert.ok(layout.pet.y + 282 <= area.y + area.height);
  }
});

test("docking preserves Bito's chosen position at every edge and across monitor origins", () => {
  for (const area of [
    { x: 0, y: 25, width: 1440, height: 875 },
    { x: -1440, y: -900, width: 1440, height: 900 },
    { x: 1440, y: 150, width: 1024, height: 768 },
  ]) {
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      for (const y of [0, 0.5, 1]) {
        const position = {
          x: Math.round(area.x + x * (area.width - 282)),
          y: Math.round(area.y + y * (area.height - 282)),
        };
        const layout = placeChat(position, 282, area);
        assert.deepEqual(layout.pet, position);
        assert.ok(layout.chat.x >= area.x);
        assert.ok(layout.chat.x + layout.chat.width <= area.x + area.width);
        assert.ok(layout.chat.y >= area.y);
        assert.ok(layout.chat.y + layout.chat.height <= area.y + area.height);
        if (layout.side === "right")
          assert.ok(layout.chat.x >= position.x + 282);
        else assert.ok(layout.chat.x + layout.chat.width <= position.x);
      }
    }
  }
});

test("docking keeps its side through small pointer reversals and flips back when necessary", () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 };
  assert.equal(placeChat({ x: 550, y: 400 }, 282, area, "right").side, "right");
  assert.equal(placeChat({ x: 550, y: 400 }, 282, area, "left").side, "left");
  assert.equal(placeChat({ x: 720, y: 400 }, 282, area, "right").side, "left");
  for (const x of [715, 725, 710, 730])
    assert.equal(placeChat({ x, y: 400 }, 282, area, "left").side, "left");
  assert.equal(placeChat({ x: 250, y: 400 }, 282, area, "left").side, "right");
});

test("manual resize anchors the inner edge and composer bottom on either side", () => {
  const area = { x: 0, y: 0, width: 1920, height: 1080 };
  const position = { x: 800, y: 750 };
  for (const side of ["left", "right"] as const) {
    const small = placeChat(
      position,
      282,
      area,
      side,
      { width: 360, height: 300 },
      true,
    );
    const big = placeChat(
      position,
      282,
      area,
      side,
      { width: 620, height: 600 },
      true,
    );
    assert.deepEqual(big.pet, position);
    assert.equal(big.side, side);
    assert.equal(big.chat.width, 620);
    assert.equal(big.chat.height, 600);
    assert.equal(
      big.chat.y + big.chat.height,
      small.chat.y + small.chat.height,
    );
    if (side === "right") assert.equal(big.chat.x, small.chat.x);
    else
      assert.equal(
        big.chat.x + big.chat.width,
        small.chat.x + small.chat.width,
      );
  }
});

test("an oversized resize clamps to the current screen without flipping mid-gesture", () => {
  const area = { x: -1440, y: -900, width: 1440, height: 900 };
  const position = { x: -800, y: -400 };
  const layout = placeChat(
    position,
    282,
    area,
    "right",
    { width: 1000, height: 2000 },
    true,
  );
  assert.equal(layout.side, "right");
  assert.deepEqual(layout.pet, position);
  assert.ok(layout.chat.x + layout.chat.width <= area.x + area.width);
  assert.ok(layout.chat.y >= area.y);
  assert.ok(layout.chat.y + layout.chat.height <= area.y + area.height);
});

test("opening shows recent messages compactly; new replies can grow upward", () => {
  const history = [90, 80, 85, 75, 70, 60];
  assert.equal(transcriptHeight(history, 500, 6, false), 210);
  assert.equal(transcriptHeight([...history, 40, 220], 500, 6, false), 470);
  assert.equal(transcriptHeight([...history, 40, 450], 500, 6, false), 500);
  assert.equal(transcriptHeight([1000], 500, 1, false), 280);
  assert.equal(transcriptHeight(history, 500, 6, true), 500);
});

test("full chat panel leaves 22px to the silhouette on either side", () => {
  const area = { x: -1000, y: 0, width: 2000, height: 900 };
  const pet = { x: -300, y: 250 },
    size = 282;
  for (const side of ["left", "right"] as const) {
    const layout = placeChat(pet, size, area, side);
    const x = placeChatPanel(layout.chat, size, side, area);
    const gap =
      side === "right"
        ? x + 12 - (pet.x + size * 0.925)
        : pet.x + size * 0.075 - (x + layout.chat.width - 12);
    assert.ok(Math.abs(gap - 22) < 1);
    assert.deepEqual(layout.pet, pet);
    assert.ok(x >= area.x && x + layout.chat.width <= area.x + area.width);
  }
});
