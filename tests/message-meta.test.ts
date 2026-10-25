import { test } from "node:test";
import assert from "node:assert/strict";
import {
  messageDay,
  messageDayLabel,
  messageTime,
  retryText,
} from "../src/message-meta";
import type { Message } from "../src/shared";

test("messages group by local calendar day, even across midnight", () => {
  const before = new Date(2026, 9, 23, 23, 59).getTime();
  const after = new Date(2026, 9, 24, 0, 1).getTime();
  assert.notEqual(messageDay(before), messageDay(after));
  assert.equal(messageDayLabel(before, after), "Kemarin");
  assert.equal(messageDayLabel(after, after), "Hari ini");
  assert.equal(
    messageDay(after),
    messageDay(new Date(2026, 9, 24, 23, 59).getTime()),
  );
});

test("yesterday crosses a year boundary; older history includes its year", () => {
  const now = new Date(2027, 0, 1, 0, 2).getTime();
  assert.equal(
    messageDayLabel(new Date(2026, 11, 31, 23, 59).getTime(), now),
    "Kemarin",
  );
  assert.match(messageDayLabel(new Date(2026, 11, 30).getTime(), now), /2026/);
  assert.doesNotMatch(
    messageDayLabel(new Date(2027, 0, 2).getTime(), now),
    /2027/,
  );
  assert.match(messageTime(new Date(2027, 0, 1, 0, 5).getTime()), /^00[.:]05$/);
});

test("retry uses the failed reply's original prompt instead of a newer prompt", () => {
  const m = (id: string, role: Message["role"], text: string): Message => ({
    id,
    role,
    text,
    createdAt: 1,
  });
  const messages = [
    m("welcome", "assistant", "Halo"),
    m("one", "user", "Rencana proyek"),
    m("failed", "assistant", "Sebagian jawaban"),
    m("two", "user", "Pesan terbaru"),
    m("latest", "assistant", "Balasan"),
  ];
  assert.equal(retryText(messages, "failed"), "Rencana proyek");
  assert.equal(retryText(messages, "latest"), "Pesan terbaru");
  assert.equal(retryText(messages, "welcome"), undefined);
  assert.equal(retryText(messages, "missing"), undefined);
  assert.equal(retryText(messages, "one"), undefined);
});
