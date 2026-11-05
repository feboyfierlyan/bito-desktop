import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectedRect,
  validSelection,
  cropPixels,
  areaInputPosition,
} from "../src/area-selection";
import { SelectedAreaContext } from "../electron/selected-area-context";
import {
  prepareGrounding,
  groundScreen,
} from "../supabase/functions/_shared/grounding";
const frame = { width: 1440, height: 900 };
test("selection geometry uses local DIP, handles reverse drags and clamps bounds", () => {
  assert.deepEqual(selectedRect({ x: 700, y: 400 }, { x: 40, y: 20 }, frame), {
    x: 40,
    y: 20,
    width: 660,
    height: 380,
  });
  assert.deepEqual(
    selectedRect({ x: -40, y: -20 }, { x: 1600, y: 1000 }, frame),
    { x: 0, y: 0, ...frame },
  );
  for (const r of [
    { x: 0, y: 0, width: 10, height: 100 },
    { x: 0, y: NaN, width: 100, height: 100 },
    { x: -1, y: 0, width: 100, height: 100 },
    { x: 1430, y: 0, width: 20, height: 100 },
    null,
  ])
    assert.equal(validSelection(r, frame), false);
});
test("crop uses actual bitmap ratio, not retina assumption or global negative display origin", () => {
  const rect = { x: 120, y: 80, width: 300, height: 200 };
  assert.deepEqual(cropPixels(rect, frame, { width: 2880, height: 1800 }), {
    x: 240,
    y: 160,
    width: 600,
    height: 400,
  });
  const negativeDisplay = { x: -1440, y: -200, ...frame };
  assert.deepEqual(
    cropPixels(rect, negativeDisplay, { width: 1800, height: 1125 }),
    { x: 150, y: 100, width: 375, height: 250 },
  );
  assert.deepEqual(
    cropPixels({ x: 1428, y: 880, width: 12 + 0.001, height: 20 }, frame, {
      width: 1800,
      height: 1125,
    }),
    { x: 1785, y: 1100, width: 15, height: 25 },
  );
});
test("composer is placed below or above crop without going outside display", () => {
  assert.deepEqual(
    areaInputPosition({ x: 300, y: 200, width: 400, height: 100 }, frame),
    { x: 320, y: 314, width: 380 },
  );
  const bottom = areaInputPosition(
    { x: 1400, y: 870, width: 40, height: 30 },
    frame,
  );
  assert.ok(bottom.x + bottom.width <= frame.width - 16);
  assert.ok(bottom.y < 870);
  const narrow = areaInputPosition(
    { x: 0, y: 10, width: 100, height: 100 },
    { width: 300, height: 250 },
  );
  assert.equal(narrow.width, 268);
  assert.ok(narrow.x >= 16 && narrow.y >= 16);
});
const area = {
  id: "test",
  capturedAt: 1,
  width: 600,
  height: 400,
  owner: "A",
  image: {
    mimeType: "image/jpeg" as const,
    data: "/9j/AAAA",
    width: 600,
    height: 400,
  },
};
test("selected pixels are memory-only and never in renderer summary; account switch clears context", () => {
  const context = new SelectedAreaContext();
  context.set(area);
  assert.deepEqual(context.summary("A"), {
    id: "test",
    capturedAt: 1,
    width: 600,
    height: 400,
  });
  assert.ok(!JSON.stringify(context.summary("A")).includes("/9j/"));
  assert.equal(context.get("B"), undefined);
  assert.equal(context.get("A"), undefined);
});
test("follow-ups refresh context TTL, summary reads do not; clear and idle expiry release pixels", () => {
  let now = 0;
  const context = new SelectedAreaContext(() => now, 100);
  context.set(area);
  now = 90;
  context.summary("A");
  now = 101;
  assert.equal(context.expire("A"), true);
  context.set(area);
  now = 190;
  assert.ok(context.get("A", true));
  now = 250;
  assert.ok(context.get("A"));
  now = 291;
  assert.equal(context.get("A"), undefined);
  context.set(area);
  context.clear();
  assert.equal(context.summary("A"), undefined);
});
const input = {
  question: "Jelasin rumus ini dong",
  app: "Area pilihan",
  scope: "region",
  profile: { style: "chill" },
  image: area.image,
  history: [
    { role: "user", content: "Apa maksud sigma?" },
    { role: "assistant", content: "Sigma itu penjumlahan." },
  ],
};
test("region input permits follow-up history but cannot request a guide, screen target or tool lease", () => {
  assert.equal(prepareGrounding(input).scope, "region");
  assert.equal(prepareGrounding({ ...input, elements: [] }).history.length, 2);
  for (const patch of [
    { guide: {} },
    { elements: [{}] },
    { toolCallId: "untrusted" },
    { scope: "region;window" },
  ])
    assert.throws(() => prepareGrounding({ ...input, ...patch }));
});
test("selected-image questions get a dedicated visual explanation prompt, no UI-only instructions or tools", async () => {
  const answer = {
    status: "not_found",
    box: [],
    label: "",
    confidence: 1,
    answer: "Sigma artinya menjumlahkan nilai dalam rentang itu.",
  };
  const result = await groundScreen({
    key: "fixture",
    model: "gemini-3.8-flash",
    input: prepareGrounding(input),
    signal: new AbortController().signal,
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const prompt = body.systemInstruction.parts[0].text;
      assert.match(prompt, /frozen snapshot/);
      assert.match(prompt, /untrusted data/);
      assert.ok(!prompt.includes("SCREEN HELP"));
      assert.equal(body.tools, undefined);
      const data = JSON.parse(body.contents[0].parts[0].text);
      assert.equal(data.screenshotScope, "region");
      assert.equal(data.recentDialogue.length, 2);
      assert.equal(body.contents[0].parts[1].inlineData.data, area.image.data);
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(answer) }] },
          },
        ],
      });
    },
  });
  assert.equal(result.result.answer, answer.answer);
});
test("region response cannot accidentally start GUI guide or highlight desktop target", async () => {
  await assert.rejects(
    groundScreen({
      key: "fixture",
      model: "gemini-3.8-flash",
      input: prepareGrounding(input),
      signal: new AbortController().signal,
      fetcher: async () =>
        Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      status: "found",
                      box: [10, 10, 80, 90],
                      label: "button",
                      confidence: 0.99,
                      answer: "klik ini",
                    }),
                  },
                ],
              },
            },
          ],
        }),
    }),
    { code: "invalid_grounding" },
  );
});

test("selected area is consumed once; subsequent messages cannot reuse its pixels",()=>{
  const context=new SelectedAreaContext();context.set(area);
  assert.equal(context.take("A")?.image.data,area.image.data);
  assert.equal(context.summary("A"),undefined);
  assert.equal(context.take("A"),undefined);
});
