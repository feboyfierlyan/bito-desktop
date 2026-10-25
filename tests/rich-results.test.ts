import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultState } from "../electron/core";
import {
  applyRichTool,
  controlRichAction,
  findCard,
} from "../electron/rich-actions";
import {
  readOutputFile,
  textFileInput,
  writeChosenTextFile,
} from "../electron/file-output";
import { Store } from "../electron/store";
import { attachCard, timerCardState } from "../src/result-cards";
import type { Message } from "../src/shared";

const message = (): Message => ({
  id: randomUUID(),
  role: "assistant",
  text: "",
  createdAt: Date.now(),
});

test("timer cards control only their own persisted session, including pause/resume/extend/end", () => {
  const state = defaultState(),
    m = message();
  state.messages.push(m);
  const receipt = applyRichTool(state, {
    id: randomUUID(),
    name: "start_focus",
    args: { minutes: 2 },
  })!;
  attachCard(m, receipt.card!);
  const payload = { messageId: m.id, cardId: receipt.card!.id };
  controlRichAction(state, { ...payload, operation: "timer-pause" });
  assert.equal(state.focus.running, false);
  assert.equal(state.focus.remaining, 120);
  controlRichAction(state, { ...payload, operation: "timer-add" });
  assert.equal(state.focus.duration, 180);
  assert.equal(state.focus.remaining, 180);
  controlRichAction(state, { ...payload, operation: "timer-resume" });
  assert.equal(state.focus.running, true);
  assert.ok(state.focus.deadline! > Date.now() + 178000);
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(
    timerCardState(receipt.card as any, restored.focus).status,
    "running",
  );
  applyRichTool(state, {
    id: randomUUID(),
    name: "start_focus",
    args: { minutes: 1 },
  });
  const current = state.focus.id;
  assert.throws(
    () => controlRichAction(state, { ...payload, operation: "timer-end" }),
    /berakhir/,
  );
  assert.equal(state.focus.id, current);
  assert.equal(
    timerCardState(receipt.card as any, state.focus).status,
    "ended",
  );
  controlRichAction(restored, { ...payload, operation: "timer-end" });
  assert.equal(restored.focus.active, false);
  assert.throws(() =>
    controlRichAction(restored, { ...payload, operation: "timer-resume" }),
  );
});

test("checklist tasks use real task IDs, preserve independent state, and reject foreign task actions", () => {
  const state = defaultState(),
    m = message();
  state.messages.push(m);
  const call = {
    id: randomUUID(),
    name: "create_checklist" as const,
    args: {
      title: "Presentasi",
      items: ["Pesan utama", "Tiga slide", "Latihan"],
    },
  };
  const receipt = applyRichTool(state, call)!;
  attachCard(m, receipt.card!);
  attachCard(m, receipt.card!);
  assert.equal(m.cards?.length, 1);
  assert.equal(state.tasks.length, 3);
  assert.equal(receipt.card?.kind, "checklist");
  const task = state.tasks[1];
  controlRichAction(state, {
    messageId: m.id,
    cardId: call.id,
    operation: "task-toggle",
    taskId: task.id,
  });
  assert.equal(task.done, true);
  assert.equal(state.tasks[0].done, false);
  const foreign = { id: randomUUID(), title: "Other", done: false };
  state.tasks.push(foreign);
  assert.throws(() =>
    controlRichAction(state, {
      messageId: m.id,
      cardId: call.id,
      operation: "task-toggle",
      taskId: foreign.id,
    }),
  );
  assert.equal(foreign.done, false);
  assert.throws(() =>
    applyRichTool(state, {
      ...call,
      id: randomUUID(),
      args: { title: "Invalid", items: Array(13).fill("Item") },
    }),
  );
  assert.equal(state.tasks.length, 4);
});

test("multiple task calls merge into one checklist without duplicating replayed tasks", () => {
  const m = message(),
    state = defaultState();
  const a = applyRichTool(state, {
    id: randomUUID(),
    name: "add_task",
    args: { title: "A" },
  })!.card!;
  const b = applyRichTool(state, {
    id: randomUUID(),
    name: "add_task",
    args: { title: "B" },
  })!.card!;
  attachCard(m, a);
  attachCard(m, b);
  attachCard(m, b);
  assert.equal(m.cards?.length, 1);
  assert.equal(m.cards?.[0].kind === "checklist" && m.cards[0].tasks.length, 2);
});

test("reminder edits validate before mutation and cancellation prevents later notifications", () => {
  const state = defaultState(),
    m = message();
  state.messages.push(m);
  const due = Date.now() + 3600000;
  const receipt = applyRichTool(state, {
    id: randomUUID(),
    name: "create_reminder",
    args: { title: "Minum", due: new Date(due).toISOString() },
  })!;
  attachCard(m, receipt.card!);
  const p = { messageId: m.id, cardId: receipt.id };
  assert.throws(() =>
    controlRichAction(state, {
      ...p,
      operation: "reminder-update",
      title: "Later",
      due: Date.now() - 60000,
    }),
  );
  assert.equal(state.reminders[0].title, "Minum");
  controlRichAction(state, {
    ...p,
    operation: "reminder-update",
    title: "Istirahat",
    due: due + 60000,
  });
  assert.equal(state.reminders[0].title, "Istirahat");
  controlRichAction(state, { ...p, operation: "reminder-cancel" });
  assert.equal(state.reminders[0].done, true);
  assert.equal(state.reminders[0].cancelled, true);
  assert.throws(() => findCard(state, randomUUID(), receipt.id));
});

test("text file writes are exact UTF-8, bounded, cancellable, and never overwrite or follow links", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bito-files-")),
    signal = new AbortController().signal;
  try {
    const content = "# Halo Bito\n\nSelamat belajar 🌱\n";
    const output = (await writeChosenTextFile(
      randomUUID(),
      { name: "catatan.md", content },
      async () => dir,
      signal,
    ))!;
    assert.equal(await readFile(output.path, "utf8"), content);
    assert.equal(output.bytes, Buffer.byteLength(content));
    assert.equal(await readOutputFile(output), content);
    await assert.rejects(
      writeChosenTextFile(
        randomUUID(),
        { name: "catatan.md", content: "replacement" },
        async () => dir,
        signal,
      ),
      /Tidak ditimpa/,
    );
    assert.equal(await readFile(output.path, "utf8"), content);
    for (const name of [
      "../outside.txt",
      "a/b.txt",
      "CON.txt",
      "a.pdf",
      "run.sh",
      "x.txt.",
    ])
      assert.throws(() => textFileInput({ name, content: "x" }));
    assert.throws(() =>
      textFileInput({ name: "large.txt", content: "🌱".repeat(20000) }),
    );
    assert.throws(() => textFileInput({ name: "null.txt", content: "a\0b" }));
    assert.equal(
      await writeChosenTextFile(
        randomUUID(),
        { name: "cancelled.txt", content: "x" },
        async () => null,
        signal,
      ),
      null,
    );
    const controller = new AbortController();
    await assert.rejects(
      writeChosenTextFile(
        randomUUID(),
        { name: "abort.txt", content: "x" },
        async () => {
          controller.abort();
          return dir;
        },
        controller.signal,
      ),
    );
    await unlink(output.path);
    await writeFile(join(dir, "other.txt"), "Private unrelated data");
    await symlink(join(dir, "other.txt"), output.path);
    await assert.rejects(readOutputFile(output), /dipindahkan|diganti/);
    await assert.rejects(
      writeChosenTextFile(
        randomUUID(),
        { name: "catatan.md", content: "replacement" },
        async () => dir,
        signal,
      ),
      /Tidak ditimpa/,
    );
    assert.equal(
      await readFile(join(dir, "other.txt"), "utf8"),
      "Private unrelated data",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("file registry and cards survive restart while staying isolated between accounts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bito-card-store-"));
  let a: Store | undefined, b: Store | undefined;
  try {
    a = new Store(join(dir, "a.sqlite"));
    b = new Store(join(dir, "b.sqlite"));
    const m = message(),
      state = defaultState();
    state.messages.push(m);
    const output = (await writeChosenTextFile(
      randomUUID(),
      { name: "hello-world.txt", content: "Hello, World!" },
      async () => dir,
      new AbortController().signal,
    ))!;
    const card = {
      id: output.id,
      kind: "file" as const,
      fileId: output.id,
      name: output.name,
      format: output.format,
      bytes: output.bytes,
    };
    a.saveFile(output);
    a.beginTool(output.id, "fingerprint");
    a.finishTool({ id: output.id, ok: true, result: "Saved", card });
    attachCard(m, card);
    a.save(state);
    a.close();
    a = new Store(join(dir, "a.sqlite"));
    assert.equal(a.load().messages[0].cards?.[0].id, output.id);
    assert.equal(await readOutputFile(a.getFile(output.id)!), "Hello, World!");
    assert.equal(a.beginTool(output.id, "fingerprint")?.card?.id, output.id);
    assert.equal(b.getFile(output.id), undefined);
    assert.throws(() => findCard(b!.load(), m.id, card.id));
  } finally {
    a?.close();
    b?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
