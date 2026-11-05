import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuickTask, taskCaptureCommand } from "../src/task-capture";
import { savedTaskItems } from "../src/saved-work";
import { defaultState } from "../electron/core";
test("legacy and structured quick capture validate dates and preserve task metadata", () => {
  assert.deepEqual(parseQuickTask(" Legacy task "), { title: "Legacy task" });
  const task = {
    title: "Study",
    details: "Read chapter 2",
    dueDate: "2026-11-06",
    priority: 1,
  };
  assert.deepEqual(taskCaptureCommand(task), {
    name: "task-add",
    payload: task,
  });
  for (const value of [
    { ...task, title: " " },
    { ...task, dueDate: "2026-02-30" },
    { ...task, priority: 0 },
    { ...task, extra: "no" },
  ])
    assert.throws(() => parseQuickTask(value));
  const state = defaultState();
  state.tasks = [{ id: "one", done: false, ...parseQuickTask(task) }];
  assert.deepEqual(savedTaskItems(state)[0], {
    id: "one",
    title: "Study",
    done: false,
    date: "2026-11-06",
    priority: 1,
    projectId: null,
    projectName: "Tugas singkat",
  });
});
