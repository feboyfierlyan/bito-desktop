import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { defaultState } from "../electron/core";
import { newProject, projectModelContext } from "../src/projects";
import { savedWork, isSavedWorkQuery } from "../src/saved-work";
import { applyProjectTool } from "../electron/projects";

function fixture() {
  const state = defaultState();
  const project = newProject({
    name: "Essay",
    brief: "Compare boards",
    outcome: "PDF",
    deadline: null,
    availability: "",
  });
  state.projects.push(project);
  state.activeProjectId = project.id;
  state.tasks.push(
    { id: randomUUID(), title: "Judul statistika", done: false },
    { id: randomUUID(), title: "Sudah selesai", done: true },
    { id: randomUUID(), title: "Judul statistika", done: false },
  );
  const archived = newProject({
    name: "Arsip",
    brief: "Private",
    outcome: "",
    deadline: null,
    availability: "",
  });
  archived.status = "archived";
  state.projects.push(archived);
  return { state, project };
}

test("saved work keeps real quick tasks, duplicates and completion separate from projects, without changing data", () => {
  const { state, project } = fixture();
  const before = JSON.stringify(state);
  const result = savedWork(state);
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].id, project.id);
  assert.equal(result.openProjects, 1);
  assert.equal(result.openQuickTasks, 2);
  assert.equal(result.quickTasks.length, 3);
  assert.equal(JSON.stringify(state), before);
  state.tasks[0].done = true;
  assert.equal(savedWork(state).openQuickTasks, 1);
  project.name = "Nama terbaru";
  assert.equal(savedWork(state).projects[0].name, "Nama terbaru");
});

test("direct inventory queries avoid stale prose without intercepting edits, advice, screen questions or date filters", () => {
  for (const query of [
    "tugas aku ada apa aja?",
    "tugasku apa saja",
    "bito, proyek aku apa aja sekarang?",
    "lihat semua tugas",
    "apa aja tugas aku?",
  ])
    assert.equal(isSavedWorkQuery(query), true, query);
  for (const query of [
    "tugas apa yang harus aku mulai?",
    "tugas aku apa aja hari ini?",
    "buat tugas baru",
    "hapus semua tugas",
    "lihat tugas ini di layar",
    "cek tugas kemarin",
    "selesaikan tugas aku",
  ])
    assert.equal(isSavedWorkQuery(query), false, query);
});

test("inventory tool reads all saved sources irrespective of active project and returns a live card, not guessed titles", () => {
  const { state, project } = fixture();
  const before = JSON.stringify(state);
  const receipt = applyProjectTool(
    state,
    { id: randomUUID(), name: "list_saved_work", args: { offset: 0 } },
    null,
  )!;
  const result = JSON.parse(receipt.result);
  assert.equal(result.projects[0].id, project.id);
  assert.equal(result.openQuickTasks, 2);
  assert.equal(result.quickTasks[0].title, "Judul statistika");
  assert.equal(receipt.card?.kind, "saved-work");
  assert.equal(result.nextOffset, null);
  assert.equal(JSON.stringify(state), before);
  assert.throws(() =>
    applyProjectTool(
      state,
      { id: randomUUID(), name: "list_saved_work", args: { offset: -1 } },
      null,
    ),
  );
});

test("inventory paginates without silently dropping old records and context advertises saved counts", () => {
  const { state } = fixture();
  for (let i = 0; i < 60; i++)
    state.tasks.push({
      id: randomUUID(),
      title: `Task ${i} ${"long title ".repeat(20)}`,
      done: false,
    });
  const before = JSON.stringify(state);
  const page = (offset: number) => {
    const result = applyProjectTool(
      state,
      { id: randomUUID(), name: "list_saved_work", args: { offset } },
      null,
    )!.result;
    assert.ok(result.length <= 2000, "receipt must survive backend truncation");
    return JSON.parse(result);
  };
  const ids: string[] = [];
  let offset = 0;
  for (let pages = 0; ; pages++) {
    assert.ok(pages < 100, "pagination must make forward progress");
    const result = page(offset);
    ids.push(
      ...result.projects.map((p: { id: string }) => p.id),
      ...result.quickTasks.map((t: { id: string }) => t.id),
    );
    if (result.nextOffset === null) break;
    assert.ok(result.nextOffset > offset);
    offset = result.nextOffset;
  }
  assert.equal(ids.length, 64);
  assert.equal(new Set(ids).size, 64);
  assert.equal(JSON.stringify(state), before);
  const context = JSON.parse(projectModelContext(state));
  assert.equal(context.savedWorkDirectory.openQuickTasks, 62);
  assert.doesNotMatch(JSON.stringify(context), /Judul statistika/);
  state.activeProjectId = null;
  assert.equal(
    JSON.parse(projectModelContext(state)).savedWorkDirectory.readTool,
    "list_saved_work",
  );
});
