import { test } from "node:test";
import assert from "node:assert/strict";
import { readWebSearch, webUrl, withWebCitations } from "../src/web-search";
import { generateGemini } from "../supabase/functions/_shared/gemini";
import type { Job } from "../supabase/functions/_shared/protocol";

const job: Job = {
  id: crypto.randomUUID(),
  user_id: crypto.randomUUID(),
  device_id: crypto.randomUUID(),
  status: "running",
  round: 1,
  pending: [],
  instructions: "Private profile: Ada. Reply in a chill Indonesian voice.",
  contents: [
    { role: "user", parts: [{ text: "Cari pengumuman terbaru PENS" }] },
  ],
};
const source = {
  title: "Pengumuman PENS",
  url: "https://www.pens.ac.id/pengumuman",
};
const evidence = {
  sources: [source],
  queries: ["pengumuman PENS terbaru"],
  suggestions:
    '<a href="https://www.google.com/search?q=PENS">Google Search</a>',
};
const sse = (parts: unknown[], metadata?: unknown) =>
  new Response(
    `data: ${JSON.stringify({ candidates: [{ content: { parts }, finishReason: "STOP", ...(metadata ? { groundingMetadata: metadata } : {}) }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 2 } })}\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
const route = [
  {
    functionCall: {
      name: "search_web",
      id: "search-provider-id",
      args: { query: "pengumuman PENS terbaru" },
    },
    thoughtSignature: "opaque-search",
  },
];
const grounded = {
  webSearchQueries: evidence.queries,
  groundingChunks: [{ web: { title: source.title, uri: source.url } }],
  searchEntryPoint: { renderedContent: evidence.suggestions },
};
const opts = () => ({
  key: "server-secret",
  model: "gemini-3.8-flash",
  job: structuredClone(job),
  signal: new AbortController().signal,
  emit: (_: string) => {},
});

test("ordinary conversation remains a single streaming request without searching status", async () => {
  let count = 0;
  const deltas: string[] = [],
    phases: string[] = [];
  const result = await generateGemini({
    ...opts(),
    onActivity: (p) => phases.push(p),
    emit: (t) => deltas.push(t),
    fetcher: async () => {
      count++;
      return sse([{ text: "apa?" }]);
    },
  });
  assert.equal(count, 1);
  assert.deepEqual(deltas, ["apa?"]);
  assert.deepEqual(phases, []);
  assert.equal(result.search, undefined);
});

test("automatic web tool retrieves only the public query, keeps notes private, and preserves verifiable citations and usage", async () => {
  let count = 0;
  const deltas: string[] = [],
    phases: string[] = [];
  const result = await generateGemini({
    ...opts(),
    onActivity: (p) => phases.push(p),
    emit: (t) => deltas.push(t),
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      count++;
      if (count === 1) {
        assert.ok(
          body.tools[0].functionDeclarations.some(
            (d: any) => d.name === "search_web",
          ),
        );
        return sse(route);
      }
      if (count === 2) {
        assert.deepEqual(body.tools, [{ google_search: {} }]);
        assert.deepEqual(body.contents, [
          { role: "user", parts: [{ text: evidence.queries[0] }] },
        ]);
        assert.doesNotMatch(
          JSON.stringify(body),
          /Private profile|Ada|Cari pengumuman/,
        );
        assert.equal(body.toolConfig, undefined);
        return sse([{ text: "retrieval notes, not a chat answer" }], grounded);
      }
      assert.equal(count, 3);
      assert.ok(
        !body.tools[0].functionDeclarations.some(
          (d: any) => d.name === "search_web",
        ),
      );
      assert.equal(
        body.contents.at(-2).parts[0].thoughtSignature,
        "opaque-search",
      );
      const response = body.contents.at(-1).parts[0].functionResponse;
      assert.equal(response.id, "search-provider-id");
      assert.deepEqual(response.response.sources, [source]);
      assert.match(body.systemInstruction.parts[0].text, /chill Indonesian/);
      return sse([{ text: "ini pengumumannya [1]" }]);
    },
  });
  assert.deepEqual(phases, ["searching", "thinking"]);
  assert.deepEqual(deltas, ["ini pengumumannya [1]"]);
  assert.deepEqual(result.search, evidence);
  assert.equal(result.input, 30);
  assert.equal(result.output, 18);
  assert.equal(result.contents?.length, 4);
  assert.deepEqual(result.calls, []);
});

test("no provider evidence means no made-up successful search or automatic retry", async () => {
  let count = 0;
  const seen: string[] = [];
  await assert.rejects(
    generateGemini({
      ...opts(),
      emit: (t) => seen.push(t),
      fetcher: async () =>
        ++count === 1
          ? sse(route)
          : sse([{ text: "unsupported claim with https://fake.example/" }]),
    }),
    { code: "search_unavailable" },
  );
  assert.equal(count, 2);
  assert.deepEqual(seen, []);
});

test("stop after route prevents retrieval; invalid queries never reach Google", async () => {
  const controller = new AbortController();
  let count = 0;
  await assert.rejects(
    generateGemini({
      ...opts(),
      signal: controller.signal,
      onActivity: () => controller.abort(),
      fetcher: async () => {
        count++;
        return sse(route);
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(count, 1);
  for (const query of ["", " ", "x".repeat(501), 42]) {
    let calls = 0;
    await assert.rejects(
      generateGemini({
        ...opts(),
        fetcher: async () => {
          calls++;
          return sse([
            { functionCall: { name: "search_web", args: { query } } },
          ]);
        },
      }),
      { code: "invalid_tool" },
    );
    assert.equal(calls, 1);
  }
});

test("mixed action requests are deferred, then handed off once after retrieval; search never executes on desktop", async () => {
  let count = 0;
  const reminder = {
    functionCall: {
      name: "create_reminder",
      id: "reminder-one",
      args: { title: "Baca", due: "2026-10-29T12:00:00Z" },
    },
  };
  const result = await generateGemini({
    ...opts(),
    fetcher: async (_url, init) => {
      count++;
      if (count === 1) return sse([...route, reminder]);
      if (count === 2) return sse([{ text: "Evidence" }], grounded);
      const body = JSON.parse(String(init?.body));
      const deferred = body.contents.at(-1).parts[1].functionResponse;
      assert.equal(deferred.name, "create_reminder");
      assert.equal(deferred.response.ok, false);
      assert.equal(deferred.response.deferred, true);
      return sse([reminder]);
    },
  });
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].name, "create_reminder");
  assert.equal(result.parts[0].functionCall?.id, "reminder-one");
});

test("source validation rejects active schemes, credentials, local addresses, malformed and unbounded evidence", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,evil",
    "file:///tmp/a",
    "http://example.com",
    "https://user:pass@example.com/",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://[::1]/",
    "https://a.local/",
    "x".repeat(5000),
  ])
    assert.equal(webUrl(url), undefined);
  assert.equal(readWebSearch({ sources: [source], queries: [] }), undefined);
  assert.equal(
    readWebSearch({ sources: [{ url: "javascript:evil" }], queries: ["q"] }),
    undefined,
  );
  assert.equal(
    readWebSearch({ ...evidence, suggestions: "x".repeat(60001) })?.suggestions,
    undefined,
  );
  assert.equal(
    readWebSearch({ ...evidence, sources: [source, source] })?.sources.length,
    1,
  );
  assert.equal(
    withWebCitations(
      "Info [1]. [9]. `code [1]` [2](https://other.example/)",
      evidence,
    ),
    "Info [1](<https://www.pens.ac.id/pengumuman>). [9]. `code [1]` [2](https://other.example/)",
  );
});
