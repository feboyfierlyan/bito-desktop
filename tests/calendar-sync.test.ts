import { test } from "node:test";
import assert from "node:assert/strict";
import { CalendarSync } from "../electron/calendar-sync";
import {
  automaticCalendarEntries,
  calendarEvent,
  type CalendarConnection,
  type CalendarEntry,
  type CalendarResult,
} from "../src/calendar";
import { approveProjectPlan, newProject } from "../src/projects";

const MID = "9dfeb49c-6ccf-44d4-b38f-455707080101";
function project(approved = true) {
  const p = newProject({
    name: "Laporan",
    brief: "Tugas",
    deadline: "2028-03-02",
    outcome: "PDF",
    availability: "Sore",
  });
  p.draft = {
    id: crypto.randomUUID(),
    summary: "Laporan",
    assumptions: [],
    milestones: [
      {
        id: MID,
        title: "Data",
        targetDate: "2028-02-29",
        tasks: [
          {
            id: crypto.randomUUID(),
            title: "Bandingkan data",
            details: "",
            doneWhen: "Beres",
            estimateMin: 10,
            estimateMax: 20,
            sourceIds: [],
            status: "todo",
          },
        ],
      },
    ],
  };
  if (approved) approveProjectPlan(p, p.draft.id, p.version);
  return p;
}
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (k: string) => values.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: async (k: string) => {
      values.delete(k);
    },
  };
}
function driver() {
  const sent: { project: string; entry: CalendarEntry }[] = [],
    removed: string[] = [];
  return {
    view: { configured: true, status: "connected" } as CalendarConnection,
    sent,
    removed,
    async send(
      id: string,
      entries: CalendarEntry[],
      current: () => boolean,
    ): Promise<CalendarResult[]> {
      assert.ok(current());
      sent.push(
        ...entries.map((entry) => ({
          project: id,
          entry: structuredClone(entry),
        })),
      );
      return entries.map((e) => ({ id: e.id, ok: true }));
    },
    async remove(id: string, entryId: string, current: () => boolean) {
      assert.ok(current());
      removed.push(`${id}/${entryId}`);
    },
  };
}
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
};

test("auto Calendar publishes approved targets and deadline as all-day, retains finished targets", () => {
  const p = project(false);
  assert.deepEqual(automaticCalendarEntries(p), []);
  approveProjectPlan(p, p.draft!.id, p.version);
  p.draft = { ...structuredClone(p.plan!), id: "replacement" };
  p.draft.milestones[0].title = "Unapproved title";
  p.plan!.milestones[0].tasks[0].status = "done";
  const entries = automaticCalendarEntries(p);
  assert.equal(entries.length, 2);
  assert.match(entries[0].title, /^✓ Laporan · Data$/);
  assert.deepEqual(calendarEvent(entries[0]).end, { date: "2028-03-01" });
  p.status = "completed";
  assert.match(automaticCalendarEntries(p)[1].title, /^✓/);
});

test("auto Calendar opt-in, deduplication and UI/chat-style mutations use the same event identity", async () => {
  const p = project(),
    d = driver(),
    saved = storage();
  const sync = new CalendarSync(
    d,
    saved,
    () => [p],
    () => true,
    600000,
  );
  try {
    await sync.setOwner("a");
    await sync.flush();
    assert.equal(d.sent.length, 0);
    await sync.setAutomatic(true);
    await sync.flush();
    assert.equal(d.sent.length, 2);
    await sync.flush();
    assert.equal(d.sent.length, 2);
    p.plan!.milestones[0].targetDate = "2028-03-01";
    p.version++;
    sync.request();
    await sync.flush();
    assert.equal(d.sent.length, 3);
    assert.equal(d.sent[2].entry.id, MID);
    assert.equal(d.sent[2].entry.date, "2028-03-01");
    p.plan!.milestones[0].tasks[0].status = "done";
    sync.request();
    await sync.flush();
    assert.match(d.sent[3].entry.title, /^✓/);
    p.version++;
    sync.request();
    await sync.flush();
    assert.equal(d.sent.length, 4);
    // Undo completion updates that same event. It must not create another target.
    p.plan!.milestones[0].tasks[0].status = "todo";
    sync.request();
    await sync.flush();
    assert.equal(d.sent.length, 5);
    assert.equal(d.sent[4].entry.id, MID);
    assert.doesNotMatch(d.sent[4].entry.title, /^✓/);
    assert.equal(d.removed.length, 0);
    sync.request();
    await sync.flush();
    assert.equal(d.sent.length, 5);
    assert.equal(sync.view.syncStatus, "synced");
  } finally {
    sync.close();
  }
});

test("auto Calendar deletion and re-add survive restart without reusing Google's deleted IDs", async () => {
  const p = project(),
    d = driver(),
    saved = storage();
  let sync = new CalendarSync(
    d,
    saved,
    () => [p],
    () => true,
    600000,
  );
  try {
    await sync.setOwner("a");
    await sync.setAutomatic(true);
    await sync.flush();
    p.plan!.milestones[0].targetDate = null;
    sync.request();
    await sync.flush();
    assert.deepEqual(d.removed, [`${p.id}/${MID}`]);
    sync.close();
    sync = new CalendarSync(
      d,
      saved,
      () => [p],
      () => true,
      600000,
    );
    await sync.setOwner("a");
    assert.equal(sync.view.automatic, true);
    p.plan!.milestones[0].targetDate = "2028-03-01";
    sync.request();
    await sync.flush();
    assert.equal(d.sent.at(-1)!.entry.id, `${MID}:sync:1`);
    p.deadline = null;
    sync.request();
    await sync.flush();
    assert.equal(d.removed.at(-1), `${p.id}/deadline`);
  } finally {
    sync.close();
  }
});

test("auto Calendar archived tasks freeze events; deleting a task removes only ledger-owned events", async () => {
  const p = project(),
    d = driver(),
    saved = storage();
  let projects = [p];
  const sync = new CalendarSync(
    d,
    saved,
    () => projects,
    () => true,
    600000,
  );
  try {
    await sync.setOwner("a");
    await sync.setAutomatic(true);
    await sync.flush();
    p.status = "archived";
    p.name = "Renamed";
    sync.request();
    await sync.flush();
    assert.equal(d.sent.length, 2);
    assert.equal(d.removed.length, 0);
    p.status = "active";
    sync.request();
    await sync.flush();
    assert.equal(d.sent.length, 4);
    projects = [];
    sync.request();
    await sync.flush();
    assert.deepEqual(
      d.removed.sort(),
      [`${p.id}/${MID}`, `${p.id}/deadline`].sort(),
    );
  } finally {
    sync.close();
  }
});

test("auto Calendar lost network response retries same durable identity", async () => {
  const p = project(),
    d = driver(),
    saved = storage(),
    normal = d.send.bind(d);
  let fail = true;
  d.send = async (...args) => {
    const results = await normal(...args);
    if (fail) {
      fail = false;
      throw Error("lost response");
    }
    return results;
  };
  const sync = new CalendarSync(
    d,
    saved,
    () => [p],
    () => true,
    600000,
  );
  try {
    await sync.setOwner("a");
    await sync.setAutomatic(true);
    await sync.flush();
    assert.equal(sync.view.syncStatus, "error");
    assert.ok(
      saved.values.get("calendar-sync:a")!.includes('"fingerprint":null'),
    );
    await sync.flush();
    assert.equal(d.sent[0].entry.id, d.sent[1].entry.id);
    assert.equal(sync.view.syncStatus, "synced");
  } finally {
    sync.close();
  }
});

test("auto Calendar change while sending schedules the newest version, not a stale success", async () => {
  const p = project(),
    d = driver(),
    saved = storage(),
    started = gate(),
    finish = gate(),
    normal = d.send.bind(d);
  let first = true;
  d.send = async (...args) => {
    const result = await normal(...args);
    if (first) {
      first = false;
      started.release();
      await finish.promise;
    }
    return result;
  };
  const sync = new CalendarSync(
    d,
    saved,
    () => [p],
    () => true,
    600000,
  );
  try {
    await sync.setOwner("a");
    await sync.setAutomatic(true);
    const flushing = sync.flush();
    await started.promise;
    p.plan!.milestones[0].targetDate = "2028-03-01";
    sync.request();
    finish.release();
    await flushing;
    assert.equal(sync.view.syncStatus, "pending");
    await sync.flush();
    assert.equal(d.sent.at(-1)!.entry.date, "2028-03-01");
    assert.equal(d.sent.at(-1)!.entry.id, MID);
  } finally {
    finish.release();
    sync.close();
  }
});

test("auto Calendar opt-out preserves events and stops the next in-flight write", async () => {
  const p = project(),
    d = driver(),
    saved = storage(),
    started = gate(),
    finish = gate(),
    normal = d.send.bind(d);
  d.send = async (...args) => {
    const result = await normal(...args);
    started.release();
    await finish.promise;
    return result;
  };
  const sync = new CalendarSync(
    d,
    saved,
    () => [p],
    () => true,
    600000,
  );
  try {
    await sync.setOwner("a");
    await sync.setAutomatic(true);
    const flushing = sync.flush();
    await started.promise;
    await sync.setAutomatic(false);
    finish.release();
    await flushing;
    await sync.flush();
    assert.equal(d.sent.length, 1);
    assert.equal(d.removed.length, 0);
    assert.equal(sync.view.automatic, false);
    assert.equal(sync.view.syncStatus, "idle");
  } finally {
    finish.release();
    sync.close();
  }
});

test("auto Calendar account switch drains old request and isolates ownership ledger", async () => {
  const p = project(),
    d = driver(),
    saved = storage(),
    started = gate(),
    finish = gate(),
    normal = d.send.bind(d);
  let first = true;
  d.send = async (...args) => {
    const result = await normal(...args);
    if (first) {
      first = false;
      started.release();
      await finish.promise;
    }
    return result;
  };
  const sync = new CalendarSync(
    d,
    saved,
    () => [p],
    () => true,
    600000,
  );
  try {
    await sync.setOwner("a");
    await sync.setAutomatic(true);
    const flushing = sync.flush();
    await started.promise;
    const changing = sync.setOwner("b");
    finish.release();
    await Promise.all([flushing, changing]);
    assert.equal(sync.view.automatic, false);
    await sync.flush();
    assert.equal(d.sent.length, 1);
    assert.ok(saved.values.has("calendar-sync:a"));
    assert.equal(saved.values.has("calendar-sync:b"), false);
    await sync.setAutomatic(true);
    await sync.flush();
    assert.equal(d.sent.length, 3);
    assert.ok(saved.values.has("calendar-sync:b"));
  } finally {
    finish.release();
    sync.close();
  }
});

test("auto Calendar disconnected changes wait and resume after reconnect", async () => {
  const p = project(),
    d = driver(),
    saved = storage();
  const sync = new CalendarSync(
    d,
    saved,
    () => [p],
    () => true,
    600000,
  );
  try {
    await sync.setOwner("a");
    await sync.setAutomatic(true);
    await sync.flush();
    d.view.status = "expired";
    p.deadline = "2028-03-03";
    sync.request();
    await sync.flush();
    assert.equal(sync.view.syncStatus, "pending");
    assert.equal(d.sent.length, 2);
    d.view.status = "connected";
    sync.request(true);
    await sync.flush();
    assert.equal(d.sent.at(-1)!.entry.id, "deadline");
    assert.equal(d.sent.at(-1)!.entry.date, "2028-03-03");
  } finally {
    sync.close();
  }
});

test("auto Calendar cannot publish without durable intent or unreadable ownership data", async () => {
  const p = project(),
    d = driver(),
    saved = storage();
  let fail = false;
  const write = saved.setItem;
  saved.setItem = async (...args) => {
    if (fail) throw Error("disk unavailable");
    await write(...args);
  };
  const sync = new CalendarSync(
    d,
    saved,
    () => [p],
    () => true,
    600000,
  );
  try {
    await sync.setOwner("a");
    await sync.setAutomatic(true);
    fail = true;
    await sync.flush();
    assert.equal(d.sent.length, 0);
    assert.equal(sync.view.syncStatus, "error");
    fail = false;
    saved.values.set("calendar-sync:b", "invalid ledger");
    await sync.setOwner("b");
    await assert.rejects(sync.setAutomatic(true), /Masuk ulang/);
    await sync.flush();
    assert.equal(d.sent.length, 0);
  } finally {
    sync.close();
  }
});

test("auto Calendar recreates an externally removed event with a fresh durable ID", async () => {
  const p = project(),
    d = driver(),
    saved = storage(),
    normal = d.send.bind(d);
  let gone = true;
  d.send = async (...args) => {
    const result = await normal(...args);
    if (gone) {
      gone = false;
      return [{ id: args[1][0].id, ok: false, recreate: true }];
    }
    return result;
  };
  const sync = new CalendarSync(
    d,
    saved,
    () => [p],
    () => true,
    600000,
  );
  try {
    await sync.setOwner("a");
    await sync.setAutomatic(true);
    await sync.flush();
    assert.equal(sync.view.syncStatus, "pending");
    await sync.flush();
    assert.equal(d.sent.at(-1)!.entry.id, `${MID}:sync:1`);
    assert.equal(sync.view.syncStatus, "synced");
  } finally {
    sync.close();
  }
});
