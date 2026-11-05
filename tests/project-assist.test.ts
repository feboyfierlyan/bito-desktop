import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { defaultState } from "../electron/core";
import { projectCommand } from "../electron/projects";
import { prepareProjectAssistance } from "../electron/project-assist";
import { approveProjectPlan, newProject } from "../src/projects";
import { openProjectSession } from "../src/project-work";
import { workCommand } from "../electron/project-work";

function setup() {
  const state = defaultState();
  const project = newProject({
    name: "Laporan sensor",
    brief: "Bandingkan dua sensor",
    outcome: "PDF",
    deadline: "2026-12-20",
    availability: "Sore",
  });
  project.draft = {
    id: randomUUID(),
    summary: "Susun laporan",
    assumptions: [],
    milestones: ["Data", "Laporan"].map((title, i) => ({
      id: randomUUID(),
      title,
      targetDate: i ? "2026-12-15" : "2026-12-10",
      tasks: [
        {
          id: randomUUID(),
          title: i ? "Susun PDF" : "Bandingkan data",
          details: "Bandingkan tabel dari hasil praktikum",
          doneWhen: "Ada tabel perbandingan",
          estimateMin: 20,
          estimateMax: 30,
          sourceIds: [],
          status: "todo" as const,
        },
      ],
    })),
  };
  approveProjectPlan(project, project.draft.id, project.version);
  state.projects.push(project);
  const task = project.plan!.milestones[0].tasks[0];
  const request = {
    id: project.id,
    taskId: task.id,
    intent: "start",
    begin: true,
    objective: "Isi satu baris tabel",
    minutes: 25,
  };
  const schedule = {
    id: project.id,
    planId: project.plan!.id,
    version: project.version,
    milestoneId: project.plan!.milestones[0].id,
    targetDate: "2026-12-11",
  };
  return { state, project, task, request, schedule };
}

test("continue from a paused session preserves its identity, objective and elapsed time", () => {
  const { state, project, task, request } = setup();
  prepareProjectAssistance(state, request);
  const session = openProjectSession(project)!;
  workCommand(state, project, "project-work-pause", { sessionId: session.id });
  session.elapsedMs = 120000;
  prepareProjectAssistance(state, {
    id: project.id,
    taskId: task.id,
    intent: "continue",
    resume: true,
  });
  const resumed = openProjectSession(project)!;
  assert.equal(resumed.id, session.id);
  assert.equal(resumed.phase, "running");
  assert.equal(resumed.elapsedMs, 120000);
  assert.equal(resumed.objective, request.objective);
  assert.equal(project.sessions?.length, 1);
});

test("resume rejects another task, finished sessions, and simultaneous begin without mutation", () => {
  const { state, project, task, request } = setup();
  prepareProjectAssistance(state, request);
  const session = openProjectSession(project)!;
  workCommand(state, project, "project-work-pause", { sessionId: session.id });
  for (const input of [
    { taskId: project.plan!.milestones[1].tasks[0].id },
    { taskId: task.id, begin: true },
  ]) {
    const before = structuredClone(state);
    assert.throws(
      () =>
        prepareProjectAssistance(state, {
          id: project.id,
          intent: "continue",
          resume: true,
          ...input,
        }),
      /sesi yang sedang dijeda/,
    );
    assert.deepEqual(state, before);
  }
  workCommand(state, project, "project-work-finish", { sessionId: session.id });
  const before = structuredClone(state);
  assert.throws(
    () =>
      prepareProjectAssistance(state, {
        id: project.id,
        taskId: task.id,
        intent: "continue",
        resume: true,
      }),
    /sesi yang sedang dijeda/,
  );
  assert.deepEqual(state, before);
});

test("starting together selects the project and opens exactly the chosen task with a plain visible message", () => {
  const { state, project, task, request } = setup();
  const result = prepareProjectAssistance(state, request);
  assert.equal(state.activeProjectId, project.id);
  assert.equal(openProjectSession(project)?.taskId, task.id);
  assert.equal(openProjectSession(project)?.objective, request.objective);
  assert.equal(task.status, "doing");
  assert.match(result.text, /bantu aku mulai “Bandingkan data”/);
  assert.ok(!result.text.includes(task.id));
  assert.ok(result.context.includes(task.id));
  assert.ok(result.context.includes(task.doneWhen));
});

test("context help does not start a timer and never borrows another task's checkpoint", () => {
  const { state, project, task, request } = setup();
  project.checkpoint = {
    taskId: project.plan!.milestones[1].tasks[0].id,
    lastStop: "RAHASIA LANGKAH LAIN",
    nextStep: "salah konteks",
    blocker: "salah hambatan",
    updatedAt: Date.now(),
  };
  const result = prepareProjectAssistance(state, {
    ...request,
    begin: false,
    intent: "continue",
  });
  assert.equal(openProjectSession(project), undefined);
  assert.equal(task.status, "todo");
  assert.ok(!result.context.includes("RAHASIA"));
  assert.match(result.text, /bantu aku lanjut/);
  project.checkpoint.taskId = task.id;
  const blocked = prepareProjectAssistance(state, {
    ...request,
    begin: false,
    intent: "blocked",
    note: "Belum paham tabelnya",
  });
  assert.match(blocked.context, /Belum paham tabelnya/);
  assert.match(blocked.context, /salah hambatan/);
  assert.match(blocked.text, /aku mentok/);
});

test("invalid task, finished task and conflicting session leave state untouched", () => {
  for (const kind of ["missing", "done", "session"]) {
    const { state, project, task, request } = setup();
    if (kind === "done") task.status = "done";
    if (kind === "session") prepareProjectAssistance(state, request);
    const before = structuredClone(state);
    assert.throws(() =>
      prepareProjectAssistance(state, {
        ...request,
        taskId: kind === "missing" ? randomUUID() : task.id,
      }),
    );
    assert.deepEqual(state, before);
    assert.equal(state.projects[0].id, project.id);
  }
});

test("schedule edits preserve progress and running work while changing only the selected target", () => {
  const { state, project, request, schedule } = setup();
  prepareProjectAssistance(state, request);
  const sessions = structuredClone(project.sessions);
  const history = structuredClone(project.progressHistory);
  const version = project.version;
  projectCommand(state, "project-schedule", { ...schedule, version });
  assert.equal(project.plan!.milestones[0].targetDate, schedule.targetDate);
  assert.equal(project.plan!.milestones[1].targetDate, "2026-12-15");
  assert.equal(project.version, version + 1);
  assert.deepEqual(project.sessions, sessions);
  assert.deepEqual(project.progressHistory, history);
});

test("stale plans, reversed dates and deadlines before a pending draft are rejected atomically", () => {
  for (const kind of [
    "version",
    "plan",
    "milestone",
    "order",
    "deadline",
    "draft",
  ]) {
    const { state, project, schedule } = setup();
    const edit = { ...schedule };
    if (kind === "version") edit.version--;
    if (kind === "plan") edit.planId = randomUUID();
    if (kind === "milestone") edit.milestoneId = randomUUID();
    if (kind === "order") edit.targetDate = "2026-12-16";
    if (kind === "deadline") edit.targetDate = "2026-12-21";
    if (kind === "draft") {
      project.draft = structuredClone(project.plan!);
      project.draft.id = randomUUID();
      project.draft.milestones[1].targetDate = "2026-12-19";
    }
    const before = structuredClone(state);
    assert.throws(() =>
      projectCommand(
        state,
        "project-schedule",
        kind === "draft"
          ? { ...edit, milestoneId: null, targetDate: "2026-12-17" }
          : edit,
      ),
    );
    assert.deepEqual(state, before, kind);
  }
});

test("completion can be undone but cannot silently overwrite a newer status or an active session", () => {
  const { state, project, task, request } = setup();
  projectCommand(state, "project-task", {
    id: project.id,
    taskId: task.id,
    status: "done",
    expectedStatus: "todo",
  });
  projectCommand(state, "project-task", {
    id: project.id,
    taskId: task.id,
    status: "todo",
    expectedStatus: "done",
  });
  assert.equal(task.status, "todo");
  projectCommand(state, "project-task", {
    id: project.id,
    taskId: task.id,
    status: "doing",
  });
  let before = structuredClone(state);
  assert.throws(
    () =>
      projectCommand(state, "project-task", {
        id: project.id,
        taskId: task.id,
        status: "todo",
        expectedStatus: "done",
      }),
    /sudah berubah/,
  );
  assert.deepEqual(state, before);
  prepareProjectAssistance(state, request);
  before = structuredClone(state);
  assert.throws(
    () =>
      projectCommand(state, "project-task", {
        id: project.id,
        taskId: task.id,
        status: "done",
        expectedStatus: "doing",
      }),
    /sesi/,
  );
  assert.deepEqual(state, before);
});

test("start without a custom objective uses the saved next step and selected source material", () => {
  const { state, project, task } = setup();
  task.status = "doing";
  project.checkpoint = {
    taskId: task.id,
    lastStop: "Tiga baris sudah diisi",
    nextStep: "Tambahkan contoh pada baris keempat",
    blocker: "",
    updatedAt: 100,
  };
  const materialId = randomUUID();
  project.materials.push({
    id: materialId,
    name: "Rubrik sensor",
    kind: "text",
    content: "Bandingkan akurasi dan konsumsi daya.",
    createdAt: 100,
  } as (typeof project.materials)[number]);
  task.sourceIds = [materialId, randomUUID()];
  const result = prepareProjectAssistance(state, {
    id: project.id,
    taskId: task.id,
    intent: "start",
    begin: true,
  });
  assert.match(result.text, /bantu aku lanjut/);
  assert.match(
    result.context,
    /Target sekarang: Tambahkan contoh pada baris keempat/,
  );
  assert.match(result.context, /Rubrik sensor/);
  assert.match(result.context, /Bandingkan akurasi dan konsumsi daya/);
  assert.match(result.context, /belum tersedia/);
  assert.equal(
    openProjectSession(project)?.objective,
    project.checkpoint.nextStep,
  );
  assert.equal(openProjectSession(project)?.minutes, null);
});

test("paused checkpoint updates are saved without finishing or duplicating the session", () => {
  const { state, project, task, request } = setup();
  prepareProjectAssistance(state, request);
  const session = openProjectSession(project)!;
  workCommand(
    state,
    project,
    "project-work-pause",
    { sessionId: session.id },
    2000,
  );
  const elapsed = session.elapsedMs;
  projectCommand(state, "project-work-checkpoint", {
    id: project.id,
    sessionId: session.id,
    note: "Dua baris beres",
    nextStep: "Bandingkan konsumsi daya",
    expectedCheckpointAt: null,
  });
  assert.equal(session.phase, "paused");
  assert.equal(session.elapsedMs, elapsed);
  assert.equal(task.status, "doing");
  assert.equal(project.sessions?.length, 1);
  assert.equal(project.checkpoint?.lastStop, "Dua baris beres");
  const before = structuredClone(state);
  assert.throws(
    () =>
      projectCommand(state, "project-work-checkpoint", {
        id: project.id,
        sessionId: session.id,
        note: "Catatan lama",
        nextStep: "",
        expectedCheckpointAt: null,
      }),
    /sudah berubah/,
  );
  assert.deepEqual(state, before);
  const result = prepareProjectAssistance(state, {
    id: project.id,
    taskId: task.id,
    intent: "continue",
    resume: true,
  });
  assert.match(result.context, /Target sekarang: Bandingkan konsumsi daya/);
  assert.equal(openProjectSession(project)?.id, session.id);
  assert.equal(session.phase, "running");
  assert.equal(session.elapsedMs, elapsed);
});

test("checkpoint edit rejects a running or finished task without mutation", () => {
  const { state, project, request } = setup();
  prepareProjectAssistance(state, request);
  const session = openProjectSession(project)!;
  const before = structuredClone(state);
  assert.throws(() =>
    projectCommand(state, "project-work-checkpoint", {
      id: project.id,
      sessionId: session.id,
      note: "x",
      nextStep: "y",
      expectedCheckpointAt: null,
    }),
  );
  assert.deepEqual(state, before);
});

test("repeated pause edits use a monotonic revision and finished partial work can restart at its checkpoint", () => {
  const { state, project, task, request } = setup();
  prepareProjectAssistance(state, request);
  const session = openProjectSession(project)!;
  workCommand(
    state,
    project,
    "project-work-pause",
    { sessionId: session.id },
    3000,
  );
  const first = workCommand(
    state,
    project,
    "project-work-checkpoint",
    {
      sessionId: session.id,
      note: "Baris satu beres",
      nextStep: "Baris dua",
      expectedCheckpointAt: null,
    },
    4000,
  );
  const stamp = (first.value as { updatedAt: number }).updatedAt;
  const second = workCommand(
    state,
    project,
    "project-work-checkpoint",
    {
      sessionId: session.id,
      note: "Dua baris beres",
      nextStep: "Baris tiga",
      expectedCheckpointAt: stamp,
    },
    4000,
  );
  assert.equal((second.value as { updatedAt: number }).updatedAt, stamp + 1);
  workCommand(
    state,
    project,
    "project-work-finish",
    { sessionId: session.id },
    5000,
  );
  workCommand(
    state,
    project,
    "project-work-report",
    {
      sessionId: session.id,
      outcome: "partial",
      note: "Dua baris beres",
      nextStep: "Baris tiga",
    },
    6000,
  );
  assert.equal(openProjectSession(project), undefined);
  assert.equal(task.status, "doing");
  const result = prepareProjectAssistance(state, {
    id: project.id,
    taskId: task.id,
    intent: "start",
    begin: true,
  });
  assert.match(result.text, /bantu aku lanjut/);
  assert.match(result.context, /Terakhir: Dua baris beres/);
  assert.match(result.context, /Target sekarang: Baris tiga/);
  assert.notEqual(openProjectSession(project)?.id, session.id);
  assert.equal(openProjectSession(project)?.objective, "Baris tiga");
  assert.equal(project.sessions?.length, 2);
  assert.equal(session.phase, "finished");
});
