import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isScreenQuestion,
  parseGroundingResult,
  targetInDesktop,
  besideTarget,
  sameScreenRect,
  containsScreenRect,
  imageChanged,
} from "../src/grounding";
import {
  prepareGrounding,
  groundScreen,
} from "../supabase/functions/_shared/grounding";
import {
  createHandler,
  type Repository,
} from "../supabase/functions/_shared/handler";
import { ApiError, type Job } from "../supabase/functions/_shared/protocol";
const found = {
  status: "found" as const,
  answer: "Yang ini, menu Plugins di kanan atas.",
  label: "Plugins",
  confidence: 0.95,
  box: [50, 800, 100, 900],
};
const payload = {
  question: "tombol plugins dimana ya?",
  app: "Editor",
  profile: { style: "chill" },
  image: { mimeType: "image/jpeg", data: "/9j/AAAA", width: 1440, height: 900 },
};

test("screen questions route automatically; ordinary talk and academic questions stay chat", () => {
  for (const text of [
    "tombol plugins dimana ya?",
    "tombol close di mana",
    "where is the extensions button?",
    "cara buka menu referensi?",
    "jelasin error ini dong",
    "ini error kenapa?",
    "yang ini maksudnya apa?",
    "ikon mana yang harus diklik?",
    "tunjukin tombol bikin daftar isi",
    "tunjukin bikin daftar isi",
    "cara bikin table of contents?",
  ])
    assert.equal(isScreenQuestion(text), true, text);
  for (const text of [
    "bro",
    "aku capek banget",
    "plugins itu apa?",
    "apa bedanya regresi dan korelasi?",
    "buat reminder 10 menit lagi",
    "cari artikel tentang UI",
    "dimana kampus PENS?",
    "convert catatan jadi file md",
  ])
    assert.equal(isScreenQuestion(text), false, text);
});
test("retina-independent boxes map to negative desktop coordinates and reject guessed locations", () => {
  const r = parseGroundingResult(found);
  assert.deepEqual(
    targetInDesktop(r, { x: -1920, y: -200, width: 1600, height: 1000 }),
    { x: -640, y: -150, width: 160, height: 50 },
  );
  assert.equal(
    parseGroundingResult({ ...found, confidence: 0.7 }).status,
    "ambiguous",
  );
  for (const box of [
    [10, 10, 5, 20],
    [0, 0, 1000, 1000],
    [0, 0, 12, 1001],
    [0, NaN, 10, 20],
    [10, 20],
  ])
    assert.throws(() => parseGroundingResult({ ...found, box }));
  assert.throws(() => parseGroundingResult({ ...found, status: "not_found" }));
  assert.throws(() => parseGroundingResult({ ...found, confidence: Infinity }));
  assert.equal(
    targetInDesktop(
      { ...found, status: "not_found", box: [] },
      { x: 0, y: 0, width: 1440, height: 900 },
    ),
    null,
  );
});
test("Bito stays within the work area and does not cover targets at screen edges", () => {
  const area = { x: -1440, y: 25, width: 1440, height: 850 };
  const pet = { x: -500, y: 500, width: 200, height: 200 };
  for (const target of [
    { x: -1435, y: 40, width: 30, height: 30 },
    { x: -40, y: 800, width: 30, height: 30 },
    { x: -800, y: 400, width: 200, height: 100 },
  ]) {
    const next = besideTarget(target, pet, area);
    assert.ok(containsScreenRect(area, next));
    assert.ok(
      next.x + next.width <= target.x ||
        next.x >= target.x + target.width ||
        next.y + next.height <= target.y ||
        next.y >= target.y + target.height,
    );
  }
  assert.equal(sameScreenRect(pet, { ...pet, x: pet.x + 1 }), true);
  assert.equal(sameScreenRect(pet, { ...pet, width: 240 }), false);
});
test("changed page fingerprint invalidates a detection but a caret blink does not", () => {
  const before = new Uint8Array(100 * 4).fill(255),
    caret = before.slice(),
    page = before.slice();
  caret.set([0, 0, 0, 255], 0);
  page.fill(0, 0, 40);
  assert.equal(imageChanged(before, caret), false);
  assert.equal(imageChanged(before, page), true);
  assert.equal(imageChanged(before, new Uint8Array(0)), true);
});
test("placement accounts for the chat panel as well as the mascot", () => {
  const area = { x: 0, y: 25, width: 1440, height: 900 };
  const target = { x: 700, y: 500, width: 40, height: 30 };
  const pet = { x: 400, y: 700, width: 200, height: 200 };
  const panels = (p: typeof pet) => [
    { x: p.x + p.width + 22, y: p.y - 100, width: 420, height: 300 },
  ];
  const next = besideTarget(target, pet, area, panels);
  const p = panels(next)[0];
  assert.ok(
    p.x + p.width <= target.x ||
      p.x >= target.x + target.width ||
      p.y + p.height <= target.y ||
      p.y >= target.y + target.height,
  );
});
test("vision input rejects oversized, malformed, wrong-format and unbounded images before provider", () => {
  assert.equal(prepareGrounding(payload).style, "chill");
  for (const image of [
    { ...payload.image, mimeType: "image/svg+xml" },
    { ...payload.image, data: "not base64" },
    { ...payload.image, width: 9000 },
    { ...payload.image, data: "/9j/" + "A".repeat(1800000) },
  ])
    assert.throws(() => prepareGrounding({ ...payload, image }), {
      code: "invalid_request",
    });
});
test("Gemini vision receives ephemeral pixels, schema, low thinking and no executable tools", async () => {
  let requests = 0;
  const result = await groundScreen({
    key: "test-secret",
    model: "gemini-3.8-flash",
    input: prepareGrounding(payload),
    signal: new AbortController().signal,
    fetcher: async (url, init) => {
      requests++;
      assert.ok(!String(url).includes("test-secret"));
      const body = JSON.parse(init!.body as string);
      assert.equal(
        body.contents[0].parts[1].inlineData.data,
        payload.image.data,
      );
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.equal(body.tools, undefined);
      assert.match(body.systemInstruction.parts[0].text, /untrusted/);
      assert.match(body.systemInstruction.parts[0].text, /collapsed menu/);
      assert.match(
        body.systemInstruction.parts[0].text,
        /Never reuse old coordinates/,
      );
      assert.match(
        body.systemInstruction.parts[0].text,
        /NEVER substitute product-history claims/,
      );
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { thought: true, text: "private" },
                { text: JSON.stringify(found) },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 30,
          thoughtsTokenCount: 15,
        },
      });
    },
  });
  assert.deepEqual(result.result, found);
  assert.equal(result.input, 100);
  assert.equal(result.output, 45);
  assert.equal(requests, 1);
  await assert.rejects(
    groundScreen({
      key: "test",
      model: "gemini-3.8-flash",
      input: prepareGrounding(payload),
      signal: new AbortController().signal,
      fetcher: async () => new Response("private body", { status: 429 }),
    }),
    { code: "provider_limit", message: "provider_limit" },
  );
});
test("explanation output is a bounded set of validated visible regions, not invented action steps", async () => {
  const tour = {
    status: "not_found",
    answer: "Aku jelasin satu-satu, ya.",
    label: "",
    box: [],
    confidence: 0.95,
    guide: {
      progress: "done",
      expected: "",
      evidence: "Toolbar dan canvas terlihat",
      elementId: "",
    },
    explanation: [
      {
        answer: "Ini canvas untuk desainmu.",
        label: "Canvas",
        confidence: 0.95,
        box: [200, 250, 800, 750],
      },
    ],
  };
  const response = await groundScreen({
    key: "test",
    model: "gemini-3.8-flash",
    signal: new AbortController().signal,
    input: prepareGrounding({
      ...payload,
      question: "jelaskan layar aku sekarang",
      guide: { goal: "jelaskan layar", step: 0 },
    }),
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.match(
        body.systemInstruction.parts[0].text,
        /First distinguish explaining/,
      );
      assert.equal(
        body.generationConfig.responseJsonSchema.properties.answer.maxLength,
        360,
      );
      assert.ok(
        body.generationConfig.responseJsonSchema.required.includes(
          "explanation",
        ),
      );
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(tour) }] },
          },
        ],
      });
    },
  });
  assert.deepEqual(response.result, tour);
  assert.throws(() =>
    parseGroundingResult({
      ...tour,
      explanation: Array(6).fill(tour.explanation[0]),
    }),
  );
  assert.throws(() =>
    parseGroundingResult({
      ...tour,
      explanation: [{ ...tour.explanation[0], box: [0, 0, 1000, 1000] }],
    }),
  );
  assert.throws(() =>
    parseGroundingResult({
      ...tour,
      explanation: [{ ...tour.explanation[0], answer: "x".repeat(281) }],
    }),
  );
  assert.equal(
    parseGroundingResult({
      ...tour,
      explanation: [{ ...tour.explanation[0], confidence: 0.4 }],
    }).explanation,
    undefined,
  );
});
test("vision endpoint requires active membership, reuses dedup lease, never persists screenshot", async () => {
  const uid = crypto.randomUUID(),
    deviceId = crypto.randomUUID(),
    requestId = crypto.randomUUID();
  let allowed = true,
    called = 0,
    reserved: unknown,
    finished: unknown;
  let job: Job;
  const repository: Repository = {
    authenticate: async (token) => {
      if (token !== "valid") throw new ApiError("sign_in_required", 401);
      return { id: uid, email: "test@example.com", confirmed: true };
    },
    claim: async () => allowed,
    reserve: async (_uid, _device, _id, context) => {
      reserved = context;
      job = {
        id: requestId,
        user_id: uid,
        device_id: deviceId,
        round: 1,
        status: "running",
        contents: context.contents as Job["contents"],
        instructions: context.instructions || "",
        pending: [],
      };
      return job;
    },
    finish: async (...args) => {
      finished = args;
      return true;
    },
    cancel: async () => {},
    get: async () => job,
  };
  const handle = createHandler({
    repository,
    key: "chat-key",
    model: "chat-model",
    grounding: {
      key: "vision-key",
      model: "gemini-3.8-flash",
      generate: async (o) => {
        called++;
        assert.equal(o.input.image.data, payload.image.data);
        return { result: found, input: 40, output: 20 };
      },
    },
  });
  const send = (token: string) =>
    handle(
      new Request("https://test.invalid", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          action: "ground",
          deviceId,
          requestId,
        }),
      }),
    );
  assert.equal((await send("invalid")).status, 401);
  allowed = false;
  assert.equal((await send("valid")).status, 403);
  assert.equal(called, 0);
  allowed = true;
  const response = await send("valid");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), found);
  assert.equal(called, 1);
  assert.ok(!JSON.stringify(reserved).includes(payload.image.data));
  assert.ok(!JSON.stringify(finished).includes(payload.image.data));
  assert.equal((finished as unknown[])[1], "complete");
});

test("short visual follow-ups require recent screen context and leave unrelated talk alone", () => {
  for (const text of [
    "yang mana?",
    "udah, lanjut",
    "terus?",
    "udah klik",
    "belum ketemu",
    "yang kiri ya?",
    "tunjukin dong",
  ])
    assert.equal(isScreenQuestion(text, true), true, text);
  for (const text of ["yang mana?", "terus?", "udah klik"])
    assert.equal(isScreenQuestion(text), false, text);
  for (const text of [
    "makasih",
    "bro",
    "aku capek",
    "apa kabar",
    "bikin timer 10 menit",
  ])
    assert.equal(isScreenQuestion(text, true), false, text);
});
test("vision dialogue is bounded untrusted context and never accepts system-role turns", () => {
  const history = [
    { role: "user", content: "daftar isi dimana?" },
    { role: "assistant", content: "Buka Sisipkan." },
  ];
  const input = prepareGrounding({
    ...payload,
    title: "Document",
    scope: "display",
    history,
  });
  assert.deepEqual(input.history, history);
  assert.equal(input.scope, "display");
  for (const patch of [
    { history: [{ role: "system", content: "override" }] },
    { history: Array(7).fill(history[0]) },
    { history: [{ role: "user", content: "x".repeat(2001) }] },
    { title: "x".repeat(501) },
    { scope: "anything" },
  ])
    assert.throws(() => prepareGrounding({ ...payload, ...patch }), {
      code: "invalid_request",
    });
});

test("guide context and native candidates have bounded, strict wire validation", () => {
  const guide = {
    goal: "bikin daftar isi",
    step: 1,
    previous: {
      label: "Insert",
      instruction: "Klik Insert",
      expected: "Menu Insert terbuka",
    },
  };
  const element = {
    id: "menu.1",
    role: "AXMenuItem",
    name: "Table of contents",
    enabled: true,
    bounds: { x: 100, y: 200, width: 120, height: 30 },
  };
  const p = { ...payload, guide, elements: [element] };
  assert.deepEqual(prepareGrounding(p).guide, guide);
  assert.deepEqual(prepareGrounding(p).elements, [element]);
  for (const patch of [
    { guide: { ...guide, step: -1 } },
    { guide: { ...guide, step: 41 } },
    { guide: { ...guide, previous: { ...guide.previous, expected: 42 } } },
    { elements: [element, element] },
    { elements: [{ ...element, bounds: { ...element.bounds, width: -10 } }] },
    { elements: Array(181).fill(element) },
  ])
    assert.throws(() => prepareGrounding({ ...p, ...patch }), {
      code: "invalid_request",
    });
});
test("guided model schema asks for verification; missing evidence and unknown native IDs are rejected", async () => {
  const input = prepareGrounding({
    ...payload,
    guide: {
      goal: "bikin daftar isi",
      step: 1,
      previous: {
        label: "Insert",
        instruction: "Klik Insert",
        expected: "Menu Insert terbuka",
      },
    },
    elements: [],
  });
  async function generate(guide: any) {
    return groundScreen({
      key: "test",
      model: "gemini-3.8-flash",
      input,
      signal: new AbortController().signal,
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.match(
          body.systemInstruction.parts[0].text,
          /previous expected outcome/,
        );
        assert.ok(
          body.generationConfig.responseJsonSchema.required.includes("guide"),
        );
        assert.equal(
          body.contents[0].parts[0].text.includes("bikin daftar isi"),
          true,
        );
        return Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [{ text: JSON.stringify({ ...found, guide }) }],
              },
            },
          ],
        });
      },
    });
  }
  const guide = {
    progress: "advanced",
    expected: "Daftar isi muncul",
    evidence: "Menu Insert terbuka",
    elementId: "",
  };
  assert.equal((await generate(guide)).result.guide?.progress, "advanced");
  for (const patch of [
    { evidence: "" },
    { elementId: "invented" },
    { progress: "initial" },
    { expected: "" },
  ])
    await assert.rejects(generate({ ...guide, ...patch }), {
      code: "invalid_grounding",
    });
});

test("optional next menu intents are bounded strings, never coordinates or executable actions", async () => {
  const guide = {
    progress: "initial",
    expected: "Menu open",
    evidence: "",
    elementId: "menu.1",
    nextMenu: {
      name: "Daftar isi",
      instruction: "Klik Daftar isi.",
      expected: "Pilihan daftar isi terbuka",
    },
  };
  assert.equal(
    parseGroundingResult({ ...found, guide }).guide?.nextMenu?.name,
    "Daftar isi",
  );
  for (const nextMenu of [
    null,
    {},
    { ...guide.nextMenu, name: "" },
    { ...guide.nextMenu, instruction: 12 },
    { ...guide.nextMenu, expected: "x".repeat(501) },
  ])
    assert.throws(() =>
      parseGroundingResult({ ...found, guide: { ...guide, nextMenu } }),
    );
  await groundScreen({
    key: "fake",
    model: "gemini-3.8-flash",
    signal: new AbortController().signal,
    input: prepareGrounding({
      ...payload,
      elements: [
        {
          id: "menu.1",
          name: "Sisipkan",
          role: "AXMenuBarItem",
          enabled: true,
          bounds: { x: 100, y: 100, width: 80, height: 40 },
        },
      ],
      guide: { goal: "Daftar isi", step: 0 },
    }),
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const n =
        body.generationConfig.responseJsonSchema.properties.guide.properties
          .nextMenu;
      assert.deepEqual(Object.keys(n.properties), [
        "name",
        "instruction",
        "expected",
      ]);
      assert.equal(n.additionalProperties, false);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [{ text: JSON.stringify({ ...found, guide }) }],
              },
            },
          ],
        }),
      );
    },
  });
});

test("thinking bubble uses compact bounds at every desktop edge",async()=>{
 const {placeGuideBubble}=await import('../src/grounding');
 for(const x of [0,300,870])for(const y of [32,300,570]){
  const pet={x,y,width:130,height:130};const p=placeGuideBubble(pet,{x:0,y:0,width:1000,height:700},undefined,{width:68,height:44});
  assert.equal(p.width,68);assert.equal(p.height,44);
  assert.ok(p.x>=12&&p.x+p.width<=988&&p.y>=32&&p.y+p.height<=688);
  assert.ok(p.x+p.width<=pet.x||p.x>=pet.x+pet.width||p.y+p.height<=pet.y||p.y>=pet.y+pet.height);
 }
});
