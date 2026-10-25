import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BUBBLE_SEPARATOR as gap,
  MAX_REPLY_BUBBLES,
  preserveReplyFormatting,
  splitReplyBubbles,
  appendReplyDelta,
  messageBubbleTexts,
  bubblePause,
} from "../src/reply-bubbles";
import { createReplyDelivery } from "../electron/reply-delivery";
import { defaultState } from "../electron/core";
import { Store } from "../electron/store";
import { prepareContext } from "../supabase/functions/_shared/protocol";
import type { Message } from "../src/shared";

test("verbatim documents, tables, and short replies preserve formatting", () => {
  for (const text of [
    "408.",
    "Haii 😄",
    "Selamat pagi, Bapak.\n\nMohon izin bimbingan.\n\nTerima kasih.",
    "|A|B|\n|-|-|\n|1|2|",
    "```js\nconst x = 1;\n\nconsole.log(x);\n```",
  ])
    assert.deepEqual(splitReplyBubbles(text, true, true), [text]);
});

test("bubble boundaries never flash, even when every character arrives in a different network chunk", () => {
  const raw = `Haii 😄\n${gap}\nKabar bagus banget itu!${gap}Gimana ceritanya?`;
  for (let length = 1; length <= raw.length; length++) {
    const parts = splitReplyBubbles(raw.slice(0, length));
    assert.ok(
      parts.every((part) => !part.includes("[[BITO") && !part.includes(gap)),
    );
  }
  assert.deepEqual(splitReplyBubbles(raw, true), [
    "Haii 😄",
    "Kabar bagus banget itu!",
    "Gimana ceritanya?",
  ]);
  assert.deepEqual(splitReplyBubbles(`Selesai.${gap.slice(0, 10)}`, true), [
    "Selesai.",
  ]);
  assert.deepEqual(splitReplyBubbles("Kurung [", true), ["Kurung ["]);
});

test("literal separators inside fenced code and inline code are preserved, not interpreted", () => {
  for (const fence of ["```", "~~~"]) {
    const code = `${fence}txt\n${gap}\n\nIni kode.\n${fence}`;
    assert.deepEqual(splitReplyBubbles(`${code}${gap}Penjelasan`, true), [
      code,
      "Penjelasan",
    ]);
  }
  const inline = `Tulis \`${gap}\` sebagai contoh.`;
  assert.deepEqual(splitReplyBubbles(`${inline}${gap}Oke.`, true), [
    inline,
    "Oke.",
  ]);
});

test("empty and excessive boundaries cannot create empty bubbles or discard content", () => {
  assert.deepEqual(splitReplyBubbles(`${gap}${gap}Hai${gap}${gap}`, true), [
    "Hai",
  ]);
  assert.deepEqual(
    splitReplyBubbles(
      Array.from({ length: MAX_REPLY_BUBBLES + 2 }, (_, i) => String(i)).join(
        gap,
      ),
      true,
    ),
    [
      ...Array.from({ length: MAX_REPLY_BUBBLES - 1 }, (_, i) => String(i)),
      [MAX_REPLY_BUBBLES - 1, MAX_REPLY_BUBBLES, MAX_REPLY_BUBBLES + 1].join(
        "\n\n",
      ),
    ],
  );
});

test("incremental delivery and the UI reducer agree for any chunk size, with one history entry and bounded pauses", async () => {
  const raw = `Halo 👋${gap}Satu ide dulu.\n\nMasih bubble kedua.${gap}Terus kita lanjut.`;
  for (const size of [1, 2, 7, 32, raw.length]) {
    const original: Message = {
      id: randomUUID(),
      role: "assistant",
      text: "",
      createdAt: 1,
    };
    let stored = original,
      ui = original;
    const pauses: number[] = [],
      phases: string[] = [];
    const delivery = createReplyDelivery({
      signal: new AbortController().signal,
      onText: (bubble, delta) => {
        const event = { id: original.id, bubble, delta };
        stored = appendReplyDelta(stored, event);
        ui = appendReplyDelta(ui, event);
      },
      onPhase: (phase) => phases.push(phase),
      wait: async (ms) => {
        pauses.push(ms);
      },
    });
    for (let i = 0; i < raw.length; i += size)
      delivery.push(raw.slice(i, i + size));
    await delivery.finish();
    assert.deepEqual(stored, ui);
    assert.deepEqual(stored.bubbles, splitReplyBubbles(raw, true));
    assert.equal(stored.text, stored.bubbles!.join("\n\n"));
    assert.equal(stored.id, original.id);
    const count = stored.bubbles!.length;
    assert.equal(phases[0], "talking");
    assert.deepEqual(
      phases.slice(1),
      Array.from({ length: count - 1 }, () => ["thinking", "talking"]).flat(),
    );
    assert.equal(pauses.length, count - 1);
    assert.ok(pauses.every((ms) => ms >= 1600 && ms <= 3600));
  }
});

test("stop during the inter-bubble pause keeps delivered text and cancels every queued bubble", async () => {
  const controller = new AbortController();
  const emitted: string[] = [];
  let release!: () => void, started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delivery = createReplyDelivery({
    signal: controller.signal,
    onText: (_, delta) => emitted.push(delta),
    onPhase: () => {},
    wait: async () => {
      started();
      await blocked;
    },
  });
  delivery.push(`Sudah terlihat.${gap}Belum terlihat.${gap}Jangan muncul.`);
  const finish = delivery.finish();
  await waiting;
  controller.abort();
  release();
  await assert.rejects(finish, { name: "AbortError" });
  delivery.push("Teks terlambat");
  assert.equal(emitted.join(""), "Sudah terlihat.");
});

test("reduced motion preserves conversational typing time and malformed deltas do not invent bubbles", async () => {
  const waits: number[] = [];
  const delivery = createReplyDelivery({
    signal: new AbortController().signal,
    reducedMotion: true,
    onText: () => {},
    onPhase: () => {},
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  delivery.push(`Satu${gap}Dua`);
  await delivery.finish();
  assert.ok(waits.length === 1 && waits[0] >= 1600);
  assert.ok(bubblePause("kata ".repeat(1000)) <= 3600);
  const message: Message = {
    id: "a",
    role: "assistant",
    text: "",
    createdAt: 0,
  };
  for (const bubble of [2, -1, MAX_REPLY_BUBBLES, NaN])
    assert.equal(
      appendReplyDelta(message, { id: "a", bubble, delta: "x" }),
      message,
    );
  assert.equal(
    appendReplyDelta(message, { id: "other", bubble: 0, delta: "x" }),
    message,
  );
});

test("bubble grouping survives local persistence and reaches model history as one clean assistant turn", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bito-bubbles-"));
  const store = new Store(join(dir, "bito.sqlite"));
  try {
    const state = defaultState();
    state.messages.push({
      id: randomUUID(),
      role: "assistant",
      text: "Satu\n\nDua",
      bubbles: ["Satu", "Dua"],
      createdAt: 1,
      status: "complete",
    });
    store.save(state);
    const restored = store.load();
    assert.deepEqual(messageBubbleTexts(restored.messages[0]), ["Satu", "Dua"]);
    const context = prepareContext({
      profile: state.profile,
      messages: [
        { role: "user", content: "Hai" },
        ...restored.messages.map((m) => ({ role: m.role, content: m.text })),
        { role: "user", content: "Lanjut" },
      ],
    });
    assert.equal(context.contents.length, 3);
    assert.deepEqual(context.contents[1].parts, [{ text: "Satu\n\nDua" }]);
    assert.ok(context.instructions.length < 12000);
    assert.deepEqual(messageBubbleTexts({ text: "Pesan lama" }), [
      "Pesan lama",
    ]);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("ordinary sentences and paragraphs split without model control tokens, even character by character", async () => {
  const raw = "Who's there?\n\nawas aja klo garing wkwk. 😭 Bercanda kok!";
  const expected = [
    "Who's there?",
    "awas aja klo garing wkwk. 😭",
    "Bercanda kok!",
  ];
  for (const size of [1, 2, 11, raw.length]) {
    let message: Message = {
      id: "reply",
      role: "assistant",
      text: "",
      createdAt: 0,
    };
    const delivery = createReplyDelivery({
      signal: new AbortController().signal,
      onPhase: () => {},
      wait: async () => {},
      onText: (bubble, delta) => {
        message = appendReplyDelta(message, { id: "reply", bubble, delta });
      },
    });
    for (let i = 0; i < raw.length; i += size)
      delivery.push(raw.slice(i, i + size));
    await delivery.finish();
    assert.deepEqual(message.bubbles, expected);
  }
});

test("decimal numbers, abbreviations, URLs, inline code, lists and tables are not chopped", () => {
  for (const text of [
    "Harganya Rp. 2.500 aja.",
    "Tanya Dr. Andi ya.",
    "Buka https://example.test/a.b dulu.",
    "Pakai `console.log(1.2)` ya.",
    "1. Baca ini.\n2. Baru lanjut.",
    "|A|B|\n|-|-|\n|1.2|contoh.|",
    "```js\nconst x = 1;\n\nconsole.log(x);\n```",
  ])
    assert.deepEqual(splitReplyBubbles(text, true), [text]);
  for (const request of [
    "buat email dosen",
    "tulis kode js",
    "satu bubble aja",
    "kasih teks persis siap salin",
  ])
    assert.equal(preserveReplyFormatting(request), true);
  assert.equal(preserveReplyFormatting("bro ada cerita lucu"), false);
});

test("verbatim delivery keeps an email whole even if the model adds separators", async () => {
  let text = "";
  const indices: number[] = [];
  const delivery = createReplyDelivery({
    signal: new AbortController().signal,
    verbatim: true,
    onPhase: () => {},
    wait: async () => {
      throw Error("Unexpected bubble pause");
    },
    onText: (bubble, delta) => {
      indices.push(bubble);
      text += delta;
    },
  });
  delivery.push(`Yth. Bapak.\n\nMohon izin bimbingan.${gap}Terima kasih.`);
  await delivery.finish();
  assert.ok(indices.every((index) => index === 0));
  assert.equal(text, "Yth. Bapak.\n\nMohon izin bimbingan.\n\nTerima kasih.");
});
