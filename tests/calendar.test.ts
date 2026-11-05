import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { GoogleCalendar, calendarEventId } from "../electron/google-calendar";
import {
  calendarEntries,
  calendarEvent,
  nextCalendarDate,
  type CalendarEntry,
} from "../src/calendar";
import { approveProjectPlan, newProject } from "../src/projects";

const config = {
  clientId: "test.apps.googleusercontent.com",
  clientSecret: "test-client",
};
const owner = { id: "account-a", email: "a@example.com" };
const entry: CalendarEntry = {
  id: "milestone-a",
  title: "Laporan · Data",
  date: "2028-02-29",
  description: "Bandingkan data",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: async (key: string) => {
      values.delete(key);
    },
  };
}
async function connected(fetcher: typeof fetch, expired = false) {
  const saved = storage();
  saved.values.set(
    `google-calendar:${owner.id}`,
    JSON.stringify({
      access: "access-a",
      refresh: "refresh-a",
      email: owner.email,
      expires: Date.now() + (expired ? -1 : 3600000),
      clientId: config.clientId,
    }),
  );
  const calendar = new GoogleCalendar(config, saved, fetcher);
  await calendar.setOwner(owner);
  return { calendar, saved };
}

test("Calendar targets use approved milestones, omit completed work and never invent appointments", () => {
  const project = newProject({
    name: "Laporan",
    brief: "Tugas",
    deadline: "2028-03-02",
    outcome: "PDF",
    availability: "Sore",
  });
  project.draft = {
    id: crypto.randomUUID(),
    summary: "Laporan",
    assumptions: [],
    milestones: ["Data", "PDF"].map((title, i) => ({
      id: crypto.randomUUID(),
      title,
      targetDate: i ? "2028-03-01" : "2028-02-29",
      tasks: [
        {
          id: crypto.randomUUID(),
          title,
          details: "",
          doneWhen: "Beres",
          estimateMin: 10,
          estimateMax: 20,
          sourceIds: [],
          status: "todo" as const,
        },
      ],
    })),
  };
  assert.deepEqual(calendarEntries(project), []);
  approveProjectPlan(project, project.draft.id, project.version);
  project.plan!.milestones[1].tasks[0].status = "done";
  const entries = calendarEntries(project);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Laporan · Data");
  const event = calendarEvent(entries[0]);
  assert.deepEqual(event.start, { date: "2028-02-29" });
  assert.deepEqual(event.end, { date: "2028-03-01" });
  assert.deepEqual(event.reminders, { useDefault: false });
  assert.equal("dateTime" in event.start, false);
  project.status = "archived";
  assert.deepEqual(calendarEntries(project), []);
});

test("all-day exclusive end handles leap years and year boundaries and rejects invalid dates", () => {
  assert.equal(nextCalendarDate("2028-02-28"), "2028-02-29");
  assert.equal(nextCalendarDate("2026-12-31"), "2027-01-01");
  for (const day of ["2026-02-29", "2026-11-31", "2026-1-01", "bad"])
    assert.throws(() => nextCalendarDate(day), /Tanggal/);
});

test("export retries update a deterministic event, isolated by Bito account and project", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const { calendar } = await connected((async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1
      ? json({}, 409)
      : json({
          htmlLink: "https://calendar.google.com/calendar/event?eid=example",
        });
  }) as typeof fetch);
  const result = await calendar.send("project-a", [entry]);
  const id = calendarEventId(owner.id, "project-a", entry.id);
  assert.match(id, /^[0-9a-f]{64}$/);
  assert.notEqual(id, calendarEventId("account-b", "project-a", entry.id));
  assert.notEqual(id, calendarEventId(owner.id, "project-b", entry.id));
  assert.equal(JSON.parse(calls[0].init!.body as string).id, id);
  assert.equal(calls[1].init!.method, "PATCH");
  assert.ok(calls[1].url.includes(`/events/${id}?`));
  assert.equal(result[0].ok, true);
  assert.equal(JSON.stringify(calendar.view).includes("access-a"), false);
});

test("changed plans preserve successful results and stop further external writes", async () => {
  let current = true,
    calls = 0;
  const { calendar } = await connected((async () => {
    calls++;
    current = false;
    return json({});
  }) as typeof fetch);
  const results = await calendar.send(
    "project-a",
    [entry, { ...entry, id: "milestone-b" }],
    () => current,
  );
  assert.equal(calls, 1);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.match(results[1].error!, /berubah/);
});

test("changed context cannot perform the PATCH after a duplicate response", async () => {
  let current = true,
    calls = 0;
  const { calendar } = await connected((async () => {
    calls++;
    current = false;
    return json({}, 409);
  }) as typeof fetch);
  const results = await calendar.send("project-a", [entry], () => current);
  assert.equal(calls, 1);
  assert.equal(results[0].ok, false);
});

test("partial failures remain retryable and a 401 stops remaining exports", async () => {
  let calls = 0;
  const { calendar } = await connected((async () => {
    calls++;
    return json({}, calls === 1 ? 401 : 200);
  }) as typeof fetch);
  const results = await calendar.send("project-a", [
    entry,
    { ...entry, id: "milestone-b" },
  ]);
  assert.equal(calls, 1);
  assert.ok(results.every((r) => !r.ok));
  assert.equal(calendar.view.status, "expired");
});

test("network failures during token refresh permit retry; invalid grants require reconnect", async () => {
  let mode = "offline";
  const { calendar } = await connected(
    (async (url) => {
      if (mode === "offline") throw new TypeError("fetch failed");
      if (mode === "invalid") return json({ error: "invalid_grant" }, 400);
      return String(url).includes("oauth2")
        ? json({ access_token: "new-access", expires_in: 3600 })
        : json({});
    }) as typeof fetch,
    true,
  );
  await assert.rejects(calendar.send("project-a", [entry]));
  assert.equal(calendar.view.status, "connected");
  mode = "online";
  assert.equal((await calendar.send("project-a", [entry]))[0].ok, true);
  const invalid = await connected(
    (async () => json({ error: "invalid_grant" }, 400)) as typeof fetch,
    true,
  );
  await assert.rejects(
    invalid.calendar.send("project-a", [entry]),
    /Hubungkan ulang/,
  );
  assert.equal(invalid.calendar.view.status, "expired");
});

test("switching Bito accounts never reuses another account's Calendar grant", async () => {
  let calls = 0;
  const { calendar } = await connected((async () => {
    calls++;
    return json({});
  }) as typeof fetch);
  await calendar.setOwner({ id: "account-b", email: "b@example.com" });
  assert.equal(calendar.view.status, "disconnected");
  assert.equal(calendar.view.email, undefined);
  await assert.rejects(calendar.send("project-a", [entry]), /Hubungkan/);
  assert.equal(calls, 0);
  await calendar.setOwner(owner);
  assert.equal(calendar.view.status, "connected");
  await calendar.disconnect();
  await calendar.setOwner(owner);
  assert.equal(calendar.view.status, "disconnected");
});

test("Desktop OAuth validates state and PKCE and stores credentials only for the matching account", async (t) => {
  const saved = storage();
  let auth: URL | undefined;
  let verifier = "";
  const calendar = new GoogleCalendar(config, saved, (async (url, init) => {
    if (String(url).includes("oauth2")) {
      const fields = new URLSearchParams(init!.body as URLSearchParams);
      verifier = fields.get("code_verifier")!;
      assert.equal(
        fields.get("redirect_uri"),
        auth!.searchParams.get("redirect_uri"),
      );
      return json({
        access_token: "access-a",
        refresh_token: "refresh-a",
        expires_in: 3600,
        scope:
          "openid email https://www.googleapis.com/auth/calendar.events.owned",
      });
    }
    return json({ email: owner.email, email_verified: true });
  }) as typeof fetch);
  t.after(() => calendar.cancel());
  await calendar.setOwner(owner);
  await calendar.connect(async (url) => {
    auth = new URL(url);
  });
  const redirect = new URL(auth!.searchParams.get("redirect_uri")!);
  redirect.searchParams.set("code", "test-code");
  redirect.searchParams.set("state", "wrong-state");
  assert.equal((await fetch(redirect)).status, 400);
  assert.equal(saved.values.has(`google-calendar:${owner.id}`), false);
  redirect.searchParams.set("state", auth!.searchParams.get("state")!);
  const response = await fetch(redirect);
  assert.match(await response.text(), /Calendar sudah terhubung/);
  assert.equal(
    createHash("sha256").update(verifier).digest("base64url"),
    auth!.searchParams.get("code_challenge"),
  );
  assert.equal(calendar.view.status, "connected");
  assert.ok(saved.values.has(`google-calendar:${owner.id}`));
  assert.equal(JSON.stringify(calendar.view).includes("refresh-a"), false);
});

test("Desktop OAuth rejects mismatched Google accounts and permission denial", async (t) => {
  for (const denied of [false, true]) {
    const saved = storage();
    let auth: URL | undefined;
    const calendar = new GoogleCalendar(config, saved, (async (url) =>
      String(url).includes("oauth2")
        ? json({
            access_token: "wrong-access",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/calendar.events.owned",
          })
        : json({
            email: "other@example.com",
            email_verified: true,
          })) as typeof fetch);
    t.after(() => calendar.cancel());
    await calendar.setOwner(owner);
    await calendar.connect(async (url) => {
      auth = new URL(url);
    });
    const redirect = new URL(auth!.searchParams.get("redirect_uri")!);
    redirect.searchParams.set("state", auth!.searchParams.get("state")!);
    redirect.searchParams.set(
      denied ? "error" : "code",
      denied ? "access_denied" : "test-code",
    );
    await (await fetch(redirect)).text();
    assert.equal(calendar.view.status, "disconnected");
    assert.equal(saved.values.size, 0);
    assert.match(
      calendar.view.error!,
      denied ? /Izin/ : /akun Google yang sama/,
    );
  }
});

test("Calendar removes only its deterministic mapped event and tolerates already deleted targets", async () => {
  for (const status of [204, 404, 410]) {
    let called = false;
    const { calendar } = await connected((async (url, init) => {
      called = true;
      assert.equal(
        String(url),
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId(owner.id, "project-a", entry.id)}?sendUpdates=none`,
      );
      assert.equal(init?.method, "DELETE");
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer access-a",
      );
      return new Response(null, { status });
    }) as typeof fetch);
    await calendar.remove("project-a", entry.id);
    assert.equal(called, true);
  }
});

test("Calendar deletion stops on stale ownership and asks reconnect on unauthorized response", async () => {
  let calls = 0;
  const { calendar } = await connected((async () => {
    calls++;
    return json({}, 401);
  }) as typeof fetch);
  await assert.rejects(
    calendar.remove("project-a", entry.id, () => false),
    /berubah/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    calendar.remove("project-a", entry.id),
    /Hubungkan ulang/,
  );
  assert.equal(calendar.view.status, "expired");
});

test("Calendar signals a tombstoned ID so the durable sync can recreate it safely", async () => {
  const methods: string[] = [];
  const { calendar } = await connected((async (_url, init) => {
    methods.push(init!.method!);
    return json({}, init!.method === "POST" ? 409 : 410);
  }) as typeof fetch);
  assert.deepEqual(await calendar.send("project-a", [entry]), [
    { id: entry.id, ok: false, recreate: true },
  ]);
  assert.deepEqual(methods, ["POST", "PATCH"]);
});
