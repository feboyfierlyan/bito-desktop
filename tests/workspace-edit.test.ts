import { test } from "node:test";
import assert from "node:assert/strict";
import { updateQuickTask, taskContentStamp } from "../src/task-capture";
import { defaultState } from "../electron/core";
import { projectCommand } from "../electron/projects";
import { newProject } from "../src/projects";
test("quick task edit rejects stale forms and preserves completion and untouched metadata", () => {
  const tasks = [
    {
      id: "a",
      title: "Read",
      done: true,
      details: "chapter 2",
      dueDate: "2026-11-09",
      priority: 2,
    },
  ];
  const expected = taskContentStamp(tasks[0]);
  updateQuickTask(tasks, {
    id: "a",
    expected,
    changes: { title: "Read again", dueDate: null },
  });
  assert.equal(tasks[0].done, true);
  assert.equal(tasks[0].details, "chapter 2");
  assert.equal(tasks[0].priority, 2);
  assert.equal(tasks[0].dueDate, null);
  assert.throws(
    () =>
      updateQuickTask(tasks, {
        id: "a",
        expected,
        changes: { title: "Stale" },
      }),
    /berubah/,
  );
  assert.throws(() =>
    updateQuickTask(tasks, {
      id: "a",
      expected: taskContentStamp(tasks[0]),
      changes: { title: "Bad", dueDate: "2026-02-30" },
    }),
  );
});
test("project task content and dates update atomically with version and deadline checks", () => {
  const state = defaultState(),
    p = newProject({
      name: "Essay",
      brief: "",
      outcome: "",
      availability: "",
      deadline: "2026-11-12",
    });
  state.projects = [p];
  projectCommand(state, "project-task-capture", {
    id: p.id,
    version: p.version,
    planId: null,
    milestoneId: null,
    title: "Draft",
    details: "Keep",
    dueDate: "2026-11-10",
  });
  const task = p.plan!.milestones[0].tasks[0],
    oldVersion = p.version;
  projectCommand(state, "project-task-edit", {
    id: p.id,
    taskId: task.id,
    version: p.version,
    changes: { title: "Outline" },
  });
  assert.equal(p.plan!.milestones[0].tasks[0].title, "Outline");
  assert.equal(p.plan!.milestones[0].tasks[0].details, "Keep");
  assert.throws(
    () =>
      projectCommand(state, "project-task-edit", {
        id: p.id,
        taskId: task.id,
        version: oldVersion,
        changes: { title: "Old" },
      }),
    /berubah/,
  );
  const before = structuredClone(p);
  assert.throws(() =>
    projectCommand(state, "project-task-edit", {
      id: p.id,
      taskId: task.id,
      version: p.version,
      changes: { title: "Invalid", dueDate: "2026-11-13" },
    }),
  );
  assert.deepEqual(p, before);
  projectCommand(state, "project-work-start", {
    id: p.id,
    taskId: task.id,
    objective: "Outline",
    minutes: null,
  });
  const session = p.sessions![0];
  projectCommand(state, "project-work-pause", {
    id: p.id,
    sessionId: session.id,
  });
  projectCommand(state, "project-work-resume", {
    id: p.id,
    sessionId: session.id,
  });
  projectCommand(state, "project-work-finish", {
    id: p.id,
    sessionId: session.id,
  });
  projectCommand(state, "project-work-report", {
    id: p.id,
    sessionId: session.id,
    outcome: "partial",
    note: "First paragraph",
    nextStep: "",
  });
  assert.equal(p.plan!.milestones[0].tasks[0].status, "doing");
  assert.equal(p.checkpoint?.lastStop, "First paragraph");
  assert.equal(session.phase, "finished");
});
