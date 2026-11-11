import { test } from "node:test";
import assert from "node:assert/strict";
import {
  workspaceTaskGroups,
  workspaceTaskInsights,
  workspaceTaskInventory,
  workspaceProjectProgress,
  type WorkspaceItem,
} from "../src/workspace-task-model";
import { defaultState } from "../electron/core";
import { newProject, type ProjectTask } from "../src/projects";
const task = (
  id: string,
  date: string | null,
  done = false,
): WorkspaceItem => ({
  id,
  title: id,
  date,
  done,
  priority: 4,
  blocked: false,
  projectId: null,
  projectName: "Pribadi",
});
const today = "2026-11-09";
test("project progress covers all non-archived projects and prioritizes unfinished deadlines", () => {
  const make = (
    name: string,
    date: string | null,
    statuses: ProjectTask["status"][],
  ) => {
    const p = newProject({
      name,
      brief: "",
      outcome: "",
      availability: "",
      deadline: null,
    });
    p.plan = {
      id: name,
      summary: "",
      assumptions: [],
      milestones: [
        {
          id: name,
          title: name,
          targetDate: date,
          tasks: statuses.map((status, i) => ({
            id: `${name}-${i}`,
            title: name,
            details: "",
            doneWhen: "",
            estimateMin: 5,
            estimateMax: 5,
            sourceIds: [],
            status,
          })),
        },
      ],
    };
    return p;
  };
  const late = make("Late", "2026-11-05", ["done", "todo"]);
  const next = make("Next", "2026-11-10", ["todo"]);
  const explicitUndated = make("Undated", "2026-11-01", ["todo"]);
  explicitUndated.plan!.milestones[0].tasks[0].dueDate = null;
  const finished = make("Finished", "2026-11-01", ["done"]);
  const empty = make("Empty", null, []);
  const archived = make("Archived", "2026-10-01", ["todo"]);
  archived.status = "archived";
  const projects = [next, finished, empty, archived, explicitUndated, late];
  const before = JSON.stringify(projects);
  const rows = workspaceProjectProgress(projects, today);
  assert.deepEqual(
    rows.map((r) => r.project.name),
    ["Late", "Next", "Empty", "Undated", "Finished"],
  );
  assert.deepEqual(
    rows.map((r) => [r.done, r.total]),
    [
      [1, 2],
      [0, 1],
      [0, 0],
      [0, 1],
      [1, 1],
    ],
  );
  assert.equal(
    JSON.stringify(projects),
    before,
    "sorting never mutates saved records",
  );
  assert.equal(rows.find((r) => r.project === explicitUndated)!.overdue, false);
  late.plan!.milestones[0].tasks[1].status = "done";
  assert.equal(
    workspaceProjectProgress(projects, today)[0].project,
    next,
    "completed work stops leading the urgency order",
  );
  late.plan!.milestones[0].tasks[1].status = "todo";
  assert.equal(
    workspaceProjectProgress(projects, today)[0].done,
    1,
    "reopening updates live counts",
  );
  assert.deepEqual(workspaceProjectProgress([], today), []);
});
test("Today keeps overdue and today; future and undated work remains reachable in all tasks", () => {
  const items = [
    task("past", "2026-11-08"),
    task("now", today),
    task("later", "2026-11-10"),
    task("undated", null),
    task("done", today, true),
    task("future-done", "2026-11-10", true),
  ];
  assert.deepEqual(
    workspaceTaskGroups(items, today, false, false, "", "date").flatMap((g) =>
      g.rows.map((t) => t.id),
    ),
    ["past", "now"],
  );
  assert.equal(
    workspaceTaskGroups(items, today, true, false, "", "date").flatMap(
      (g) => g.rows,
    ).length,
    4,
  );
  assert.deepEqual(
    workspaceTaskGroups(items, today, false, true, "", "date").flatMap((g) =>
      g.rows.map((t) => t.id),
    ),
    ["done"],
  );
});
test("insights count overlapping overdue and blocked once and handle an empty inventory", () => {
  const overdue = { ...task("late", "2026-11-08"), blocked: true };
  const data = workspaceTaskInsights(
    [overdue, task("done", "2026-11-07", true), task("later", "2026-11-10")],
    today,
  );
  assert.equal(data.attention.length, 1);
  assert.equal(data.overdue.length, 1);
  assert.equal(data.blocked.length, 1);
  assert.equal(data.percent, 33);
  assert.equal(workspaceTaskInsights([], today).percent, 0);
});
test("inventory excludes archives and unfinished tasks in completed projects, but preserves completion totals", () => {
  const state = defaultState();
  const p = newProject({
    name: "Essay",
    brief: "",
    outcome: "",
    availability: "",
    deadline: null,
  });
  p.status = "completed";
  p.plan = {
    id: "plan",
    summary: "",
    assumptions: [],
    milestones: [
      {
        id: "m",
        title: "M",
        targetDate: today,
        tasks: [
          {
            id: "done",
            title: "Done",
            details: "",
            doneWhen: "",
            estimateMin: 1,
            estimateMax: 2,
            sourceIds: [],
            status: "done",
          },
          {
            id: "unfinished",
            title: "Old",
            details: "",
            doneWhen: "",
            estimateMin: 1,
            estimateMax: 2,
            sourceIds: [],
            status: "todo",
          },
        ],
      },
    ],
  };
  const archived = structuredClone(p);
  archived.id = "archived";
  archived.status = "archived";
  state.projects = [p, archived];
  state.tasks = [];
  assert.deepEqual(
    workspaceTaskInventory(state).map((t) => t.id),
    ["done"],
  );
});
test("same IDs across projects stay distinct and search matches project context", () => {
  const a = { ...task("shared", today), projectId: "a", projectName: "Essay" };
  const b = { ...task("shared", today), projectId: "b", projectName: "Slides" };
  assert.equal(
    workspaceTaskGroups([a, b], today, false, false, "", "date")[1].rows.length,
    2,
  );
  assert.equal(
    workspaceTaskGroups([a, b], today, true, false, "Slides", "date")[1].rows[0]
      .projectId,
    "b",
  );
});

test("sort choices preserve original order or alphabetize within date groups", () => {
  const items = [task("Zebra", today), task("Apple", today)];
  const ids = (sort: "none" | "title") =>
    workspaceTaskGroups(items, today, true, false, "", sort).flatMap((g) =>
      g.rows.map((t) => t.id),
    );
  assert.deepEqual(ids("none"), ["Zebra", "Apple"]);
  assert.deepEqual(ids("title"), ["Apple", "Zebra"]);
  assert.deepEqual(
    items.map((t) => t.id),
    ["Zebra", "Apple"],
  );
});
