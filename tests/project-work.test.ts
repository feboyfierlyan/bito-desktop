import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultState } from "../electron/core";
import { Store } from "../electron/store";
import { projectCommand, applyProjectTool } from "../electron/projects";
import { expireProjectSessions, workCommand } from "../electron/project-work";
import {
  enqueueNotice,
  noticeIsRelevant,
  nextNotice,
} from "../electron/companion-notifications";
import {
  newProject,
  approveProjectPlan,
  projectModelContext,
  type Project,
} from "../src/projects";
import {
  dayKey,
  dayNumber,
  openProjectSession,
  planDateChanges,
  projectDashboard,
  projectWorkEntry,
  recommendProjectWork,
  sessionElapsed,
} from "../src/project-work";
import {
  declarationsForJob,
  prepareContext,
  toolNames,
} from "../supabase/functions/_shared/protocol";

const now = new Date(2026, 9, 30, 12).getTime();
function setup() {
  const s = defaultState();
  const p = newProject(
    {
      name: "Laporan praktikum",
      brief: "Bandingkan dua sensor",
      outcome: "PDF dan 5 slide",
      availability: "25 menit sore hari",
      deadline: "2026-11-06",
    },
    now,
  );
  p.draft = {
    id: randomUUID(),
    summary: "Dari data ke laporan",
    assumptions: [],
    milestones: [
      {
        id: randomUUID(),
        title: "Data",
        targetDate: "2026-10-29",
        tasks: [
          {
            id: randomUUID(),
            title: "Bandingkan data",
            details: "Catat perbedaannya",
            doneWhen: "Tabel perbandingan selesai",
            estimateMin: 30,
            estimateMax: 60,
            sourceIds: [],
            status: "todo",
          },
          {
            id: randomUUID(),
            title: "Rapikan tabel",
            details: "",
            doneWhen: "Tabel terbaca",
            estimateMin: 10,
            estimateMax: 15,
            sourceIds: [],
            status: "todo",
          },
        ],
      },
      {
        id: randomUUID(),
        title: "Presentasi",
        targetDate: "2026-11-05",
        tasks: [
          {
            id: randomUUID(),
            title: "Susun slide",
            details: "",
            doneWhen: "5 slide siap",
            estimateMin: 20,
            estimateMax: 40,
            sourceIds: [],
            status: "todo",
          },
        ],
      },
    ],
  };
  approveProjectPlan(p, p.draft.id, p.version, now);
  s.projects.push(p);
  s.activeProjectId = p.id;
  const task = p.plan!.milestones[0].tasks[0];
  const start = (minutes: number | null = 25) => {
    workCommand(
      s,
      p,
      "project-work-start",
      {
        taskId: task.id,
        objective: "Bandingkan satu spesifikasi dulu",
        minutes,
      },
      now,
    );
    return openProjectSession(p)!;
  };
  return { s, p, task, start };
}

test("dashboard and next action use actual approved progress, dates and a slice rather than skipping large work", () => {
  const { p, task } = setup();
  const d = projectDashboard(p, now);
  assert.equal(d.done, 0);
  assert.equal(d.total, 3);
  assert.equal(d.daysLeft, 7);
  assert.equal(d.overdue.length, 2);
  const next = recommendProjectWork(p, 15, now)!;
  assert.equal(next.task.id, task.id);
  assert.equal(next.slice, true);
  assert.match(next.objective, /bagian pertama/);
  task.status = "blocked";
  assert.equal(recommendProjectWork(p, 15, now)!.task.title, "Rapikan tabel");
  p.plan!.milestones[1].tasks[0].status = "doing";
  assert.equal(recommendProjectWork(p, 15, now)!.task.title, "Susun slide");
});

test("resume checkpoints are tied to the correct task and fit an editable session objective", () => {
  const { p, task } = setup();
  task.status = "doing";
  p.checkpoint = {
    taskId: randomUUID(),
    lastStop: "Di tugas lain",
    nextStep: "Jangan gunakan ini",
    blocker: "",
    updatedAt: now,
  };
  assert.doesNotMatch(recommendProjectWork(p, 25, now)!.objective, /Jangan/);
  p.checkpoint.taskId = task.id;
  p.checkpoint.nextStep = "a".repeat(1000);
  assert.equal(recommendProjectWork(p, 25, now)!.continuationNote.length, 500);
});

test("calendar day differences stay correct across months, year changes and DST-length days", () => {
  assert.equal(dayNumber("2027-01-01") - dayNumber("2026-12-31"), 1);
  assert.equal(dayNumber("2026-03-09") - dayNumber("2026-03-08"), 1);
  assert.equal(dayKey(new Date(2026, 9, 30, 0, 1).getTime()), "2026-10-30");
});

test("session pauses freeze elapsed time, resuming adds real time, and expiry asks once without marking work done", () => {
  const { s, p, task, start } = setup();
  const session = start(5);
  workCommand(
    s,
    p,
    "project-work-pause",
    { sessionId: session.id },
    now + 60000,
  );
  assert.equal(sessionElapsed(session, now + 900000), 60000);
  workCommand(
    s,
    p,
    "project-work-resume",
    { sessionId: session.id },
    now + 900000,
  );
  assert.equal(expireProjectSessions(s, now + 1139999).length, 0);
  assert.equal(expireProjectSessions(s, now + 1140000).length, 1);
  assert.equal(session.phase, "review");
  assert.equal(task.status, "doing");
  assert.equal(session.elapsedMs, 300000);
  assert.equal(expireProjectSessions(s, now + 2000000).length, 0);
  assert.equal(p.progressHistory!.at(-1)!.done, 0);
});

test("untimed work never auto-finishes and a partial report stores the real next stopping point", () => {
  const { s, p, task, start } = setup();
  const session = start(null);
  assert.equal(expireProjectSessions(s, now + 86400000).length, 0);
  workCommand(
    s,
    p,
    "project-work-finish",
    { sessionId: session.id },
    now + 600000,
  );
  workCommand(
    s,
    p,
    "project-work-report",
    {
      sessionId: session.id,
      outcome: "partial",
      note: "Dua kolom sudah terisi",
      nextStep: "Isi kolom konsumsi daya",
    },
    now + 620000,
  );
  assert.equal(task.status, "doing");
  assert.equal(session.outcome, "partial");
  assert.equal(session.elapsedMs, 600000);
  assert.equal(p.checkpoint!.taskId, task.id);
  assert.equal(
    recommendProjectWork(p, 25, now)!.continuationNote,
    "Isi kolom konsumsi daya",
  );
});

test("invalid and stale reports do not change task, session or history; explicit completion records actual progress", () => {
  const { s, p, task, start } = setup();
  const session = start();
  const before = structuredClone(p);
  assert.throws(
    () =>
      workCommand(
        s,
        p,
        "project-work-report",
        { sessionId: session.id, outcome: "blocked", note: "", nextStep: "" },
        now + 1,
      ),
    /Ceritakan/,
  );
  assert.deepEqual(p, before);
  assert.throws(
    () =>
      workCommand(
        s,
        p,
        "project-work-finish",
        { sessionId: randomUUID() },
        now + 1,
      ),
    /berubah/,
  );
  assert.deepEqual(p, before);
  workCommand(
    s,
    p,
    "project-work-report",
    {
      sessionId: session.id,
      outcome: "done",
      note: "Tabel selesai",
      nextStep: "",
    },
    now + 60000,
  );
  assert.equal(task.status, "done");
  assert.equal(openProjectSession(p), undefined);
  assert.equal(p.progressHistory!.at(-1)!.done, 1);
  assert.throws(
    () =>
      workCommand(
        s,
        p,
        "project-work-report",
        { sessionId: session.id, outcome: "done", note: "", nextStep: "" },
        now + 60001,
      ),
    /berubah/,
  );
});

test("only one session can be open in an account, and closing or changing its task is rejected", () => {
  const { s, p, task, start } = setup();
  const session = start();
  workCommand(s, p, "project-work-pause", { sessionId: session.id }, now + 1);
  const other = setup().p;
  s.projects.push(other);
  assert.throws(
    () =>
      workCommand(
        s,
        other,
        "project-work-start",
        {
          taskId: other.plan!.milestones[0].tasks[0].id,
          objective: "Buat tabel",
          minutes: 25,
        },
        now,
      ),
    /sesi terbuka/,
  );
  assert.throws(
    () => projectCommand(s, "project-status", { id: p.id, status: "archived" }),
    /laporan/,
  );
  assert.throws(
    () =>
      projectCommand(s, "project-task", {
        id: p.id,
        taskId: task.id,
        status: "done",
      }),
    /sesi/,
  );
});

test("a revised plan cannot drop an open session task and compares milestone dates without relying on regenerated IDs", () => {
  const { p, start } = setup();
  start();
  p.draft = structuredClone(p.plan)!;
  p.draft.id = randomUUID();
  p.draft.milestones[0].id = randomUUID();
  p.draft.milestones[0].targetDate = "2026-11-01";
  assert.deepEqual(planDateChanges(p)[0], {
    title: "Data",
    before: "2026-10-29",
    after: "2026-11-01",
    added: false,
  });
  p.draft.milestones[0].tasks.shift();
  assert.throws(
    () => approveProjectPlan(p, p.draft!.id, p.version, now + 1),
    /sesi/,
  );
});

test("status is a read-only visual receipt and respects active project scope", () => {
  const { s, p } = setup();
  const before = structuredClone(p);
  const call = {
    id: randomUUID(),
    name: "show_project_status" as const,
    args: { minutes: 15 },
  };
  const receipt = applyProjectTool(s, call, p.id)!;
  assert.equal(receipt.card?.kind, "project");
  assert.equal(JSON.parse(receipt.result!).nextTask.minutes, 15);
  assert.deepEqual(p, before);
  assert.throws(
    () => applyProjectTool(s, call, randomUUID()),
    /Konteks proyek/,
  );
  assert.ok(toolNames.includes("show_project_status"));
  assert.ok(
    declarationsForJob(
      prepareContext({
        profile: { name: "B", project: "", style: "chill" },
        messages: [{ role: "user", content: "Status tugasku?" }],
        memories: [],
        capabilities: { projects: true },
        projectContext: projectModelContext(s),
      }),
    ).some((t) => t.name === "show_project_status"),
  );
});

test("an explicit chat progress report closes the matching session and returns a visual status card", () => {
  const { s, p, task, start } = setup();
  const session = start();
  const r = applyProjectTool(
    s,
    {
      id: randomUUID(),
      name: "update_project_progress",
      args: {
        taskId: task.id,
        status: "blocked",
        lastStop: "Baru satu sensor",
        nextStep: "Cari data sensor kedua",
        blocker: "Datasheet sensor kedua belum ada",
      },
    },
    p.id,
  )!;
  assert.equal(r.ok, true);
  assert.equal(session.phase, "finished");
  assert.equal(session.outcome, "blocked");
  assert.equal(task.status, "blocked");
  assert.equal(p.checkpoint!.blocker, "Datasheet sensor kedua belum ada");
  assert.equal(r.card?.kind, "project");
});

test("timer notification is scoped, deduplicated, and expires when the report has been filled", () => {
  const { s, p, start } = setup();
  const session = start(5);
  expireProjectSessions(s, now + 300000);
  const input = {
    id: randomUUID(),
    type: "work-session" as const,
    sourceId: session.id,
    text: "Sampai mana tadi?",
    createdAt: now + 300000,
    projectId: p.id,
  };
  const { message } = enqueueNotice(s, input);
  assert.equal(enqueueNotice(s, { ...input, id: randomUUID() }).added, false);
  assert.equal(nextNotice(s, now + 300001)?.projectId, p.id);
  assert.equal(noticeIsRelevant(s, message, now + 300001), true);
  workCommand(
    s,
    p,
    "project-work-report",
    {
      sessionId: session.id,
      outcome: "partial",
      note: "",
      nextStep: "Tabel kedua",
    },
    now + 300002,
  );
  assert.equal(noticeIsRelevant(s, message, now + 300003), false);
});

test("persistent sessions survive restart and account databases remain separate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bito-work-"));
  let a: Store | undefined;
  let b: Store | undefined;
  try {
    const { s, p, start } = setup();
    const session = start(5);
    a = new Store(join(dir, "a.sqlite"));
    b = new Store(join(dir, "b.sqlite"));
    a.save(s);
    a.close();
    a = new Store(join(dir, "a.sqlite"));
    const loaded = a.load();
    assert.equal(loaded.projects[0].sessions![0].id, session.id);
    assert.equal(expireProjectSessions(loaded, now + 400000).length, 1);
    a.save(loaded);
    assert.equal(a.load().projects[0].sessions![0].phase, "review");
    assert.equal(b.load().projects.length, 0);
    assert.equal(p.progressHistory!.length, 1);
  } finally {
    a?.close();
    b?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("large task plans and session history fit the backend context budget without losing task IDs", () => {
  const { s, p, start } = setup();
  const session = start();
  const long = 'x"\\\n'.repeat(1000);
  p.brief = long.slice(0, 4000);
  p.outcome = long.slice(0, 1000);
  p.availability = long.slice(0, 1000);
  p.materials = Array.from({ length: 12 }, () => ({
    id: randomUUID(),
    name: long.slice(0, 200),
    content: long.repeat(2),
    createdAt: now,
  }));
  p.plan!.milestones = Array.from({ length: 4 }, () => ({
    id: randomUUID(),
    title: long.slice(0, 200),
    targetDate: null,
    tasks: Array.from({ length: 10 }, () => ({
      ...p.plan!.milestones[0].tasks[0],
      id: randomUUID(),
      title: long.slice(0, 200),
      doneWhen: long.slice(0, 500),
      sourceIds: p.materials.map((m) => m.id).slice(0, 10),
    })),
  }));
  session.taskId = p.plan!.milestones[0].tasks[0].id;
  session.taskTitle = long.slice(0, 200);
  session.objective = long.slice(0, 500);
  p.sessions = [
    ...Array.from({ length: 99 }, () => ({
      ...session,
      id: randomUUID(),
      phase: "finished" as const,
      note: long.slice(0, 1000),
      nextStep: long.slice(0, 1000),
      outcome: "partial" as const,
    })),
    session,
  ];
  p.draft = structuredClone(p.plan)!;
  p.draft.id = randomUUID();
  const context = projectModelContext(s);
  assert.ok(context.length <= 36000, String(context.length));
  const decoded = JSON.parse(context);
  assert.equal(decoded.work.current.id, session.id);
  assert.equal(decoded.work.recent.length, 3);
  assert.deepEqual(
    decoded.plan.milestones.flatMap((m: any) => m.tasks.map((t: any) => t.id)),
    p.plan!.milestones.flatMap((m) => m.tasks.map((t) => t.id)),
  );
});

test("board and chat entry prefer the last unfinished task and never reuse another task's stopping point", () => {
  const { p, task } = setup();
  const other = p.plan!.milestones[1].tasks[0];
  task.status = "doing";
  other.status = "doing";
  p.checkpoint = {
    taskId: other.id,
    lastStop: "Slide pertama selesai",
    nextStep: "Isi slide kedua",
    blocker: "",
    updatedAt: now,
  };
  const entry = projectWorkEntry(p)!;
  assert.equal(entry.task.id, other.id);
  assert.equal(entry.objective, "Isi slide kedua");
  assert.equal(entry.payload.intent, "continue");
  assert.equal(entry.payload.minutes, null);
  assert.match(entry.estimateLabel, /20–40 menit/);
  assert.equal(projectWorkEntry(p, task.id)?.checkpoint, null);
  assert.equal(projectWorkEntry(p, task.id)?.objective, task.title);
  other.status = "done";
  assert.equal(projectWorkEntry(p, other.id), undefined);
  assert.equal(projectWorkEntry(p)?.task.id, task.id);
});
