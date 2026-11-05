import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultState, settingsSchema } from "../electron/core";
import { Store } from "../electron/store";
import { newProject } from "../src/projects";
import { openProjectSession } from "../src/project-work";
import {
  engageProjectCompanion,
  inCompanionHours,
  nextProjectOffer,
  rememberProjectOffer,
  projectCoachRelevant,
  previewProjectOffer,
} from "../src/project-companion";
import { projectCoachAction } from "../electron/project-companion";
import {
  enqueueNotice,
  nextNotice,
  settleNotices,
} from "../electron/companion-notifications";

const now = new Date(2026, 9, 31, 12).getTime();
const minute = 60000;
function setup() {
  const s = defaultState();
  s.onboarded = true;
  const p = newProject(
    {
      name: "Laporan sensor",
      brief: "Bandingkan data",
      outcome: "PDF",
      deadline: "2026-11-08",
      availability: "sore",
    },
    now - 30 * minute,
  );
  p.status = "active";
  p.plan = {
    id: randomUUID(),
    summary: "Bandingkan hasil",
    assumptions: [],
    milestones: [
      {
        id: randomUUID(),
        title: "Draf",
        targetDate: "2026-11-05",
        tasks: [
          {
            id: randomUUID(),
            title: "Susun tabel",
            details: "Bandingkan dua sensor",
            doneWhen: "Tabel terisi",
            estimateMin: 20,
            estimateMax: 45,
            status: "todo",
            sourceIds: [],
          },
        ],
      },
    ],
  };
  s.projects = [p];
  s.activeProjectId = p.id;
  return { s, p, task: p.plan.milestones[0].tasks[0] };
}
function queued() {
  const data = setup();
  const offer = nextProjectOffer(data.s, now, now - minute)!;
  const message = enqueueNotice(data.s, {
    id: randomUUID(),
    type: "project-coach",
    sourceId: offer.key,
    text: offer.text,
    projectId: offer.projectId,
    coach: offer.coach,
    createdAt: now,
  }).message;
  rememberProjectOffer(data.s, offer, now);
  return { ...data, offer, message };
}

test("offers a specific next step without a user message or model request", () => {
  const { s, p, task } = setup();
  const offer = nextProjectOffer(s, now, now - minute)!;
  assert.equal(s.messages.length, 0);
  assert.equal(offer.projectId, p.id);
  assert.equal(offer.coach.taskId, task.id);
  assert.equal(offer.coach.reason, "start");
  assert.match(offer.text, /Laporan sensor.*Susun tabel/);
  assert.equal(s.projects[0].plan!.milestones[0].tasks[0].status, "todo");
});

test("startup, recent conversation, and recent plan edits receive breathing room", () => {
  const { s, p } = setup();
  assert.equal(nextProjectOffer(s, now, now - 44000), null);
  engageProjectCompanion(s, now - minute);
  assert.equal(nextProjectOffer(s, now, now - minute), null);
  engageProjectCompanion(s, now - 3 * minute);
  p.updatedAt = now - minute;
  assert.equal(nextProjectOffer(s, now, now - minute), null);
});

test("respects quiet, DND, sleeping, feature preference, quiet hours, and snooze", () => {
  for (const mutate of [
    (s: ReturnType<typeof defaultState>) => {
      s.profile.proactive = "quiet";
    },
    (s: ReturnType<typeof defaultState>) => {
      s.settings.dnd = true;
    },
    (s: ReturnType<typeof defaultState>) => {
      s.sleeping = true;
    },
    (s: ReturnType<typeof defaultState>) => {
      s.settings.projectNudges = false;
    },
    (s: ReturnType<typeof defaultState>) => {
      s.settings.nudgeStartHour = 13;
    },
    (s: ReturnType<typeof defaultState>) => {
      s.projectCompanion = {
        snoozedUntil: now + minute,
        lastEngagedAt: 0,
        offers: [],
      };
    },
    (s: ReturnType<typeof defaultState>) => {
      s.onboarded = false;
    },
  ]) {
    const { s } = setup();
    mutate(s);
    assert.equal(nextProjectOffer(s, now, now - minute), null);
  }
});

test("handles overnight active hours and exact boundaries", () => {
  const at = (hour: number) => new Date(2026, 9, 31, hour).getTime();
  assert.equal(inCompanionHours(at(9), 9, 21), true);
  assert.equal(inCompanionHours(at(21), 9, 21), false);
  assert.equal(inCompanionHours(at(23), 21, 8), true);
  assert.equal(inCompanionHours(at(7), 21, 8), true);
  assert.equal(inCompanionHours(at(8), 21, 8), false);
  assert.equal(inCompanionHours(at(12), 9, 9), false);
});

test("does not interrupt focus or any open work session, including another project", () => {
  const { s, p, task } = setup();
  s.focus.running = true;
  assert.equal(nextProjectOffer(s, now, now - minute), null);
  s.focus.running = false;
  p.sessions = [
    {
      id: randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      objective: "Isi data",
      minutes: 15,
      phase: "paused",
      startedAt: now - minute,
      resumedAt: null,
      elapsedMs: minute,
      endedAt: null,
    },
  ];
  assert.equal(nextProjectOffer(s, now, now - minute), null);
  assert.equal(openProjectSession(p)?.phase, "paused");
});

test("only uses a real checkpoint and flags a real blocker", () => {
  const { s, p, task } = setup();
  task.status = "doing";
  p.checkpoint = {
    taskId: task.id,
    lastStop: "Kolom pertama terisi",
    nextStep: "Isi kolom sensor B",
    blocker: "",
    updatedAt: now - 20 * minute,
  };
  const resume = nextProjectOffer(s, now, now - minute)!;
  assert.equal(resume.coach.reason, "resume");
  assert.match(resume.text, /Isi kolom sensor B/);
  task.status = "blocked";
  p.checkpoint.blocker = "Data sensor B belum tersedia";
  assert.equal(nextProjectOffer(s, now, now - minute)!.coach.reason, "blocked");
  p.checkpoint.taskId = randomUUID();
  assert.equal(nextProjectOffer(s, now, now - minute), null);
});

test("deadline reminders are contextual and never silently reschedule the plan", () => {
  const { s, p } = setup();
  p.deadline = "2026-11-01";
  const before = structuredClone(p.plan);
  const offer = nextProjectOffer(s, now, now - minute)!;
  assert.equal(offer.coach.reason, "deadline");
  assert.match(offer.text, /Susun tabel.*10 menit/);
  assert.deepEqual(p.plan, before);
});

test("progress praise requires an explicit done report, not an expired timer", () => {
  const { s, p, task } = setup();
  p.sessions = [
    {
      id: randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      objective: "Isi data",
      minutes: 15,
      phase: "review",
      startedAt: now - 30 * minute,
      resumedAt: null,
      elapsedMs: 15 * minute,
      endedAt: now - 15 * minute,
    },
  ];
  assert.equal(nextProjectOffer(s, now, now - minute), null);
  p.sessions[0].phase = "finished";
  p.sessions[0].outcome = "done";
  task.status = "done";
  const offer = nextProjectOffer(s, now, now - minute)!;
  assert.equal(offer.coach.reason, "progress");
  assert.match(offer.text, /1\/1 langkah/);
});

test("old, archived, changed, or completed recommendations are not actionable", () => {
  for (const mutate of [
    ({ p }: ReturnType<typeof queued>) => {
      p.status = "archived";
    },
    ({ p }: ReturnType<typeof queued>) => {
      p.version++;
    },
    ({ task }: ReturnType<typeof queued>) => {
      task.status = "done";
    },
    ({ s }: ReturnType<typeof queued>) => {
      s.settings.projectNudges = false;
    },
    ({ s }: ReturnType<typeof queued>) => {
      s.projects = [];
    },
  ]) {
    const data = queued();
    mutate(data);
    assert.equal(projectCoachRelevant(data.s, data.message, now), false);
    const before = JSON.stringify(data.s);
    assert.throws(
      () =>
        projectCoachAction(
          data.s,
          { messageId: data.message.id, action: "start" },
          now,
        ),
      /sudah berubah/,
    );
    assert.equal(JSON.stringify(data.s), before);
  }
  const { s, message } = queued();
  assert.equal(projectCoachRelevant(s, message, now + 11 * minute), false);
});

test("start action targets the offered task and is safe against double clicks", () => {
  const { s, p, task, message } = queued();
  const result = projectCoachAction(
    s,
    { messageId: message.id, action: "start" },
    now,
  );
  assert.equal(result.projectId, p.id);
  assert.equal(openProjectSession(p)?.taskId, task.id);
  assert.equal(openProjectSession(p)?.minutes, 10);
  assert.equal(task.status, "doing");
  assert.throws(() =>
    projectCoachAction(s, { messageId: message.id, action: "start" }, now),
  );
  assert.equal(p.sessions!.length, 1);
});

test("later snoozes all coaching, leaves work untouched, and respects explicit project deferral", () => {
  const { s, p, task, message } = queued();
  projectCoachAction(s, { messageId: message.id, action: "later" }, now);
  assert.equal(s.projectCompanion!.snoozedUntil, now + 60 * minute);
  assert.equal(task.status, "todo");
  assert.equal(nextProjectOffer(s, now + 30 * minute, now), null);
  const fresh = setup();
  fresh.p.suggestionDeferredUntil = now + 60 * minute;
  assert.equal(nextProjectOffer(fresh.s, now, now - minute), null);
  assert.equal(p.sessions?.length || 0, 0);
});

test("open action selects the right project without starting a timer", () => {
  const { s, p, message } = queued();
  s.activeProjectId = null;
  projectCoachAction(s, { messageId: message.id, action: "open" }, now);
  assert.equal(s.activeProjectId, p.id);
  assert.equal(openProjectSession(p), undefined);
});

test("reminders retain priority; chat consumes notices once without duplicating history", () => {
  const { s, p, message } = queued();
  s.reminders.push({
    id: randomUUID(),
    title: "Kumpulkan",
    due: now,
    done: false,
    notified: false,
  });
  const r = s.reminders[0];
  const reminder = enqueueNotice(s, {
    id: randomUUID(),
    type: "reminder",
    sourceId: `${r.id}:${r.due}`,
    text: r.title,
    createdAt: now,
  }).message;
  assert.equal(nextNotice(s, now)?.id, reminder.id);
  s.activeProjectId = p.id;
  settleNotices(s, now, true);
  assert.equal(message.notification!.handledAt, now);
  assert.equal(
    s.messages.filter((m) => m.notification?.type === "project-coach").length,
    1,
  );
});

test("limits frequency durably; restart and long chat history cannot reset the budget", async () => {
  const { s, p, offer } = queued();
  s.messages = [];
  // A different reason still waits for the two-hour minimum interval.
  p.deadline = "2026-11-01";
  assert.equal(nextProjectOffer(s, now + 30 * minute, now), null);
  assert.ok(nextProjectOffer(s, now + 121 * minute, now));
  const dir = await mkdtemp(join(tmpdir(), "bito-coach-"));
  try {
    const store = new Store(join(dir, "test.sqlite"));
    store.save(s);
    store.close();
    const reopened = new Store(join(dir, "test.sqlite"));
    const restored = reopened.load();
    reopened.close();
    assert.deepEqual(restored.projectCompanion?.offers, [
      { key: offer.key, at: now },
    ]);
    assert.equal(nextProjectOffer(restored, now + minute, now - minute), null);
    restored.projectCompanion!.offers.push({
      key: "another",
      at: now + 2 * 60 * minute,
    });
    assert.equal(nextProjectOffer(restored, now + 5 * 60 * minute, now), null);
    restored.settings.nudgeCadence = "balanced";
    assert.ok(nextProjectOffer(restored, now + 5 * 60 * minute, now));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("another day's offer is available without replaying yesterday's pending bubble", () => {
  const { s, message } = queued();
  const tomorrow = now + 86400000;
  assert.equal(projectCoachRelevant(s, message, tomorrow), false);
  settleNotices(s, tomorrow, false);
  assert.ok(nextProjectOffer(s, tomorrow, tomorrow - minute));
});

test("legacy preferences receive defaults; invalid cadence and hours are rejected", () => {
  const {
    projectNudges,
    nudgeCadence,
    nudgeStartHour,
    nudgeEndHour,
    ...legacy
  } = defaultState().settings;
  const restored = settingsSchema.parse(legacy);
  assert.equal(restored.projectNudges, true);
  assert.equal(restored.nudgeCadence, "gentle");
  assert.equal(restored.nudgeStartHour, 9);
  assert.equal(restored.nudgeEndHour, 21);
  assert.throws(() =>
    settingsSchema.parse({ ...restored, nudgeStartHour: 24 }),
  );
  assert.throws(() =>
    settingsSchema.parse({ ...restored, nudgeCadence: "spam" }),
  );
});

test("explicit revision preview bypasses waiting without changing work or the daily budget", () => {
  const { s, task } = setup();
  engageProjectCompanion(s, now);
  assert.equal(nextProjectOffer(s, now, now), null);
  assert.equal(previewProjectOffer(s, now)?.coach.taskId, task.id);
  assert.equal(s.projectCompanion!.offers.length, 0);
  assert.equal(task.status, "todo");
  s.settings.dnd = true;
  assert.equal(previewProjectOffer(s, now), null);
});
