import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dailyProjectProgress, newProject, recordProjectProgress } from "../src/projects";
import {
  calendarWeek,
  localDateKey,
  projectCalendarItems,
  progressSeries,
} from "../src/project-board";

test("calendar weeks preserve local dates and cross year boundaries Monday through Sunday", () => {
  const days = calendarWeek(new Date(2027, 0, 1, 23));
  assert.deepEqual(
    days.map((d) => d.key),
    [
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ],
  );
  assert.equal(days[0].date.getDay(), 1);
  assert.equal(localDateKey(new Date(2026, 9, 31, 0)), "2026-10-31");
  assert.deepEqual(
    calendarWeek(new Date(2026, 2, 8)).map((d) => d.key),
    [
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
    ],
  );
});

test("calendar displays only dated milestones and actual deadline, with completion from tasks", () => {
  const p = newProject({
    name: "Essay",
    brief: "Compare",
    outcome: "PDF",
    deadline: "2026-11-06",
    availability: "",
  });
  const task = {
    id: randomUUID(),
    title: "Write",
    details: "",
    doneWhen: "",
    estimateMin: 25,
    estimateMax: 25,
    sourceIds: [],
    status: "todo" as const,
  };
  p.plan = {
    id: randomUUID(),
    summary: "Write",
    assumptions: [],
    milestones: [
      {
        id: randomUUID(),
        title: "Draft",
        targetDate: "2026-11-02",
        tasks: [task],
      },
      {
        id: randomUUID(),
        title: "Review",
        targetDate: null,
        tasks: [{ ...task, id: randomUUID() }],
      },
    ],
  };
  const before = JSON.stringify(p);
  const items = projectCalendarItems(p);
  assert.equal(items.length, 2);
  assert.equal(items[0].date, "2026-11-02");
  assert.equal(items[0].done, false);
  assert.equal(items[1].kind, "deadline");
  assert.equal(JSON.stringify(p), before);
  p.plan.milestones[0].tasks[0].status = "done";
  assert.equal(projectCalendarItems(p)[0].done, true);
});

test("chart never invents progress history and preserves changing task totals", () => {
  const p = newProject({
    name: "Essay",
    brief: "Compare",
    outcome: "PDF",
    deadline: null,
    availability: "",
  });
  assert.deepEqual(progressSeries(p), []);
  p.progressHistory = [
    { at: 100, done: 1, total: 2 },
    { at: 86400200, done: 1, total: 4 },
  ];
  assert.deepEqual(
    progressSeries(p).map((r) => r.percent),
    [50, 25],
  );
  assert.equal(progressSeries(p)[1].at, 86400200);
});

test("checkbox reversals produce net daily progress, including existing stored history", () => {
  const p = newProject({ name: "Essay", brief: "", outcome: "", deadline: null, availability: "" });
  const day = new Date(2026, 10, 2, 10).getTime();
  p.progressHistory = [
    { at: day, done: 0, total: 2 },
    { at: day + 1000, done: 1, total: 2 },
    { at: day + 2000, done: 0, total: 2 },
    { at: day + 3000, done: 1, total: 2 },
    { at: day + 4000, done: 0, total: 2 },
  ];
  const audit = structuredClone(p.progressHistory);
  assert.deepEqual(progressSeries(p).map(r => r.percent), [0]);
  assert.deepEqual(p.progressHistory, audit, "rendering must not rewrite stored observations");
  p.progressHistory.push({ at: new Date(2026, 10, 3, 10).getTime(), done: 1, total: 2 });
  assert.deepEqual(progressSeries(p).map(r => r.percent), [0, 50]);
  p.progressHistory.push({ at: new Date(2026, 10, 3, 11).getTime(), done: 0, total: 2 });
  assert.deepEqual(dailyProjectProgress(p).map(r => r.done), [0, 0]);
});

test("daily progress uses local day boundaries and keeps actual scope reductions", () => {
  const p = newProject({ name: "Essay", brief: "", outcome: "", deadline: null, availability: "" });
  p.progressHistory = [
    { at: new Date(2026, 10, 2, 23, 59).getTime(), done: 2, total: 2 },
    { at: new Date(2026, 10, 3, 0, 1).getTime(), done: 2, total: 4 },
  ];
  assert.deepEqual(progressSeries(p).map(r => r.percent), [100, 50]);
  recordProjectProgress(p, new Date(2026, 10, 3, 0, 2).getTime());
  assert.equal(progressSeries(p).at(-1)!.percent, 0);
});
