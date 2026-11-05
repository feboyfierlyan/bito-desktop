import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { defaultState } from "../electron/core";
import { quickTaskRemovalScope, prepareQuickTaskRemoval, confirmQuickTaskRemoval } from "../electron/quick-task-removal";

const now = 1800000000000;
function setup(scope: "all" | "done" = "all") {
  const s = defaultState();
  s.tasks = [{ id: randomUUID(), title: "Baca jurnal", done: false }, { id: randomUUID(), title: "Kirim draf", done: true }];
  const result = prepareQuickTaskRemoval(s, scope, now);
  const message = { id: randomUUID(), role: "assistant" as const, text: result.text, createdAt: now, cards: [result.card!] };
  s.messages.push(message);
  return { s, card: result.card!, args: { messageId: message.id, cardId: result.card!.id, action: "confirm" } };
}
test("recognizes explicit bulk requests, without intercepting ordinary questions or project edits", () => {
  for (const text of ["remove semua quick task!", "hapus semua tugas singkat", "delete all quick tasks", "Bito, tolong hapus quick tasks semuanya", "remove semua tugas yang ada di quick task", "hapus semua tugas di daftar quick task", "tolong hapusin seluruh quick task dong!", "clear all tasks in quick tasks", "hapus tugas singkat semuanya ya"]) assert.equal(quickTaskRemovalScope(text), "all", text);
  for (const text of ["hapus tugas singkat yang sudah selesai", "remove quick tasks done", "delete all completed quick tasks", "hapus semua tugas yang sudah selesai di quick task"]) assert.equal(quickTaskRemovalScope(text), "done", text);
  for (const text of ["hapus proyek", "hapus semua task", 'dia bilang "hapus semua quick task"', "gimana cara hapus semua quick task", "hapus quick task", "buat tugas singkat hapus semua file", "hapus semua proyek di quick task", "hapus semua quick task dan proyek", "hapus semua quick task kecuali jurnal"]) assert.equal(quickTaskRemovalScope(text), undefined, text);
});
test("preparing deletion never removes tasks; confirmation deletes only reviewed snapshot IDs", () => {
  const { s, card, args } = setup();
  assert.equal(s.tasks.length, 2);
  const extra = { id: randomUUID(), title: "Tugas baru", done: false };
  s.tasks.push(extra);
  const beforeProjects = structuredClone(s.projects), beforeReminders = structuredClone(s.reminders);
  confirmQuickTaskRemoval(s, args, now + 1);
  assert.deepEqual(s.tasks, [extra]);
  assert.deepEqual(s.projects, beforeProjects);
  assert.deepEqual(s.reminders, beforeReminders);
  assert.equal(card.kind === "quick-task-removal" && card.status, "removed");
  assert.throws(() => confirmQuickTaskRemoval(s, args, now + 2));
});
test("completed-only deletion leaves unfinished tasks intact", () => {
  const { s, args } = setup("done");
  confirmQuickTaskRemoval(s, args, now + 1);
  assert.equal(s.tasks.length, 1);
  assert.equal(s.tasks[0].done, false);
});
test("cancel, expiry, wrong message and changed task cannot delete anything", () => {
  for (const change of ["cancel", "expiry", "edited", "done", "missing", "wrong-message", "user-message"] as const) {
    const { s, args } = setup();
    if (change === "edited") s.tasks[0].title = "Berubah";
    if (change === "done") s.tasks[0].done = true;
    if (change === "missing") s.tasks.shift();
    if (change === "user-message") s.messages[0].role = "user";
    const before = structuredClone(s.tasks);
    if (change === "cancel") confirmQuickTaskRemoval(s, { ...args, action: "cancel" }, now);
    else assert.throws(() => confirmQuickTaskRemoval(s, { ...args, ...(change === "wrong-message" ? { messageId: randomUUID() } : {}) }, change === "expiry" ? now + 600000 : now));
    assert.deepEqual(s.tasks, before, change);
  }
});
test("new requests supersede old confirmation and empty lists need no confirmation", () => {
  const { s, card, args } = setup();
  prepareQuickTaskRemoval(s, "done", now + 1);
  assert.equal(card.kind === "quick-task-removal" && card.status, "cancelled");
  assert.throws(() => confirmQuickTaskRemoval(s, args, now + 2));
  s.tasks = [];
  assert.equal(prepareQuickTaskRemoval(s, "all", now).card, undefined);
});
