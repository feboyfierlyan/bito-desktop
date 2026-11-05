import { test } from "node:test";
import assert from "node:assert/strict";
import { generateGemini } from "../supabase/functions/_shared/gemini";
import { generateGroq } from "../supabase/functions/_shared/groq";
import {
  GEMINI_MODEL,
  providerConfig,
} from "../supabase/functions/_shared/provider";
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
  instructions: "Bito",
  pending: [],
  contents: [{ role: "user", parts: [{ text: "bro" }] }],
};
const options = () => ({
  key: "test-server-secret",
  model: GEMINI_MODEL,
  job: structuredClone(job),
  signal: new AbortController().signal,
  emit: (_text: string) => {},
});
const streamed = (chunks: unknown[]) =>
  new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
const candidate = (parts: unknown[], finishReason = "STOP") => ({
  candidates: [{ content: { role: "model", parts }, finishReason }],
});

test("Gemini 3.8 defaults even with both keys; only owner can choose Qwen", () => {
  const env = (values: Record<string, string>) => (name: string) =>
    values[name];
  const config = providerConfig(
    env({ GEMINI_API_KEY: "gemini", GROQ_API_KEY: "groq" }),
  );
  assert.equal(config.model, "gemini-3.8-flash");
  assert.equal(config.key, "gemini");
  assert.equal(config.generate, generateGemini);
  assert.equal(
    providerConfig(env({ BITO_AI_PROVIDER: "groq", GROQ_API_KEY: "groq" }))
      .generate,
    generateGroq,
  );
  assert.equal(providerConfig(env({ GROQ_API_KEY: "groq" })).key, "");
});

test("Flash streams only answer text, preserves bubble markers, and bills thinking in usage", async () => {
  const seen: string[] = [];
  const result = await generateGemini({
    ...options(),
    emit: (text) => seen.push(text),
    fetcher: async (url, init) => {
      assert.equal(
        url,
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse",
      );
      assert.equal(
        new Headers(init?.headers).get("x-goog-api-key"),
        "test-server-secret",
      );
      assert.ok(!String(url).includes("test-server-secret"));
      const body = JSON.parse(init?.body as string);
      assert.match(body.systemInstruction.parts[0].text, /^Bito/);
      assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "low");
      assert.equal(body.generationConfig.maxOutputTokens, 4096);
      for (const key of ["temperature", "topP", "topK", "thinkingBudget"]) {
        assert.equal(body.generationConfig[key], undefined);
      }
      return streamed([
        candidate(
          [
            {
              text: "private reasoning",
              thought: true,
              thoughtSignature: "opaque",
            },
          ],
          "",
        ),
        candidate([{ text: "wkwk[[BITO_BUBBLE]]awas aja klo garing" }]),
        {
          usageMetadata: {
            promptTokenCount: 22,
            candidatesTokenCount: 10,
            thoughtsTokenCount: 154,
          },
        },
        { usageMetadata: { promptTokenCount: 22 } },
      ]);
    },
  });
  assert.deepEqual(seen, ["wkwk[[BITO_BUBBLE]]awas aja klo garing"]);
  assert.equal(result.text, seen.join(""));
  assert.equal(result.input, 22);
  assert.equal(result.output, 164);
  assert.equal(result.parts[0].thoughtSignature, "opaque");
});

test("tool result resumes with the provider call ID and opaque thought signature", async () => {
  const part = {
    functionCall: {
      name: "create_reminder",
      id: "provider-call-1",
      args: { title: "Makan", due: "2026-10-26T18:00:00+07:00" },
    },
    thoughtSignature: "opaque-signature",
  };
  const result = await generateGemini({
    ...options(),
    fetcher: async () => streamed([candidate([part])]),
  });
  assert.equal(result.calls.length, 1);
  assert.match(result.calls[0].id, /^[0-9a-f-]{36}$/);
  const resumed = appendResults(
    {
      ...job,
      pending: result.calls,
      contents: [...job.contents, { role: "model", parts: result.parts }],
    },
    [{ id: result.calls[0].id, ok: true, result: "Saved" }],
  );
  assert.equal(
    resumed.at(-1)?.parts[0].functionResponse?.id,
    "provider-call-1",
  );
  assert.equal(resumed[1].parts[0].thoughtSignature, "opaque-signature");
  await generateGemini({
    ...options(),
    job: { ...job, round: 2, contents: resumed },
    fetcher: async (_url, init) => {
      assert.deepEqual(JSON.parse(init?.body as string).contents, resumed);
      return streamed([candidate([{ text: "okee, udah" }])]);
    },
  });
});

test("unfinished, malformed or final-round tool calls cannot execute", async () => {
  for (const args of [null, [], "bad"]) {
    await assert.rejects(
      generateGemini({
        ...options(),
        fetcher: async () =>
          streamed([candidate([{ functionCall: { name: "add_task", args } }])]),
      }),
      { code: "invalid_tool" },
    );
  }
  await assert.rejects(
    generateGemini({
      ...options(),
      job: { ...job, round: 4 },
      fetcher: async (_url, init) => {
        assert.equal(
          JSON.parse(init?.body as string).toolConfig.functionCallingConfig
            .mode,
          "NONE",
        );
        return streamed([
          candidate([{ functionCall: { name: "add_task", args: {} } }]),
        ]);
      },
    }),
    { code: "invalid_tool" },
  );
  for (const finish of ["MAX_TOKENS", ""]) {
    await assert.rejects(
      generateGemini({
        ...options(),
        fetcher: async () =>
          streamed([candidate([{ text: "partial" }], finish)]),
      }),
      { code: finish ? "response_limit" : "incomplete_response" },
    );
  }
});

test("provider failures are not retried or silently switched; aborted calls never start", async () => {
  for (const [status, code] of [
    [429, "provider_limit"],
    [401, "provider_error"],
    [500, "provider_error"],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      generateGemini({
        ...options(),
        fetcher: async () => {
          calls++;
          return new Response("private provider response", { status });
        },
      }),
      { code, message: code },
    );
    assert.equal(calls, 1);
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    generateGemini({
      ...options(),
      signal: controller.signal,
      fetcher: async () => {
        throw new Error("must not fetch");
      },
    }),
    { name: "AbortError" },
  );
});
