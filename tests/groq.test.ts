import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateGroq,
  GROQ_MODEL,
  groqMessages,
} from "../supabase/functions/_shared/groq";
import { generateGemini } from "../supabase/functions/_shared/gemini";
import { providerConfig } from "../supabase/functions/_shared/provider";
import {
  appendResults,
  type Job,
} from "../supabase/functions/_shared/protocol";

const job: Job = {
  id: crypto.randomUUID(),
  user_id: crypto.randomUUID(),
  device_id: crypto.randomUUID(),
  round: 1,
  status: "running",
  contents: [{ role: "user", parts: [{ text: "bro" }] }],
  instructions: "Bito",
  pending: [],
};
const options = () => ({
  key: "test-secret",
  model: GROQ_MODEL,
  job: structuredClone(job),
  signal: new AbortController().signal,
  emit: (_: string) => {},
});
const streamed = (chunks: unknown[]) =>
  new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
      "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } },
  );
const chunk = (delta: object, finish_reason: string | null = null) => ({
  choices: [{ delta, finish_reason }],
});

test("Groq uses the exact Qwen model and a server-owned endpoint; reasoning never reaches UI", async () => {
  const seen: string[] = [];
  const response = await generateGroq({
    ...options(),
    emit: (text) => seen.push(text),
    fetcher: async (url, init) => {
      assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
      assert.ok(!String(url).includes("test-secret"));
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer test-secret",
      );
      const body = JSON.parse(init?.body as string);
      assert.equal(body.model, GROQ_MODEL);
      assert.equal(body.reasoning_effort, "none");
      assert.equal(body.reasoning_format, "hidden");
      assert.equal(body.tools[0].function.parameters.type, "object");
      assert.equal(
        body.tools[0].function.parameters.properties.items.items.type,
        "string",
      );
      assert.equal(body.messages[0].role, "system");
      assert.equal(body.parallel_tool_calls, false);
      return streamed([
        chunk({ reasoning: "private" }),
        chunk({ content: "apa?" }, "stop"),
        {
          choices: [],
          x_groq: { usage: { prompt_tokens: 12, completion_tokens: 3 } },
        },
      ]);
    },
  });
  assert.deepEqual(seen, ["apa?"]);
  assert.equal(response.text, "apa?");
  assert.deepEqual(response.parts, [{ text: "apa?" }]);
  assert.equal(response.input, 12);
  assert.equal(response.output, 3);
});

test("fragmented tool arguments resume with the same ID and a validated local receipt", async () => {
  const response = await generateGroq({
    ...options(),
    fetcher: async () =>
      streamed([
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "provider-id",
              function: {
                name: "create_reminder",
                arguments: '{"title":"Makan",',
              },
            },
          ],
        }),
        chunk(
          {
            tool_calls: [
              {
                index: 0,
                function: { arguments: '"due":"2026-10-26T12:00:00+07:00"}' },
              },
            ],
          },
          "tool_calls",
        ),
      ]),
  });
  assert.equal(response.calls.length, 1);
  const call = response.calls[0];
  assert.match(call.id, /^[0-9a-f-]{36}$/);
  const waiting = {
    ...job,
    contents: [
      ...job.contents,
      { role: "model" as const, parts: response.parts },
    ],
    pending: response.calls,
  };
  const contents = appendResults(waiting, [
    { id: call.id, ok: true, result: "Reminder saved" },
  ]);
  const messages = groqMessages(contents, job.instructions) as any[];
  assert.equal(messages[2].tool_calls[0].id, call.id);
  assert.equal(messages[3].role, "tool");
  assert.equal(messages[3].tool_call_id, call.id);
  assert.deepEqual(JSON.parse(messages[3].content), {
    ok: true,
    result: "Reminder saved",
  });
});

test("invalid, oversized, or unfinished tool output cannot become executable calls", async () => {
  for (const [name, args, index] of [
    ["shell", "{}", 0],
    ["add_task", "[]", 0],
    ["add_task", "{", 0],
    ["add_task", "{}", 3],
    ["add_task", "{}", 1],
  ] as const) {
    await assert.rejects(
      generateGroq({
        ...options(),
        fetcher: async () =>
          streamed([
            chunk(
              { tool_calls: [{ index, function: { name, arguments: args } }] },
              "tool_calls",
            ),
          ]),
      }),
      { code: "invalid_tool" },
    );
  }
  await assert.rejects(
    generateGroq({
      ...options(),
      fetcher: async () => streamed([chunk({ content: "partial" })]),
    }),
    { code: "incomplete_response" },
  );
  await assert.rejects(
    generateGroq({
      ...options(),
      fetcher: async () => streamed([chunk({ content: "partial" }, "length")]),
    }),
    { code: "response_limit" },
  );
  await assert.rejects(
    generateGroq({
      ...options(),
      model: "another/model",
      fetcher: async () => {
        throw Error("must not fetch");
      },
    }),
    { code: "server_config" },
  );
});

test("quota, cancellation and provider failures never retry or leak upstream error bodies", async () => {
  for (const [status, code] of [
    [429, "provider_limit"],
    [401, "provider_error"],
    [500, "provider_error"],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      generateGroq({
        ...options(),
        fetcher: async () => {
          calls++;
          return new Response("private provider details", { status });
        },
      }),
      { code, message: code },
    );
    assert.equal(calls, 1);
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    generateGroq({
      ...options(),
      signal: controller.signal,
      fetcher: async () => streamed([chunk({ content: "late" }, "stop")]),
    }),
    { name: "AbortError" },
  );
});

test("the final round forbids new actions, while provider config stays owner-controlled", async () => {
  await generateGroq({
    ...options(),
    job: { ...job, round: 4 },
    fetcher: async (_url, init) => {
      assert.equal(JSON.parse(init?.body as string).tool_choice, "none");
      return streamed([chunk({ content: "Selesai." }, "stop")]);
    },
  });
  const env = (values: Record<string, string>) => (name: string) =>
    values[name];
  assert.equal(
    providerConfig(env({ GEMINI_API_KEY: "gemini" })).generate,
    generateGemini,
  );
  const groq = providerConfig(
    env({ GEMINI_API_KEY: "gemini", GROQ_API_KEY: "groq" }),
  );
  assert.equal(groq.generate, generateGroq);
  assert.equal(groq.model, GROQ_MODEL);
  assert.equal(groq.key, "groq");
  assert.equal(
    providerConfig(env({ BITO_AI_PROVIDER: "gemini", GROQ_API_KEY: "groq" }))
      .generate,
    generateGemini,
  );
  assert.equal(providerConfig(env({ BITO_AI_PROVIDER: "untrusted" })).key, "");
  assert.equal(
    providerConfig(env({ BITO_AI_PROVIDER: "groq", GEMINI_API_KEY: "gemini" }))
      .key,
    "",
  );
});
