import { test } from "node:test";
import assert from "node:assert/strict";
import { newProject, type Project } from "../src/projects";
import {
  workspaceOverview,
  filterWorkspaceProjects,
} from "../src/workspace-overview";

function project(name: string, status: Project["status"] = "active") {
  const p = newProject({
    name,
    brief: "",
    outcome: "",
    deadline: null,
    availability: "",
  });
  p.status = status;
  p.plan = {
    id: name,
    summary: "",
    assumptions: [],
    milestones: [
      {
        id: "group",
        title: "Langkah",
        targetDate: null,
        tasks: [
          {
            id: name + "-task",
            title: "Kerjakan " + name,
            details: "",
            doneWhen: "",
            estimateMin: 10,
            estimateMax: 15,
            sourceIds: [],
            status: "todo",
          },
        ],
      },
    ],
  };
  return p;
}
test("workspace resumes an open session before recommending another selected project", () => {
  const running = project("Sedang dikerjakan"),
    selected = project("Dipilih");
  running.sessions = [
    {
      id: "session",
      taskId: running.plan!.milestones[0].tasks[0].id,
      taskTitle: "Lanjut",
      objective: "Lanjut dari catatan",
      minutes: 15,
      phase: "paused",
      startedAt: 1,
      resumedAt: null,
      elapsedMs: 1000,
      endedAt: null,
    },
  ];
  const overview = workspaceOverview([selected, running], selected.id);
  assert.equal(overview.focus?.id, running.id);
  assert.equal(overview.session?.phase, "paused");
  assert.equal(overview.entry?.continuing, true);
  running.plan!.milestones[0].tasks[0].status = "doing";
  running.checkpoint = {
    taskId: running.sessions[0].taskId,
    lastStop: "Bagian satu",
    nextStep: "Periksa bagian kedua",
    blocker: "",
    updatedAt: 1,
  };
  assert.equal(
    workspaceOverview([running]).entry?.objective,
    "Periksa bagian kedua",
  );
  selected.sessions = structuredClone(running.sessions);
  selected.sessions[0].taskId = selected.plan!.milestones[0].tasks[0].id;
  assert.equal(
    workspaceOverview([running, selected], selected.id).focus?.id,
    selected.id,
  );
  selected.sessions = [];
  assert.equal(
    workspaceOverview([selected, project("Lain")], selected.id).focus?.id,
    selected.id,
  );
});
test("completed, blocked and archived work is not recommended as a new working step", () => {
  const archived = project("Arsip", "archived"),
    done = project("Selesai", "completed"),
    exhausted = project("Beres"),
    blocked = project("Menunggu");
  exhausted.plan!.milestones[0].tasks[0].status = "done";
  blocked.plan!.milestones[0].tasks[0].status = "blocked";
  assert.equal(
    workspaceOverview([archived, done, exhausted, blocked], archived.id).focus,
    undefined,
  );
  assert.equal(
    workspaceOverview([archived, done, exhausted, blocked], blocked.id).review
      ?.id,
    blocked.id,
  );
  assert.equal(workspaceOverview([done]).review, undefined);
  const planning = project("Rencana", "planning");
  planning.plan = null;
  const overview = workspaceOverview([archived, done, planning], archived.id);
  assert.equal(overview.focus?.id, planning.id);
  assert.equal(overview.ongoing.length, 1);
  assert.equal(overview.completed, 1);
  assert.equal(overview.current.length, 2);
});
test("directory filters combine search and status without leaking archives", () => {
  const active = project("Esai"),
    planned = project("Kuis", "planning"),
    done = project("Esai selesai", "completed"),
    archived = project("Esai arsip", "archived");
  const projects = [active, planned, done, archived];
  assert.deepEqual(filterWorkspaceProjects(projects, "  ESAI ", "ongoing"), [
    active,
  ]);
  assert.deepEqual(filterWorkspaceProjects(projects, "", "ongoing"), [
    active,
    planned,
  ]);
  assert.deepEqual(filterWorkspaceProjects(projects, "esai", "completed"), [
    done,
  ]);
  assert.deepEqual(filterWorkspaceProjects(projects, "esai", "all", true), [
    archived,
  ]);
  assert.deepEqual(filterWorkspaceProjects([], "", "all"), []);
  assert.equal(workspaceOverview([]).focus, undefined);
});
