import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

// Behaviour of the redesigned component set in src/ui/next: keyboard paths,
// accessible names and state, not class names.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://127.0.0.1/",
  pretendToBeVisual: true,
});
const win = dom.window;
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "MutationObserver",
  "SVGElement",
  "getComputedStyle",
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value:
      key === "window" ? win : (win as unknown as Record<string, unknown>)[key],
  });
}
Object.defineProperty(win, "matchMedia", {
  value: (query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }),
});
class TestResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: TestResizeObserver,
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
});
Object.assign(win, { ResizeObserver: TestResizeObserver });

const { createElement: h, act, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const ui = await import("../src/ui/next");

async function mounted(
  element: React.ReactNode,
  run: (host: HTMLElement) => Promise<void> | void,
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(element));
    await run(host);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}

async function typeInto(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    input instanceof win.HTMLTextAreaElement
      ? win.HTMLTextAreaElement.prototype
      : win.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
  await act(async () =>
    input.dispatchEvent(new win.Event("input", { bubbles: true })),
  );
}

const click = (node: Element) =>
  act(async () =>
    node.dispatchEvent(new win.MouseEvent("click", { bubbles: true })),
  );
const press = (node: Element, key: string, init: KeyboardEventInit = {}) =>
  act(async () =>
    node.dispatchEvent(
      new win.KeyboardEvent("keydown", { key, bubbles: true, ...init }),
    ),
  );
const byText = (host: Element, selector: string, text: string) =>
  [...host.querySelectorAll(selector)].find(
    (node) => node.textContent?.trim() === text,
  )!;

test("Button stays a non-submitting button and blocks clicks while loading", async () => {
  let clicks = 0;
  let submits = 0;
  await mounted(
    h(
      "form",
      { onSubmit: () => submits++ },
      h(ui.Button, { onClick: () => clicks++ }, "Ubah"),
      h(ui.Button, { loading: true, onClick: () => clicks++ }, "Menyimpan"),
    ),
    async (host) => {
      const [plain, busy] = host.querySelectorAll("button");
      await click(plain);
      await click(busy);
      assert.equal(clicks, 1);
      assert.equal(submits, 0);
      assert.equal(busy.disabled, true);
      assert.equal(busy.getAttribute("aria-busy"), "true");
    },
  );
});

test("IconButton exposes its label as the accessible name", async () => {
  await mounted(h(ui.IconButton, { label: "Ambil area layar" }), (host) => {
    assert.equal(
      host.querySelector("button")!.getAttribute("aria-label"),
      "Ambil area layar",
    );
  });
});

test("TextField links label and error message to the input", async () => {
  await mounted(
    h(ui.TextField, { label: "Email", error: "Email belum lengkap." }),
    (host) => {
      const input = host.querySelector("input")!;
      assert.equal(host.querySelector("label")!.htmlFor, input.id);
      assert.equal(input.getAttribute("aria-invalid"), "true");
      const error = document.getElementById(
        input.getAttribute("aria-describedby")!,
      )!;
      assert.equal(error.textContent, "Email belum lengkap.");
    },
  );
});

test("Toggle and Checkbox report and flip their checked state", async () => {
  function Demo() {
    const [on, setOn] = useState(false);
    const [done, setDone] = useState(false);
    return h(
      "div",
      null,
      h(ui.Toggle, { checked: on, onChange: setOn, label: "Pengingat" }),
      h(ui.Checkbox, { checked: done, onChange: setDone, label: "Selesai" }),
    );
  }
  await mounted(h(Demo), async (host) => {
    const toggle = host.querySelector('[role="switch"]')!;
    const check = host.querySelector('[role="checkbox"]')!;
    assert.equal(toggle.getAttribute("aria-checked"), "false");
    await click(toggle);
    await click(check);
    assert.equal(toggle.getAttribute("aria-checked"), "true");
    assert.equal(check.getAttribute("aria-checked"), "true");
  });
});

test("Segmented moves with arrow keys, wraps, and keeps one tab stop", async () => {
  const options = [
    { value: "a", label: "Hari ini" },
    { value: "b", label: "Jadwal" },
    { value: "c", label: "Fokus" },
  ];
  function Demo() {
    const [value, setValue] = useState("a");
    return h(ui.Segmented, {
      label: "Tampilan",
      value,
      options,
      onChange: setValue,
    });
  }
  await mounted(h(Demo), async (host) => {
    const group = host.querySelector('[role="radiogroup"]')!;
    const checked = () =>
      host.querySelector('[aria-checked="true"]')!.textContent;
    await press(group, "ArrowLeft");
    assert.equal(checked(), "Fokus");
    await press(group, "ArrowRight");
    assert.equal(checked(), "Hari ini");
    await click(byText(host, "button", "Jadwal"));
    assert.equal(checked(), "Jadwal");
    assert.equal(host.querySelectorAll('button[tabindex="0"]').length, 1);
  });
});

test("Composer sends trimmed text on Enter, not on Shift+Enter, IME or empty", async () => {
  const sent: string[] = [];
  function Demo() {
    const [value, setValue] = useState("");
    return h(ui.Composer, {
      value,
      onChange: setValue,
      onSubmit: (text: string) => sent.push(text),
    });
  }
  await mounted(h(Demo), async (host) => {
    const area = host.querySelector("textarea")!;
    const send = host.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    assert.equal(send.disabled, true);
    await press(area, "Enter");
    await typeInto(area, "   ");
    await press(area, "Enter");
    await typeInto(area, "  halo Bito  ");
    assert.equal(send.disabled, false);
    await press(area, "Enter", { shiftKey: true });
    await press(area, "Enter", { isComposing: true });
    assert.deepEqual(sent, []);
    await press(area, "Enter");
    assert.deepEqual(sent, ["halo Bito"]);
  });
});

test("Composer shows remaining characters near the limit and blocks sending over it", async () => {
  const sent: string[] = [];
  function Demo() {
    const [value, setValue] = useState("");
    return h(ui.Composer, {
      value,
      onChange: setValue,
      onSubmit: (text: string) => sent.push(text),
      maxLength: 10,
    });
  }
  await mounted(h(Demo), async (host) => {
    const area = host.querySelector("textarea")!;
    await typeInto(area, "abc");
    assert.equal(host.querySelector(".bx-composer-count"), null);
    await typeInto(area, "abcdefghi");
    assert.equal(host.querySelector(".bx-composer-count")!.textContent, "1");
    await typeInto(area, "abcdefghijkl");
    assert.equal(host.querySelector(".bx-composer-count")!.textContent, "-2");
    await press(area, "Enter");
    assert.deepEqual(sent, []);
  });
});

test("Thinking toggles its steps and reports expanded state", async () => {
  await mounted(
    h(ui.Thinking, { durationSeconds: 2, steps: ["Membaca lampiran"] }),
    async (host) => {
      const trigger = host.querySelector("button")!;
      const body = document.getElementById(
        trigger.getAttribute("aria-controls")!,
      )!;
      assert.equal(trigger.getAttribute("aria-expanded"), "false");
      assert.equal(body.hasAttribute("inert"), true);
      await click(trigger);
      assert.equal(trigger.getAttribute("aria-expanded"), "true");
      assert.equal(body.hasAttribute("inert"), false);
      assert.match(trigger.textContent!, /Berpikir 2 dtk/);
    },
  );
});

test("StreamingText is a single paragraph that is busy only while streaming", async () => {
  await mounted(
    h(ui.StreamingText, { text: "Mulai dari tiga jurnal", streaming: true }),
    (host) => {
      const p = host.querySelector("p")!;
      assert.equal(p.textContent, "Mulai dari tiga jurnal");
      assert.equal(p.getAttribute("aria-busy"), "true");
    },
  );
  await mounted(
    h(ui.StreamingText, { text: "Selesai", streaming: false }),
    (host) => {
      assert.equal(host.querySelector("p")!.hasAttribute("aria-busy"), false);
      assert.equal(host.querySelector(".bx-stream-caret"), null);
    },
  );
});

test("ToolChip offers retry only when it failed", async () => {
  let retried = 0;
  await mounted(
    h(
      "div",
      null,
      h(ui.ToolChip, { status: "done", label: "Disimpan", onRetry() {} }),
      h(ui.ToolChip, {
        status: "error",
        label: "Gagal",
        onRetry: () => retried++,
      }),
    ),
    async (host) => {
      const buttons = host.querySelectorAll("button");
      assert.equal(buttons.length, 1);
      await click(buttons[0]);
      assert.equal(retried, 1);
    },
  );
});

test("Suggestions shows at most two and returns the picked text", async () => {
  const picked: string[] = [];
  await mounted(
    h(ui.Suggestions, {
      items: ["Satu", "Dua", "Tiga"],
      onPick: (item: string) => picked.push(item),
    }),
    async (host) => {
      const buttons = host.querySelectorAll("button");
      assert.equal(buttons.length, 2);
      await click(buttons[1]);
      assert.deepEqual(picked, ["Dua"]);
    },
  );
});

test("ApprovalCard is a named group and locks every action while busy", async () => {
  const calls: string[] = [];
  const props = {
    title: "Simpan pengingat ini?",
    confirmLabel: "Simpan pengingat",
    onConfirm: () => calls.push("confirm"),
    onCancel: () => calls.push("cancel"),
    onEdit: () => calls.push("edit"),
  };
  await mounted(h(ui.ApprovalCard, props), async (host) => {
    const group = host.querySelector('[role="group"]')!;
    assert.equal(
      document.getElementById(group.getAttribute("aria-labelledby")!)!
        .textContent,
      "Simpan pengingat ini?",
    );
    await click(byText(host, "button", "Batal"));
    await click(byText(host, "button", "Ubah"));
    await click(byText(host, "button", "Simpan pengingat"));
    assert.deepEqual(calls, ["cancel", "edit", "confirm"]);
  });
  await mounted(h(ui.ApprovalCard, { ...props, busy: true }), (host) => {
    for (const button of host.querySelectorAll("button"))
      assert.equal(button.disabled, true);
  });
});

test("RecommendationCard states confidence in words and hides alternatives when unavailable", async () => {
  let accepted = 0;
  await mounted(
    h(ui.RecommendationCard, {
      title: "Kerjakan tabel dulu",
      confidence: "medium",
      acceptLabel: "Jadikan tugas",
      onAccept: () => accepted++,
    }),
    async (host) => {
      assert.match(host.textContent!, /Cukup yakin/);
      assert.equal(host.querySelectorAll('[data-on="true"]').length, 2);
      assert.equal(host.querySelectorAll("button").length, 1);
      await click(byText(host, "button", "Jadikan tugas"));
      assert.equal(accepted, 1);
    },
  );
});

test("InsightCards pages within bounds and renders nothing when empty", async () => {
  await mounted(
    h(ui.InsightCards, {
      title: "Minggu ini",
      insights: [{ text: "Pertama" }, { text: "Kedua" }],
    }),
    async (host) => {
      const prev = host.querySelector<HTMLButtonElement>(
        '[aria-label="Sebelumnya"]',
      )!;
      const next = host.querySelector<HTMLButtonElement>(
        '[aria-label="Berikutnya"]',
      )!;
      assert.equal(prev.disabled, true);
      await click(next);
      assert.match(host.textContent!, /2\/2/);
      assert.match(host.textContent!, /Kedua/);
      assert.equal(next.disabled, true);
      assert.equal(prev.disabled, false);
    },
  );
  await mounted(h(ui.InsightCards, { title: "Kosong", insights: [] }), (host) =>
    assert.equal(host.innerHTML, ""),
  );
});

test("TaskRow names its checkbox after the task and hides the due date once done", async () => {
  const toggled: boolean[] = [];
  await mounted(
    h(
      "div",
      null,
      h(ui.TaskRow, {
        title: "Susun tabel",
        done: false,
        due: "Kamis",
        onToggle: (next: boolean) => toggled.push(next),
      }),
      h(ui.TaskRow, {
        title: "Cari jurnal",
        done: true,
        due: "Rabu",
        onToggle() {},
      }),
    ),
    async (host) => {
      const [open, done] = host.querySelectorAll('[role="checkbox"]');
      assert.equal(
        open.getAttribute("aria-label"),
        "Tandai selesai: Susun tabel",
      );
      assert.equal(
        done.getAttribute("aria-label"),
        "Tandai belum selesai: Cari jurnal",
      );
      assert.equal(host.querySelectorAll(".bx-due").length, 1);
      await click(open);
      assert.deepEqual(toggled, [true]);
    },
  );
});

test("SidebarNav marks the current page and reports selection", async () => {
  const picked: string[] = [];
  await mounted(
    h(ui.SidebarNav, {
      label: "Ruang Kerja",
      current: "today",
      onSelect: (id: string) => picked.push(id),
      items: [
        { id: "today", label: "Hari ini", count: 3 },
        { id: "focus", label: "Fokus" },
      ],
    }),
    async (host) => {
      assert.equal(
        host.querySelector("nav")!.getAttribute("aria-label"),
        "Ruang Kerja",
      );
      const current = host.querySelectorAll('[aria-current="page"]');
      assert.equal(current.length, 1);
      assert.match(current[0].textContent!, /Hari ini/);
      await click(host.querySelectorAll("button")[1]);
      assert.deepEqual(picked, ["focus"]);
    },
  );
});

test("Search filters case-insensitively, moves with arrows, picks with Enter and shows an empty state", async () => {
  const picked: string[] = [];
  await mounted(
    h(ui.Search, {
      items: [
        { id: "1", label: "Cari 3 jurnal" },
        { id: "2", label: "Susun tabel jurnal" },
        { id: "3", label: "Obrolan revisi" },
      ],
      onPick: (item: { label: string }) => picked.push(item.label),
    }),
    async (host) => {
      const input = host.querySelector("input")!;
      const options = () => host.querySelectorAll('[role="option"]');
      assert.equal(options().length, 3);
      await typeInto(input, "JURNAL");
      assert.equal(options().length, 2);
      await press(input, "ArrowDown");
      const active = host.querySelector('[aria-selected="true"]')!;
      assert.equal(active.textContent, "Susun tabel jurnal");
      assert.equal(input.getAttribute("aria-activedescendant"), active.id);
      await press(input, "ArrowDown");
      await press(input, "Enter");
      assert.deepEqual(picked, ["Cari 3 jurnal"]);
      await typeInto(input, "zzz");
      assert.equal(options().length, 0);
      assert.equal(
        host.querySelector('[role="status"]')!.textContent,
        "Tidak ada yang cocok.",
      );
      await press(input, "ArrowDown");
      await press(input, "Enter");
      assert.equal(picked.length, 1);
    },
  );
});

test("SelectionActions appears only with a selection and can clear it", async () => {
  let cleared = 0;
  const actions = [{ label: "Selesai", onClick() {} }];
  await mounted(
    h(ui.SelectionActions, { count: 0, actions, onClear() {} }),
    (host) => assert.equal(host.innerHTML, ""),
  );
  await mounted(
    h(ui.SelectionActions, { count: 2, actions, onClear: () => cleared++ }),
    async (host) => {
      assert.match(
        host.querySelector('[role="toolbar"]')!.textContent!,
        /2 dipilih/,
      );
      await click(host.querySelector('[aria-label="Batalkan pilihan"]')!);
      assert.equal(cleared, 1);
    },
  );
});

test("next tokens are scoped, have a dark theme, and text pairs meet WCAG AA contrast", () => {
  const css = readFileSync(
    new URL("../src/ui/next/tokens.css", import.meta.url),
    "utf8",
  );
  assert.equal(/(^|\n):root\b/.test(css), false);
  const [light, dark] = css.split('[data-bito-ui="next"][data-theme="dark"]');
  assert.ok(dark, "dark theme block missing");
  const read = (block: string) =>
    Object.fromEntries(
      [...block.matchAll(/(--bx-[\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [
        m[1],
        m[2],
      ]),
    );
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const pairs = [
    ["ink", "paper"],
    ["ink-2", "paper"],
    ["ink-3", "paper"],
    ["ink-2", "sunk"],
    ["ink-3", "sunk"],
    ["ink-3", "card"],
    ["on-leaf", "leaf"],
    ["leaf-strong", "leaf-soft"],
    ["blush-ink", "blush-soft"],
    ["danger", "danger-soft"],
  ];
  for (const [name, tokens] of [
    ["light", read(light)],
    ["dark", { ...read(light), ...read(dark) }],
  ] as const)
    for (const [fg, bg] of pairs) {
      const value = ratio(tokens[`--bx-${fg}`], tokens[`--bx-${bg}`]);
      assert.ok(value >= 4.5, `${name} ${fg} on ${bg} = ${value.toFixed(2)}`);
    }
});
