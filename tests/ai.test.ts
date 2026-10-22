import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { generateReply } from "../electron/ai";
async function mock(handler: (body: any, res: ServerResponse) => void) {
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push(body);
    res.setHeader("Content-Type", "text/event-stream");
    handler(body, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
const event = (res: ServerResponse, data: unknown) =>
  res.write(`data: ${JSON.stringify(data)}\n\n`);
test("streams text and passes successful tool results into the next response, with storage disabled", async () => {
  let round = 0;
  const calls: string[] = [];
  const chunks: string[] = [];
  const server = await mock((body, res) => {
    if (round++ === 0) {
      event(res, {
        type: "response.completed",
        response: {
          id: "r1",
          output: [
            {
              type: "function_call",
              call_id: "c1",
              name: "start_focus",
              arguments: '{"minutes":15}',
            },
          ],
        },
      });
    } else {
      event(res, { type: "response.output_text.delta", delta: "Aku temani " });
      event(res, { type: "response.output_text.delta", delta: "15 menit." });
      event(res, {
        type: "response.completed",
        response: { id: "r2", output: [] },
      });
    }
    res.end();
  });
  try {
    const text = await generateReply({
      apiKey: "local-test-only",
      baseURL: server.url,
      model: "test",
      instructions: "Test",
      history: [{ role: "user", content: "Focus" }],
      tools: [],
      signal: new AbortController().signal,
      onDelta: (s) => chunks.push(s),
      executeTool: (name, args) => {
        calls.push(name);
        assert.deepEqual(args, { minutes: 15 });
        return "Timer started";
      },
    });
    assert.equal(text, "Aku temani 15 menit.");
    assert.equal(chunks.length, 2);
    assert.deepEqual(calls, ["start_focus"]);
    assert.ok(server.requests.every((r) => r.store === false));
    assert.equal(server.requests[1].input.at(-1).output, "Timer started");
  } finally {
    await server.close();
  }
});
test("cancellation stops a pending response rather than leaving the app busy", async () => {
  const server = await mock((_body, res) => {
    event(res, { type: "response.output_text.delta", delta: "Awal" });
  });
  const controller = new AbortController();
  try {
    await assert.rejects(
      generateReply({
        apiKey: "local-test-only",
        baseURL: server.url,
        model: "test",
        instructions: "Test",
        history: [],
        tools: [],
        signal: controller.signal,
        onDelta: () => controller.abort(),
        executeTool: () => "",
      }),
    );
    assert.equal(controller.signal.aborted, true);
  } finally {
    await server.close();
  }
});
test("a broken stream is an error, never a fabricated successful answer", async () => {
  const server = await mock((_body, res) => {
    event(res, { type: "response.output_text.delta", delta: "Sebagian" });
    res.end();
  });
  try {
    await assert.rejects(
      generateReply({
        apiKey: "local-test-only",
        baseURL: server.url,
        model: "test",
        instructions: "Test",
        history: [],
        tools: [],
        signal: new AbortController().signal,
        onDelta: () => {},
        executeTool: () => "",
      }),
      /Koneksi terputus/,
    );
  } finally {
    await server.close();
  }
});
