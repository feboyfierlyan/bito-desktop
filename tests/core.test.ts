import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultState,
  isDrag,
  placeChat,
  clampPosition,
  remaining,
  settingsSchema,
  reminderSchema,
  systemPrompt,
} from "../electron/core";
import { Store } from "../electron/store";
test("a hand tremor stays a click, deliberate movement becomes drag", () => {
  assert.equal(isDrag(3, 3), false);
  assert.equal(isDrag(6, 0), true);
  assert.equal(isDrag(-10, 2), true);
});
test("chat switches left at the right edge of a secondary monitor", () => {
  const area = { x: -1440, y: 0, width: 1440, height: 900 };
  const p = placeChat({ x: -180, y: 850 }, 222, area);
  assert.equal(p.side, "left");
  assert.ok(p.chat.x + p.chat.width <= p.pet.x);
  assert.ok(p.chat.x + p.chat.width <= 0);
  assert.ok(p.chat.y + p.chat.height <= 900);
  assert.ok(p.pet.y + 222 <= 900);
});
test("an unplugged display position is recovered into the remaining work area", () => {
  assert.deepEqual(
    clampPosition(-1800, 1400, 222, { x: 0, y: 25, width: 1280, height: 775 }),
    { x: 0, y: 578 },
  );
});
test("timer uses wall time across suspend, and a paused timer does not advance", () => {
  const focus = {
    duration: 900,
    remaining: 500,
    deadline: 20000,
    running: true,
  };
  assert.equal(remaining(focus, 14000), 6);
  assert.equal(remaining(focus, 30000), 0);
  assert.equal(remaining({ ...focus, running: false }, 30000), 500);
});
test("credentials may only be sent over HTTPS or to a local development endpoint", () => {
  const base = defaultState().settings;
  assert.ok(
    settingsSchema.safeParse({ ...base, baseURL: "https://api.openai.com/v1" })
      .success,
  );
  assert.ok(
    settingsSchema.safeParse({ ...base, baseURL: "http://127.0.0.1:8787/v1" })
      .success,
  );
  assert.equal(
    settingsSchema.safeParse({
      ...base,
      baseURL: "http://untrusted.example/v1",
    }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({
      ...base,
      baseURL: "https://user:password@example.com/v1",
    }).success,
    false,
  );
});
test("invalid reminder dates cannot create a silent broken schedule", () => {
  assert.equal(
    reminderSchema.safeParse({ title: "Revisi", due: NaN }).success,
    false,
  );
  assert.equal(
    reminderSchema.safeParse({ title: "Revisi", due: Date.now() - 60000 })
      .success,
    false,
  );
  assert.equal(
    reminderSchema.safeParse({ title: "Revisi", due: Date.now() + 60000 })
      .success,
    true,
  );
});
test("SQLite round trip preserves onboarding, reminders, chat and an active focus deadline", () => {
  const dir = mkdtempSync(join(tmpdir(), "bito-store-"));
  try {
    const file = join(dir, "test.sqlite");
    const first = new Store(file);
    const s = defaultState();
    s.onboarded = true;
    s.profile.name = "Teman";
    s.chatSize = { width: 560, height: 430 };
    s.messages.push({ id: "m", role: "user", text: "Halo", createdAt: 1 });
    s.reminders.push({
      id: "r",
      title: "Revisi",
      due: Date.now() + 60000,
      notified: false,
      done: false,
    });
    s.focus = {
      duration: 900,
      remaining: 900,
      deadline: Date.now() + 900000,
      running: true,
      active: true,
    };
    first.save(s);
    first.close();
    const second = new Store(file);
    assert.deepEqual(second.load(), s);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("companion prompt uses chosen personality and does not claim unrestricted desktop access", () => {
  const s = defaultState();
  s.profile.name = "Teman";
  s.profile.style = "direct";
  const prompt = systemPrompt(s);
  assert.match(prompt, /GAYA AKTIF — To the point/);
  assert.match(
    prompt,
    /Only claim an action succeeded after a successful tool result/,
  );
  assert.match(prompt, /Only save memory when explicitly asked/);
});
