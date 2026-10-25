import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultState } from "../electron/core";
import { Store } from "../electron/store";
import { GreetingLifetime } from "../electron/greeting";
import {
  enqueueNotice,
  collectDueNotices,
  nextNotice,
  settleNotices,
  canPresentNotice,
  enqueueReplyNotice,
} from "../electron/companion-notifications";
import type { AppState, Message } from "../src/shared";

const now = 1_800_000_000_000;
const notice = (
  state: AppState,
  type: "timer" | "check-in" | "test",
  at = now,
) =>
  enqueueNotice(state, {
    id: randomUUID(),
    sourceId: randomUUID(),
    type,
    text: "Pesan Bito",
    createdAt: at,
  }).message;
const context = {
  onboarded: true,
  locked: false,
  setup: false,
  dnd: false,
  sleeping: false,
  dragging: false,
  characterReady: true,
  chatOpen: false,
  activeBubble: false,
  now,
  notBefore: now,
};

test("due timer and active reminders create durable notices exactly once with actionable source IDs", () => {
  const state = defaultState();
  state.focus = {
    id: randomUUID(),
    duration: 60,
    remaining: 60,
    running: true,
    deadline: now - 10,
  };
  state.reminders = [
    {
      id: randomUUID(),
      title: "Minum air",
      due: now - 1,
      done: false,
      notified: false,
    },
    {
      id: randomUUID(),
      title: "Sudah selesai",
      due: now - 1,
      done: true,
      notified: false,
    },
    {
      id: randomUUID(),
      title: "Dibatalkan",
      due: now - 1,
      done: false,
      cancelled: true,
      notified: false,
    },
    {
      id: randomUUID(),
      title: "Nanti",
      due: now + 60000,
      done: false,
      notified: false,
    },
  ];
  assert.equal(collectDueNotices(state, now, randomUUID), true);
  assert.equal(state.messages.length, 2);
  assert.equal(state.focus.running, false);
  assert.equal(state.reminders[0].notified, true);
  assert.equal(state.messages[0].cards?.[0].kind, "timer");
  assert.equal(state.messages[1].cards?.[0].kind, "reminder");
  assert.equal(
    state.messages[1].notification?.sourceId,
    `${state.reminders[0].id}:${state.reminders[0].due}`,
  );
  assert.equal(collectDueNotices(state, now + 1000, randomUUID), false);
  assert.equal(state.messages.length, 2);
});

test("paused and unfinished timers do not announce completion", () => {
  const state = defaultState();
  state.focus = {
    id: randomUUID(),
    duration: 60,
    remaining: 45,
    running: false,
    deadline: null,
  };
  assert.equal(collectDueNotices(state, now, randomUUID), false);
  state.focus.running = true;
  state.focus.deadline = now + 60000;
  assert.equal(collectDueNotices(state, now, randomUUID), false);
  assert.equal(state.messages.length, 0);
});

test("DND defers presentation, survives restart, and account B never receives account A's queue", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bito-notices-"));
  let store = new Store(join(dir, "account-a.sqlite"));
  const other = new Store(join(dir, "account-b.sqlite"));
  try {
    const state = defaultState();
    state.settings.dnd = true;
    state.reminders.push({
      id: randomUUID(),
      title: "Bimbingan",
      due: now,
      done: false,
      notified: false,
    });
    collectDueNotices(state, now, randomUUID);
    store.save(state);
    store.close();
    store = new Store(join(dir, "account-a.sqlite"));
    const restored = store.load();
    assert.equal(
      canPresentNotice({ ...context, dnd: restored.settings.dnd }),
      false,
    );
    assert.equal(collectDueNotices(restored, now + 1000, randomUUID), false);
    assert.equal(restored.messages.length, 1);
    assert.ok(nextNotice(restored, now + 1000));
    restored.settings.dnd = false;
    assert.equal(
      canPresentNotice({ ...context, dnd: restored.settings.dnd }),
      true,
    );
    const shown = nextNotice(restored, now + 1000)!;
    shown.notification!.handledAt = now + 1000;
    store.save(restored);
    store.close();
    store = new Store(join(dir, "account-a.sqlite"));
    assert.equal(nextNotice(store.load(), now + 2000), undefined);
    assert.equal(nextNotice(other.load(), now + 2000), undefined);
  } finally {
    store.close();
    other.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("queue prioritizes requested events, keeps FIFO order, and waits while another bubble is present", () => {
  const state = defaultState();
  state.profile.proactive = "sometimes";
  notice(state, "check-in", now - 3000);
  const first = notice(state, "timer", now - 2000);
  const second = notice(state, "timer", now - 1000);
  assert.equal(nextNotice(state, now)?.id, first.id);
  assert.equal(canPresentNotice({ ...context, activeBubble: true }), false);
  first.notification!.handledAt = now;
  assert.equal(nextNotice(state, now)?.id, second.id);
  for (const key of [
    "locked",
    "setup",
    "dnd",
    "sleeping",
    "dragging",
    "chatOpen",
  ] as const)
    assert.equal(canPresentNotice({ ...context, [key]: true }), false, key);
  assert.equal(canPresentNotice({ ...context, characterReady: false }), false);
  assert.equal(canPresentNotice({ ...context, notBefore: now + 900 }), false);
  assert.equal(canPresentNotice(context), true);
});

test("opening chat consumes pending notices in place and does not duplicate transcript messages", () => {
  const state = defaultState();
  const first = notice(state, "timer"),
    second = notice(state, "test");
  const ids = state.messages.map((m) => m.id);
  assert.equal(settleNotices(state, now, true), true);
  assert.deepEqual(
    state.messages.map((m) => m.id),
    ids,
  );
  assert.equal(first.notification!.handledAt, now);
  assert.equal(second.notification!.handledAt, now);
  assert.equal(nextNotice(state, now), undefined);
  assert.equal(settleNotices(state, now + 1000, true), false);
});

test("cancelled, completed and rescheduled reminders cannot return as stale bubbles; snooze creates a new occurrence", () => {
  for (const action of ["done", "cancel", "snooze"] as const) {
    const state = defaultState();
    const reminder = {
      id: randomUUID(),
      title: "Cek file",
      due: now,
      done: false,
      cancelled: false,
      notified: false,
    };
    state.reminders.push(reminder);
    collectDueNotices(state, now, randomUUID);
    if (action === "done") reminder.done = true;
    if (action === "cancel") reminder.cancelled = true;
    if (action === "snooze") {
      reminder.due += 600000;
      reminder.notified = false;
    }
    assert.equal(settleNotices(state, now + 1, false), true);
    assert.equal(nextNotice(state, now + 1), undefined);
    if (action === "snooze") {
      collectDueNotices(state, reminder.due, randomUUID);
      assert.equal(state.messages.length, 2);
      assert.equal(
        nextNotice(state, reminder.due)?.notification?.sourceId,
        `${reminder.id}:${reminder.due}`,
      );
    }
  }
});

test("casual check-ins obey the preference and expire, without suppressing explicit timer events", () => {
  const state = defaultState();
  const checkIn = notice(state, "check-in");
  notice(state, "timer", now + 1);
  settleNotices(state, now + 1, false);
  assert.equal(checkIn.notification!.handledAt, now + 1);
  assert.equal(nextNotice(state, now + 1)?.notification?.type, "timer");
  state.profile.proactive = "sometimes";
  const old = notice(state, "check-in", now - 11 * 60000);
  settleNotices(state, now, false);
  assert.equal(old.notification!.handledAt, now);
});

test("only a finished background reply posts a single ready notice, never intentional cancellation or an open conversation", () => {
  for (const status of [
    "complete",
    "error",
    "interrupted",
    undefined,
  ] as const) {
    const state = defaultState();
    const reply: Message = {
      id: randomUUID(),
      role: "assistant",
      text: "Jawaban",
      status,
      createdAt: now,
    };
    state.messages.push(reply);
    assert.equal(
      enqueueReplyNotice(state, reply, true, now, randomUUID),
      false,
    );
    const expected = status === "complete" || status === "error";
    assert.equal(
      enqueueReplyNotice(state, reply, false, now, randomUUID),
      expected,
    );
    assert.equal(
      enqueueReplyNotice(state, reply, false, now + 1, randomUUID),
      false,
    );
    assert.equal(state.messages.length, expected ? 2 : 1);
    assert.equal(state.messages[0], reply);
  }
});

test("long bubbles get longer reading time, counted only after reveal, with hover preserving it", () => {
  const clock = new GreetingLifetime("kata ".repeat(100));
  assert.equal(clock.tick(now, false), false);
  clock.revealDone(now);
  assert.equal(clock.tick(now + 10000, false), false);
  assert.equal(clock.tick(now + 20000, true), false);
  assert.equal(clock.tick(now + 27999, false), false);
  assert.equal(clock.tick(now + 28000, false), true);
});
