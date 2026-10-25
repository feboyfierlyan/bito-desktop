import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDemoReply } from "../electron/demo";

test("demo streams its complete sample and personalizes the name", async () => {
  const chunks: string[] = [];
  const result = await generateDemoReply({
    name: "Boy",
    signal: new AbortController().signal,
    onDelta: (chunk) => chunks.push(chunk),
  });
  assert.equal(chunks.join(""), result);
  assert.ok(chunks.length > 10);
  assert.match(result, /Boy/);
  assert.ok(result.length < 120);
  assert.match(result, /Mau cerita/);
});

test("explicit long-response requests exercise multi-paragraph scrolling", async () => {
  const result = await generateDemoReply({
    name: "Boy",
    text: "tes respons panjang",
    signal: new AbortController().signal,
    onDelta: () => {},
  });
  assert.ok(result.length > 450);
  assert.ok(result.split("\n\n").length >= 4);
});

test("stop cancels the demo before any reply is emitted", async () => {
  const controller = new AbortController();
  const chunks: string[] = [];
  const pending = generateDemoReply({
    name: "",
    signal: controller.signal,
    onDelta: (chunk) => chunks.push(chunk),
  });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.deepEqual(chunks, []);
});
