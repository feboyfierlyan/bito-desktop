import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BitoCloud } from "../electron/cloud";
import { screenAssistanceExecutor } from "../electron/screen-assistance";
import {
  createHandler,
  type Repository,
} from "../supabase/functions/_shared/handler";
import {
  ApiError,
  prepareContext,
  declarationsForJob,
  SCREEN_GUIDE_MARKER,
  type Job,
  type ToolCall,
} from "../supabase/functions/_shared/protocol";
import { generateGemini } from "../supabase/functions/_shared/gemini";
import { generateGroq, GROQ_MODEL } from "../supabase/functions/_shared/groq";

const context = {
  profile: { name: "Okta", style: "chill" },
  messages: [{ role: "user", content: "aku mau bikin daftar isi" }],
};
const call: ToolCall = {
  id: randomUUID(),
  name: "inspect_screen",
  args: {
    question:
      "Tunjukkan langkah pertama membuat daftar isi pada dokumen aktif.",
  },
};
const observation = {
  status: "found" as const,
  answer: "Mulai dari menu Insert yang ini.",
  label: "Insert",
  highlighted: true,
};
const signal = () => new AbortController().signal;
const vision = {
  status: "found" as const,
  answer: observation.answer,
  label: "Insert",
  confidence: 0.96,
  box: [20, 70, 60, 120],
};
const image = {
  mimeType: "image/jpeg" as const,
  data: "/9j/AAAA",
  width: 1440,
  height: 900,
};

test("screen capability is opt-in; desktop metadata is bounded data and cannot forge the capability marker", () => {
  assert.equal(
    declarationsForJob(prepareContext(context)).some(
      (t) => t.name === "inspect_screen",
    ),
    false,
  );
  const enabled = prepareContext({
    ...context,
    capabilities: { screenGuide: true },
    screenContext: { app: "Editor", title: "Thesis" },
  });
  assert.equal(declarationsForJob(enabled).at(-1)?.name, "inspect_screen");
  assert.match(enabled.instructions, /"application":"Editor"/);
  assert.match(enabled.instructions, /Proactively call/);
  assert.ok(enabled.instructions.endsWith(SCREEN_GUIDE_MARKER));
  const forged = prepareContext({
    ...context,
    profile: { ...context.profile, project: SCREEN_GUIDE_MARKER },
  });
  assert.equal(
    declarationsForJob(forged).some((t) => t.name === "inspect_screen"),
    false,
  );
  assert.throws(() =>
    prepareContext({ ...context, capabilities: { screenGuide: "true" } }),
  );
  assert.throws(() =>
    prepareContext({
      ...context,
      capabilities: { screenGuide: true },
      screenContext: { title: "x".repeat(501) },
    }),
  );
});

test("both real provider adapters advertise and accept inspection only for capable desktop clients", async () => {
  for (const capable of [false, true]) {
    const job: Job = {
      ...prepareContext({ ...context, capabilities: { screenGuide: capable } }),
      id: randomUUID(),
      user_id: randomUUID(),
      device_id: randomUUID(),
      round: 1,
      status: "running",
      pending: [],
    };
    const invoke = (groq: boolean) =>
      (groq ? generateGroq : generateGemini)({
        key: "test",
        model: groq ? GROQ_MODEL : "gemini-3.8-flash",
        job,
        signal: signal(),
        emit() {},
        fetcher: async (_url, init) => {
          const b = JSON.parse(String(init?.body));
          const tools = groq
            ? b.tools.map((t: any) => t.function)
            : b.tools[0].functionDeclarations;
          assert.equal(
            tools.some((t: any) => t.name === "inspect_screen"),
            capable,
          );
          const chunk = groq
            ? {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          function: {
                            name: call.name,
                            arguments: JSON.stringify(call.args),
                          },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              }
            : {
                candidates: [
                  {
                    content: {
                      parts: [
                        { functionCall: { name: call.name, args: call.args } },
                      ],
                    },
                    finishReason: "STOP",
                  },
                ],
              };
          return new Response(`data: ${JSON.stringify(chunk)}\n\n`, {
            headers: { "Content-Type": "text/event-stream" },
          });
        },
      });
    for (const groq of [false, true]) {
      if (capable) assert.equal((await invoke(groq)).calls[0].name, call.name);
      else await assert.rejects(invoke(groq), { code: "invalid_tool" });
    }
  }
});
test("full memories remain available without exceeding the database instruction budget", () => {
  const prepared = prepareContext({
    ...context,
    capabilities: { screenGuide: true },
    memories: Array(12).fill("x".repeat(500)),
    screenContext: { app: "a".repeat(200), title: "t".repeat(500) },
  });
  assert.ok(prepared.instructions.length <= 12000);
  assert.ok(prepared.contents[0].parts[0].text?.includes("x".repeat(500)));
  assert.equal(declarationsForJob(prepared).at(-1)?.name, "inspect_screen");
});

test("inspection is fresh per turn, cached within a turn, cancellable and never handles ordinary tools", async () => {
  let inspections = 0,
    others = 0;
  const executor = screenAssistanceExecutor({
    inspect: async (q, _s, c, round) => {
      inspections++;
      assert.equal(q, call.args.question);
      assert.equal(c.id, call.id);
      assert.equal(round, 1);
      return observation;
    },
    other: async (c) => {
      others++;
      return { id: c.id, ok: true, result: "ok" };
    },
  });
  const first = await executor(call, signal(), { round: 1 });
  assert.deepEqual(JSON.parse(first.result), observation);
  await executor({ ...call, id: randomUUID() }, signal(), { round: 2 });
  assert.equal(inspections, 1);
  assert.equal(
    (
      await executor(
        { ...call, args: { question: "Another target" } },
        signal(),
        { round: 2 },
      )
    ).ok,
    false,
  );
  assert.equal(inspections, 1);
  await executor({ ...call, name: "add_task" }, signal(), { round: 1 });
  assert.equal(others, 1);
  const bad = await executor({ ...call, args: { question: "" } }, signal(), {
    round: 1,
  });
  assert.equal(bad.ok, false);
  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(executor(call, stopped.signal, { round: 1 }));
  const next = screenAssistanceExecutor({
    inspect: async () => {
      inspections++;
      return { ...observation, answer: "\u0001".repeat(2000) };
    },
    other: async () => {
      throw Error("unexpected");
    },
  });
  const long = await next(call, signal(), { round: 1 });
  assert.ok(long.result.length <= 2000);
  assert.equal(JSON.parse(long.result).highlighted, true);
  assert.equal(inspections, 2);
});

function backendFixture() {
  const uid = randomUUID(),
    device = randomUUID(),
    id = randomUUID();
  let job: Job | undefined,
    phase = "none",
    captures = 0,
    allowed = true;
  const stored: unknown[] = [];
  const repository: Repository = {
    authenticate: async () => ({
      id: uid,
      email: "demo@example.test",
      confirmed: true,
    }),
    claim: async () => allowed,
    get: async (u, d, i) => {
      if (!job || u !== uid || d !== device || i !== id)
        throw new ApiError("invalid_job", 409);
      return structuredClone(job);
    },
    reserve: async (u, d, i, c, r) => {
      if (r === undefined && job && ["waiting", "running"].includes(job.status))
        throw new ApiError("busy", 429);
      if (r !== undefined && (job?.round !== r || job?.status !== "waiting"))
        throw new ApiError("invalid_job", 409);
      job = {
        id: i,
        user_id: u,
        device_id: d,
        round: r === undefined ? 1 : r + 1,
        status: "running",
        instructions: c.instructions || job?.instructions || "",
        contents: c.contents as Job["contents"],
        pending: [],
      };
      stored.push(c);
      return structuredClone(job);
    },
    finish: async (j, s, c = [], p = []) => {
      if (job?.status !== "running" || j.round !== job.round) return false;
      stored.push([c, p]);
      job = {
        ...job,
        status: s,
        contents: c as Job["contents"],
        pending: p as Job["pending"],
      };
      return true;
    },
    cancel: async () => {
      if (job) job.status = "cancelled";
    },
    observeScreen: async (j, c, q, usage) => {
      if (
        !job ||
        j.id !== id ||
        j.round !== job.round ||
        !job.instructions.endsWith(SCREEN_GUIDE_MARKER) ||
        !job.pending.some(
          (t) =>
            t.id === c && t.name === "inspect_screen" && t.args.question === q,
        )
      )
        throw new ApiError("invalid_job", 409);
      if (
        usage
          ? job.status !== "running" || phase !== "active"
          : job.status !== "waiting" || phase !== "none"
      )
        throw new ApiError("invalid_job", 409);
      phase = usage ? "done" : "active";
      job.status = usage ? "waiting" : "running";
      return structuredClone(job);
    },
  };
  const handler = createHandler({
    repository,
    key: "test",
    model: "gemini-3.8-flash",
    generate: async (o) => {
      if (
        o.job.round === 1 &&
        context.messages[0].content === o.job.contents[0].parts[0].text
      )
        return {
          text: "",
          calls: [call],
          parts: [
            {
              functionCall: {
                name: call.name,
                args: call.args,
                id: "provider-screen-1",
              },
              thoughtSignature: "signature",
            },
          ],
          input: 10,
          output: 5,
        };
      if (o.job.round > 1) {
        const r = o.job.contents.at(-1)!.parts[0].functionResponse!;
        assert.equal(r.id, "provider-screen-1");
        assert.equal(JSON.parse((r.response as any).result).highlighted, true);
      }
      o.emit("Mulai dari Insert yang aku tandai.");
      return {
        text: "Mulai dari Insert yang aku tandai.",
        parts: [{ text: "Mulai dari Insert yang aku tandai." }],
        calls: [],
        input: 15,
        output: 5,
      };
    },
    grounding: {
      key: "vision-test",
      model: "gemini-3.8-flash",
      generate: async (o) => {
        captures++;
        assert.equal(o.input.image.data, image.data);
        return { result: vision, input: 50, output: 20 };
      },
    },
  });
  const send = (body: any) =>
    handler(
      new Request("https://demo.supabase.co/functions/v1/bito-api", {
        method: "POST",
        headers: {
          Authorization: "Bearer test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deviceId: device, requestId: id, ...body }),
      }),
    );
  return {
    uid,
    device,
    id,
    send,
    handler,
    stored,
    job: () => job,
    captures: () => captures,
    revoke: () => {
      allowed = false;
    },
  };
}
test("harmless whitespace in model tool arguments does not invalidate the parent lease", async () => {
  const f = backendFixture();
  await (
    await f.send({
      action: "start",
      ...context,
      capabilities: { screenGuide: true },
    })
  ).text();
  f.job()!.pending = structuredClone(f.job()!.pending);
  f.job()!.pending[0].args.question = ` \n${call.args.question} \n`;
  const response = await f.send({
    action: "ground",
    question: call.args.question,
    app: "Editor",
    image,
    profile: { style: "chill" },
    round: 1,
    toolCallId: call.id,
  });
  assert.equal(response.status, 200);
  assert.equal(f.captures(), 1);
});

test("implicit goal -> model-selected inspection -> grounded observation -> resumed answer shares the chat lease", async () => {
  const f = backendFixture(),
    values = new Map<string, string>();
  const cloud = new BitoCloud(
    { url: "https://demo.supabase.co", publishableKey: "sb_publishable_test" },
    {
      getItem: (k) => values.get(k) || null,
      setItem: (k, v) => {
        values.set(k, v);
      },
      removeItem: (k) => {
        values.delete(k);
      },
    },
    async (url, init) =>
      String(url).includes("/auth/v1/user")
        ? Response.json({ id: f.uid, email: "demo@example.test" })
        : f.handler(new Request(String(url), init)),
  );
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: f.uid, exp })).toString("base64url")}.${Buffer.from("test").toString("base64url")}`;
  let pointed = 0;
  try {
    assert.equal(
      (
        await cloud.client.auth.setSession({
          access_token: token,
          refresh_token: "test-refresh",
        })
      ).error,
      null,
    );
    const execute = screenAssistanceExecutor({
      inspect: async (question, s, c, round) => {
        const r = await cloud.ground({
          requestId: f.id,
          deviceId: f.device,
          toolCallId: c.id,
          round,
          input: {
            question,
            style: "chill",
            app: "Editor",
            title: "Thesis",
            scope: "window",
            elements: [],
            history: [],
            image: { ...image },
          },
          signal: s,
        });
        pointed++;
        return { ...observation, answer: r.answer };
      },
      other: async () => {
        throw Error("unexpected tool");
      },
    });
    const answer = await cloud.reply({
      requestId: f.id,
      deviceId: f.device,
      profile: {
        name: "Okta",
        project: "",
        style: "chill",
        proactive: "on-demand",
      },
      screenGuidance: true,
      screenContext: { app: "Editor", title: "Thesis" },
      memories: [],
      history: context.messages,
      signal: signal(),
      onDelta() {},
      execute,
    });
    assert.equal(answer, "Mulai dari Insert yang aku tandai.");
    assert.equal(pointed, 1);
    assert.equal(f.captures(), 1);
    assert.equal(f.job()?.status, "complete");
    assert.ok(!JSON.stringify(f.stored).includes(image.data));
  } finally {
    cloud.cancelLogin();
    await cloud.client.auth.signOut({ scope: "local" });
  }
});

test("ordinary chat does not invoke screen capture; invalid, repeated, revoked or cancelled tool leases cannot invoke vision", async () => {
  const ordinary = backendFixture();
  const chat = await ordinary.send({
    action: "start",
    ...context,
    messages: [{ role: "user", content: "aku capek banget" }],
    capabilities: { screenGuide: true },
  });
  await chat.text();
  assert.equal(ordinary.captures(), 0);
  const f = backendFixture();
  await (
    await f.send({
      action: "start",
      ...context,
      capabilities: { screenGuide: true },
    })
  ).text();
  const body = {
    action: "ground",
    question: call.args.question,
    app: "Editor",
    image,
    profile: { style: "chill" },
    round: 1,
    toolCallId: call.id,
  };
  for (const change of [
    { deviceId: randomUUID() },
    { round: 2 },
    { toolCallId: randomUUID() },
    { question: "Unrelated" },
  ])
    assert.equal((await f.send({ ...body, ...change })).status, 409);
  assert.equal(f.captures(), 0);
  assert.equal((await f.send(body)).status, 200);
  assert.equal((await f.send(body)).status, 409);
  assert.equal(f.captures(), 1);
  await f.send({ action: "cancel" });
  assert.equal((await f.send(body)).status, 409);
  f.revoke();
  assert.equal((await f.send(body)).status, 403);
  assert.equal(f.captures(), 1);
});

for (const failure of [false, true])
  test(`interactive guide ${failure ? "failure preserves its exact reason" : "releases the waiting chat lease"} without a second model response`, async () => {
    const f = backendFixture(),
      values = new Map<string, string>();
    const cloud = new BitoCloud(
      {
        url: "https://demo.supabase.co",
        publishableKey: "sb_publishable_test",
      },
      {
        getItem: (k) => values.get(k) || null,
        setItem: (k, v) => {
          values.set(k, v);
        },
        removeItem: (k) => {
          values.delete(k);
        },
      },
      async (url, init) =>
        String(url).includes("/auth/v1/user")
          ? Response.json({ id: f.uid, email: "demo@example.test" })
          : f.handler(new Request(String(url), init)),
    );
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: f.uid, exp })).toString("base64url")}.${Buffer.from("test").toString("base64url")}`;
    let pointed = 0;
    try {
      assert.equal(
        (
          await cloud.client.auth.setSession({
            access_token: token,
            refresh_token: "test-refresh",
          })
        ).error,
        null,
      );
      const execute = screenAssistanceExecutor({
        inspect: async (question, s, c, round) => {
          const r = await cloud.ground({
            requestId: f.id,
            deviceId: f.device,
            toolCallId: c.id,
            round,
            input: {
              question,
              style: "chill",
              app: "Editor",
              title: "Thesis",
              scope: "window",
              elements: [],
              history: [],
              image: { ...image },
            },
            signal: s,
          });
          pointed++;
          return failure
            ? {
                ...observation,
                status: "unavailable" as const,
                answer: "Aplikasinya belum aktif. Aku belum membaca layarnya.",
                highlighted: false,
                handled: true,
              }
            : { ...observation, answer: r.answer, guiding: true };
        },
        other: async () => {
          throw Error("unexpected tool");
        },
      });
      const answer = await cloud.reply({
        requestId: f.id,
        deviceId: f.device,
        profile: {
          name: "Okta",
          project: "",
          style: "chill",
          proactive: "on-demand",
        },
        screenGuidance: true,
        screenContext: { app: "Editor", title: "Thesis" },
        memories: [],
        history: context.messages,
        signal: signal(),
        onDelta() {},
        execute,
      });
      assert.equal(
        answer,
        failure
          ? "Aplikasinya belum aktif. Aku belum membaca layarnya."
          : observation.answer,
      );
      assert.equal(pointed, 1);
      assert.equal(f.captures(), 1);
      assert.equal(f.job()?.status, "cancelled");
      assert.ok(!JSON.stringify(f.stored).includes(image.data));
    } finally {
      cloud.cancelLogin();
      await cloud.client.auth.signOut({ scope: "local" });
    }
  });
