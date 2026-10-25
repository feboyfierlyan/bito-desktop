import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GreetingLifetime,
  welcomeText,
  placeGreeting,
} from "../electron/greeting";
import { placeChat } from "../electron/core";
import { placeChatPanel } from "../src/chat-layout";

test("welcome uses the chosen name and has a clean fallback", () => {
  const named = welcomeText(" Okta ");
  const fallback = welcomeText("  ");
  assert.match(named, /, Okta[!,]/);
  assert.ok(!named.includes(" Okta "));
  assert.ok(!fallback.includes(", !"));
  for (const text of [named, fallback]) {
    assert.match(text, /Klik aku/);
    assert.ok(!text.includes("undefined"));
    assert.ok(text.length < 120);
  }
});
test("reading time starts after text reveal, never during window preparation", () => {
  const clock = new GreetingLifetime();
  assert.equal(clock.tick(40000, false), false);
  clock.revealDone(40000);
  assert.equal(clock.tick(47999, false), false);
  assert.equal(clock.tick(48000, false), true);
});
test("hover and dragging freeze remaining reading time without resetting it", () => {
  const clock = new GreetingLifetime();
  clock.revealDone(0);
  assert.equal(clock.tick(3000, false), false);
  assert.equal(clock.tick(13000, true), false);
  assert.equal(clock.tick(22999, true), false);
  assert.equal(clock.tick(27998, false), false);
  assert.equal(clock.tick(27999, false), true);
});
test("repeated completion messages cannot extend the greeting indefinitely", () => {
  const clock = new GreetingLifetime();
  clock.revealDone(1000);
  clock.revealDone(8000);
  assert.equal(clock.tick(9000, false), true);
});

test("greeting leaves an 18px visual gap on either side without moving Bito", () => {
  const area = { x: -1000, y: 0, width: 2000, height: 900 };
  const pet = { x: -300, y: 250 },
    size = 282;
  for (const side of ["left", "right"] as const) {
    const layout = placeChat(pet, size, area, side);
    const x = placeGreeting(layout.chat, size, side, area);
    const gap =
      side === "right"
        ? x + 8 - (pet.x + size * 0.925)
        : pet.x + size * 0.075 - (x + layout.chat.width - 8);
    assert.ok(Math.abs(gap - 18) <= 1);
    assert.deepEqual(layout.pet, pet);
    assert.ok(x >= area.x && x + layout.chat.width <= area.x + area.width);
  }
});

test("greeting promotion retains native coordinates at screen edges and with manual sizing", () => {
  for (const area of [
    { x: 0, y: 0, width: 1440, height: 900 },
    { x: -1440, y: -900, width: 1440, height: 900 },
  ]) {
    for (const x of [area.x, area.x + 550, area.x + area.width - 282]) {
      for (const size of [undefined, { width: 360, height: 400 }]) {
        const layout = placeChat(
          { x, y: area.y + 250 },
          282,
          area,
          undefined,
          size,
        );
        assert.equal(
          placeGreeting(layout.chat, 282, layout.side, area),
          placeChatPanel(layout.chat, 282, layout.side, area),
        );
      }
    }
  }
});
