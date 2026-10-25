import { test } from "node:test";
import assert from "node:assert/strict";
import {
  randomUUID,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BitoCloud, validateCloudConfig } from "../electron/cloud";
import { EncryptedSessionStorage } from "../electron/session-storage";
import { createChosenFolder, folderName } from "../electron/local-tools";
import { Store } from "../electron/store";
import { defaultState } from "../electron/core";
import {
  ApiError,
  prepareContext,
  validateResults,
  appendResults,
  sseData,
  type Job,
} from "../supabase/functions/_shared/protocol";
import {
  createHandler,
  type Repository,
} from "../supabase/functions/_shared/handler";
import { generateGemini } from "../supabase/functions/_shared/gemini";

const uid = randomUUID(),
  device = randomUUID(),
  requestId = randomUUID();
const context = {
  profile: { name: "Okta", project: "Bito", style: "warm" },
  messages: [{ role: "user", content: "Halo" }],
  memories: [],
};
const baseJob: Job = {
  id: requestId,
  user_id: uid,
  device_id: device,
  round: 1,
  status: "running",
  contents: [{ role: "user", parts: [{ text: "Halo" }] }],
  instructions: "Bito",
  pending: [],
};
function fixture() {
  let allowed = true,
    calls = 0,
    finished = "",
    job = structuredClone(baseJob);
  const db: Repository = {
    authenticate: async (token) => {
      if (token !== "valid-session")
        throw new ApiError("sign_in_required", 401);
      return { id: uid, email: "demo@example.test", confirmed: true };
    },
    claim: async () => allowed,
    reserve: async (_u, _d, _i, c, r) => {
      calls++;
      job = {
        ...job,
        contents: c.contents as Job["contents"],
        instructions: c.instructions || job.instructions,
        round: r ? r + 1 : 1,
        status: "running",
      };
      return job;
    },
    get: async (u, d, i) => {
      if (u !== job.user_id || d !== job.device_id || i !== job.id)
        throw new ApiError("invalid_job", 409);
      return job;
    },
    finish: async (j, s, c = [], p = []) => {
      finished = s;
      job = {
        ...j,
        status: s,
        contents: c as Job["contents"],
        pending: p as Job["pending"],
      };
      return true;
    },
    cancel: async () => {
      finished = "cancelled";
    },
  };
  const generate: typeof generateGemini = async (o) => {
    o.emit("Halo, ");
    o.emit("Okta!");
    return {
      text: "Halo, Okta!",
      parts: [{ text: "Halo, Okta!" }],
      calls: [],
      input: 10,
      output: 5,
    };
  };
  const handle = createHandler({
    repository: db,
    key: "server-secret-for-test-only",
    model: "gemini-3.5-flash-lite",
    generate,
  });
  const send = (body: unknown, token = "valid-session") =>
    handle(
      new Request("https://demo.test/bito-api", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  return {
    db,
    send,
    generate,
    setAllowed: (v: boolean) => {
      allowed = v;
    },
    calls: () => calls,
    finished: () => finished,
  };
}
test("unauthenticated and revoked members cannot reach the AI", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.send(
        { action: "start", requestId, deviceId: device, ...context },
        "invalid",
      )
    ).status,
    401,
  );
  f.setAllowed(false);
  assert.equal(
    (await f.send({ action: "start", requestId, deviceId: device, ...context }))
      .status,
    403,
  );
  assert.equal(f.calls(), 0);
});
test("authenticated chat streams deltas and closes only after storing completion", async () => {
  const f = fixture(),
    response = await f.send({
      action: "start",
      requestId,
      deviceId: device,
      ...context,
    });
  const events = [];
  for await (const data of sseData(response.body!))
    events.push(JSON.parse(data));
  assert.deepEqual(events, [
    { type: "delta", text: "Halo, " },
    { type: "delta", text: "Okta!" },
    { type: "done" },
  ]);
  assert.equal(f.finished(), "complete");
});
test("tool handoff preserves Gemini thought signatures and resumes on a separate request", async () => {
  const f = fixture(),
    call = {
      id: randomUUID(),
      name: "create_folder" as const,
      args: { name: "Skripsi" },
    };
  const generate: typeof generateGemini = async (o) => {
    if (o.job.round === 1)
      return {
        text: "",
        parts: [
          {
            thoughtSignature: "opaque-signature",
            functionCall: {
              name: "create_folder",
              args: { name: "Skripsi" },
              id: "provider-call-1",
            },
          },
        ],
        calls: [call],
        input: 10,
        output: 10,
      };
    assert.equal(
      o.job.contents[1].parts[0].thoughtSignature,
      "opaque-signature",
    );
    assert.equal(
      o.job.contents[2].parts[0].functionResponse?.id,
      "provider-call-1",
    );
    o.emit("Folder berhasil dibuat.");
    return {
      text: "Folder berhasil dibuat.",
      parts: [{ text: "Folder berhasil dibuat." }],
      calls: [],
      input: 15,
      output: 5,
    };
  };
  const handler = createHandler({
    repository: f.db,
    key: "test-only",
    model: "gemini-3.5-flash-lite",
    generate,
  });
  const send = (body: unknown) =>
    handler(
      new Request("https://demo.test", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-session",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  const first = await send({
    action: "start",
    requestId,
    deviceId: device,
    ...context,
  });
  const events = [];
  for await (const d of sseData(first.body!)) events.push(JSON.parse(d));
  assert.equal(events[0].type, "tools");
  assert.equal(f.finished(), "waiting");
  const stolen = await send({
    action: "resume",
    requestId,
    deviceId: randomUUID(),
    round: 1,
    results: [{ id: call.id, ok: true, result: "done" }],
  });
  assert.equal(stolen.status, 409);
  const second = await send({
    action: "resume",
    requestId,
    deviceId: device,
    round: 1,
    results: [{ id: call.id, ok: true, result: "Created locally" }],
  });
  assert.match(await second.text(), /Folder berhasil dibuat/);
  assert.equal(f.finished(), "complete");
});
test("model failures produce safe error markers and release the job", async () => {
  const f = fixture();
  const handler = createHandler({
    repository: f.db,
    key: "never-return-this",
    model: "gemini-3.5-flash-lite",
    generate: async () => {
      throw Error("provider body has never-return-this");
    },
  });
  const r = await handler(
    new Request("https://demo.test", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-session",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "start",
        requestId,
        deviceId: device,
        ...context,
      }),
    }),
  );
  const text = await r.text();
  assert.match(text, /server_error/);
  assert.doesNotMatch(text, /never-return-this/);
  assert.equal(f.finished(), "error");
});
test("stream disconnect cancels the provider and job", async () => {
  const f = fixture();
  let aborted = false;
  const handler = createHandler({
    repository: f.db,
    key: "test",
    model: "gemini-3.5-flash-lite",
    generate: async (o) =>
      new Promise((_, reject) =>
        o.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("abort"));
          },
          { once: true },
        ),
      ),
  });
  const r = await handler(
    new Request("https://demo.test", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-session",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "start",
        requestId,
        deviceId: device,
        ...context,
      }),
    }),
  );
  await r.body!.cancel();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(aborted, true);
  assert.equal(f.finished(), "cancelled");
});
test("context and tool results cannot be replaced by oversized or unrelated data", () => {
  assert.throws(() =>
    prepareContext({
      ...context,
      messages: [{ role: "system", content: "bypass" }],
    }),
  );
  assert.throws(() =>
    prepareContext({
      ...context,
      messages: [{ role: "user", content: "a".repeat(24001) }],
    }),
  );
  const pending = [
    { id: "call-a", name: "add_task" as const, args: { title: "Test" } },
  ];
  assert.throws(() =>
    validateResults(pending, [{ id: "call-b", ok: true, result: "done" }]),
  );
  assert.throws(() =>
    validateResults(pending, [
      { id: "call-a", ok: true, result: "x".repeat(2001) },
    ]),
  );
});
test("parallel calls of the same tool keep their individual provider IDs", () => {
  const job = {
    ...baseJob,
    contents: [
      {
        role: "model" as const,
        parts: [
          { functionCall: { name: "add_task", args: {}, id: "one" } },
          { functionCall: { name: "add_task", args: {}, id: "two" } },
        ],
      },
    ],
    pending: [
      { id: "a", name: "add_task" as const, args: {} },
      { id: "b", name: "add_task" as const, args: {} },
    ],
  };
  const out = appendResults(job, [
    { id: "a", ok: true, result: "a" },
    { id: "b", ok: false, result: "b" },
  ]);
  assert.deepEqual(
    out.at(-1)?.parts.map((p) => p.functionResponse?.id),
    ["one", "two"],
  );
});
test("SSE decoding survives arbitrary UTF-8 and CRLF splits", async () => {
  const bytes = new TextEncoder().encode(
    ': ping\r\ndata: {"text":"🌱"}\r\n\r\ndata: done',
  );
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
      c.close();
    },
  });
  const out = [];
  for await (const d of sseData(stream)) out.push(d);
  assert.deepEqual(out, ['{"text":"🌱"}', "done"]);
});
test("Gemini adapter sends the server key in a header and detects truncated responses", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.doesNotMatch(String(url), /key=/);
    assert.equal(
      (init?.headers as Record<string, string>)["x-goog-api-key"],
      "server-only-test",
    );
    const body = JSON.parse(init!.body as string);
    assert.equal(body.generationConfig.maxOutputTokens, 1024);
    return new Response(
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]},"finishReason":"MAX_TOKENS"}]}\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    );
  };
  const text: string[] = [];
  await assert.rejects(
    generateGemini({
      key: "server-only-test",
      model: "gemini-3.5-flash-lite",
      job: baseJob,
      signal: new AbortController().signal,
      emit: (t) => text.push(t),
      fetcher,
    }),
    /response_limit/,
  );
  assert.deepEqual(text, ["Hello"]);
});
test("public desktop config rejects secret keys and non-Supabase endpoints", () => {
  assert.equal(validateCloudConfig({ url: "", publishableKey: "" }), null);
  assert.throws(() =>
    validateCloudConfig({
      url: "https://project.supabase.co",
      publishableKey: "sb_secret_no",
    }),
  );
  assert.throws(() =>
    validateCloudConfig({
      url: "http://project.supabase.co",
      publishableKey: "sb_publishable_test",
    }),
  );
  assert.throws(() =>
    validateCloudConfig({
      url: "https://attacker.test",
      publishableKey: "sb_publishable_test",
    }),
  );
});
test("OS-encrypted session storage is atomic, serialized, and contains no plaintext token", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bito-session-")),
    path = join(dir, "session.bin"),
    key = randomBytes(32);
  const cipher = {
    encrypt: async (text: string) => {
      const iv = randomBytes(12),
        c = createCipheriv("aes-256-gcm", key, iv);
      const out = Buffer.concat([c.update(text, "utf8"), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), out]);
    },
    decrypt: async (bytes: Buffer) => {
      const d = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      d.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([
        d.update(bytes.subarray(28)),
        d.final(),
      ]).toString();
    },
  };
  try {
    const storage = new EncryptedSessionStorage(path, cipher);
    await Promise.all([
      storage.setItem("session", "private-test-token"),
      storage.setItem("pkce", "private-verifier"),
    ]);
    assert.equal(
      (await readFile(path)).includes(Buffer.from("private-test-token")),
      false,
    );
    const restored = new EncryptedSessionStorage(path, cipher);
    assert.equal(await restored.getItem("session"), "private-test-token");
    assert.equal(await restored.getItem("pkce"), "private-verifier");
    await restored.removeItem("session");
    assert.equal(await restored.getItem("session"), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("folder tool creates only one chosen child, never overwrites, and honors cancellation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bito-folder-"));
  try {
    for (const bad of [
      "../escape",
      "/absolute",
      "a/b",
      "a\\b",
      "CON",
      "NUL.txt",
      "x.",
      " x",
      "",
      "..",
    ])
      assert.throws(() => folderName(bad));
    const signal = new AbortController().signal;
    assert.equal(
      (await createChosenFolder("Skripsi", async () => dir, signal)).ok,
      true,
    );
    assert.equal(
      (await createChosenFolder("Skripsi", async () => dir, signal)).ok,
      false,
    );
    assert.equal(
      (await createChosenFolder("Cancelled", async () => null, signal)).ok,
      false,
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      createChosenFolder("Aborted", async () => dir, controller.signal),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("local histories and action receipts remain isolated between accounts and restarts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bito-accounts-"));
  let a: Store | undefined, b: Store | undefined;
  try {
    a = new Store(join(dir, "a.sqlite"));
    b = new Store(join(dir, "b.sqlite"));
    const state = defaultState();
    state.profile.name = "A";
    state.messages = [
      { id: "secret", role: "user", text: "Only A", createdAt: 1 },
    ];
    a.save(state);
    assert.equal(b.load().messages.length, 0);
    assert.equal(b.load().profile.name, "");
    assert.equal(a.beginTool("call-one", "fingerprint"), null);
    a.finishTool({ id: "call-one", ok: true, result: "Created" });
    a.close();
    a = new Store(join(dir, "a.sqlite"));
    assert.equal(a.beginTool("call-one", "fingerprint")?.result, "Created");
    assert.throws(() => a!.beginTool("call-one", "different"));
    assert.equal(a.beginTool("crashed", "same"), null);
    assert.equal(a.beginTool("crashed", "same")?.ok, false);
    assert.equal(b.beginTool("call-one", "fingerprint"), null);
  } finally {
    a?.close();
    b?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Google login uses a one-time loopback callback and a matching PKCE verifier", async () => {
  const values = new Map<string, string>(),
    config = {
      url: "https://testproject.supabase.co",
      publishableKey: "sb_publishable_test",
    };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    { alg: "HS256", typ: "JWT" },
    { sub: uid, exp, aud: "authenticated" },
    "test-signature",
  ]
    .map((v, i) =>
      i < 2 ? Buffer.from(JSON.stringify(v)).toString("base64url") : v,
    )
    .join(".");
  let challenge = "",
    exchanges = 0,
    loggedIn = false,
    returned = 0;
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).includes("/auth/v1/token")) {
      exchanges++;
      const b = JSON.parse(init!.body as string);
      assert.equal(b.auth_code, "one-time-code");
      assert.equal(
        createHash("sha256").update(b.code_verifier).digest("base64url"),
        challenge,
      );
      return Response.json({
        access_token: token,
        refresh_token: "refresh-test",
        token_type: "bearer",
        expires_in: 3600,
        user: {
          id: uid,
          email: "demo@example.test",
          aud: "authenticated",
          role: "authenticated",
          created_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: {},
        },
      });
    }
    if (String(url).includes("/functions/v1/bito-api"))
      return Response.json({
        user: { id: uid, email: "demo@example.test" },
        allowed: true,
      });
    if (String(url).includes("/logout"))
      return new Response(null, { status: 204 });
    throw Error(`Unexpected test endpoint: ${String(url)}`);
  };
  const cloud = new BitoCloud(
    config,
    {
      getItem: (k) => values.get(k) || null,
      setItem: (k, v) => {
        values.set(k, v);
      },
      removeItem: (k) => {
        values.delete(k);
      },
    },
    fetcher,
  );
  let redirect = "";
  cloud.onLogin = async () => {
    loggedIn = true;
  };
  cloud.onReturn = () => {
    returned++;
  };
  try {
    await cloud.signIn(async (url) => {
      const u = new URL(url);
      assert.equal(u.searchParams.get("code_challenge_method"), "s256");
      challenge = u.searchParams.get("code_challenge")!;
      redirect = u.searchParams.get("redirect_to")!;
    });
    assert.equal(
      (await fetch("http://127.0.0.1:43821/auth/callback/wrong?code=bad"))
        .status,
      404,
    );
    assert.equal(exchanges, 0);
    const response = await fetch(`${redirect}?code=one-time-code`);
    assert.equal(response.status, 200);
    assert.match(
      response.url,
      /^http:\/\/127\.0\.0\.1:\d+\/complete\/[a-f0-9-]+$/,
    );
    const html = await response.text();
    assert.match(html, /Sudah masuk\./);
    assert.match(html, /Kembali ke Bito/);
    assert.doesNotMatch(html, /one-time-code|refresh-test/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(
      response.headers.get("content-security-policy")!,
      /script-src 'nonce-/,
    );
    const origin = new URL(response.url).origin;
    const action = new URL(html.match(/action="([^"]+)"/)![1], origin);
    assert.equal(
      (
        await fetch(action, {
          method: "POST",
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    assert.equal(returned, 0);
    assert.equal(
      (await fetch(action, { method: "POST", headers: { Origin: origin } }))
        .status,
      204,
    );
    assert.equal(returned, 1);
    assert.equal(
      (await fetch(response.url + "?code=should-not-render")).status,
      404,
    );
    assert.equal(exchanges, 1);
    assert.equal(loggedIn, true);
    assert.equal(cloud.view.status, "ready");
    assert.doesNotMatch(
      JSON.stringify(cloud.view),
      /refresh-test|access_token/,
    );
    await cloud.signOut();
    assert.equal(cloud.view.status, "signed-out");
    assert.equal(
      [...values.values()].some((v) => v.includes("refresh-test")),
      false,
    );
  } finally {
    cloud.cancelLogin();
  }
});

test("desktop-to-backend round trip streams Gemini output after a real local folder action, without a user API key", async () => {
  const f = fixture(),
    values = new Map<string, string>(),
    dir = await mkdtemp(join(tmpdir(), "bito-end-to-end-"));
  const call = {
    id: randomUUID(),
    name: "create_folder" as const,
    args: { name: "Project Bito" },
  };
  const generate: typeof generateGemini = async (o) => {
    if (o.job.round === 1)
      return {
        text: "",
        parts: [{ functionCall: { name: call.name, args: call.args } }],
        calls: [call],
        input: 15,
        output: 10,
      };
    assert.equal(
      (o.job.contents.at(-1)?.parts[0].functionResponse?.response as any).ok,
      true,
    );
    o.emit("Foldernya ");
    o.emit("sudah siap.");
    return {
      text: "Foldernya sudah siap.",
      parts: [{ text: "Foldernya sudah siap." }],
      calls: [],
      input: 25,
      output: 10,
    };
  };
  const backend = createHandler({
    repository: f.db,
    key: "backend-only-test-key",
    model: "gemini-3.5-flash-lite",
    generate,
  });
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).includes("/auth/v1/user"))
      return Response.json({ id: uid, email: "demo@example.test" });
    if (String(url).includes("/functions/v1/bito-api")) {
      const headers = new Headers(init!.headers);
      assert.equal(headers.get("apikey"), "sb_publishable_test");
      assert.doesNotMatch(JSON.stringify(init), /backend-only-test-key/);
      headers.set("Authorization", "Bearer valid-session");
      return backend(new Request(String(url), { ...init, headers }));
    }
    throw Error("Unexpected endpoint");
  };
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
    fetcher,
  );
  const exp = Math.floor(Date.now() / 1000) + 3600,
    token = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: uid, exp })).toString("base64url")}.${Buffer.from("test signature").toString("base64url")}`;
  try {
    const session = await cloud.client.auth.setSession({
      access_token: token,
      refresh_token: "test-refresh",
    });
    assert.equal(session.error, null);
    await cloud.check();
    const deltas: string[] = [];
    let actions = 0;
    const result = await cloud.reply({
      requestId,
      deviceId: device,
      profile: {
        name: "Okta",
        project: "Bito",
        style: "chill",
        proactive: "on-demand",
      },
      memories: [],
      history: [{ role: "user", content: "Buat folder Project Bito" }],
      signal: new AbortController().signal,
      onDelta: (t) => deltas.push(t),
      execute: async (c) => {
        actions++;
        return {
          id: c.id,
          ...(await createChosenFolder(
            c.args.name,
            async () => dir,
            new AbortController().signal,
          )),
        };
      },
    });
    assert.equal(actions, 1);
    assert.equal(result, "Foldernya sudah siap.");
    assert.equal(deltas.join(""), result);
    assert.equal(f.finished(), "complete");
    assert.equal((await stat(join(dir, "Project Bito"))).isDirectory(), true);
  } finally {
    cloud.cancelLogin();
    await rm(dir, { recursive: true, force: true });
  }
});
