import { after, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Mount real Astryx controls: verify Bito's adapters preserve editing and native
// form behaviour, rather than just checking generated markup or class names.
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
  "CustomEvent",
  "DocumentFragment",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "HTMLDialogElement",
  "MutationObserver",
  "SVGElement",
  "ShadowRoot",
  "DOMRect",
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
  CSS: {
    escape: (value: string) =>
      value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`),
  },
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: TestResizeObserver,
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
});
Object.assign(win, { ResizeObserver: TestResizeObserver });
win.scrollTo = () => {};
win.HTMLElement.prototype.scrollIntoView = () => {};
win.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
win.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
  this.dispatchEvent(new win.Event("close"));
};

const { createElement: h, act, useState, createRef } = await import("react");
const { createRoot } = await import("react-dom/client");
const { BitoButton, BitoInput, BitoTextArea, BitoSelect, BitoDateInput } =
  await import("../src/ui/controls");
const { BitoDisclosure } = await import("../src/ui/BitoDisclosure");
const { WorkspaceDialog } = await import("../src/WorkspaceDialog");
const { CheckboxInput } = await import("@astryxdesign/core/CheckboxInput");
const { Switch } = await import("@astryxdesign/core/Switch");
const { AppShell } = await import("@astryxdesign/core/AppShell");

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

test("Astryx button preserves submit, disabled, pointer and native ref contracts", async () => {
  let submitted = 0;
  let blocked = 0;
  const ref = createRef<HTMLButtonElement>();
  await mounted(
    h(
      "form",
      {
        onSubmit: (e: React.FormEvent) => {
          e.preventDefault();
          submitted++;
        },
      },
      h(BitoButton, { ref }, "Simpan"),
      h(
        BitoButton,
        { disabled: true, onClick: () => blocked++ },
        "Tidak tersedia",
      ),
      h(BitoButton, { type: "button" }, "Kembali"),
    ),
    async (host) => {
      const buttons = host.querySelectorAll("button");
      assert.equal(ref.current, buttons[0]);
      await act(async () => buttons[0].click());
      await act(async () => buttons[1].click());
      await act(async () => buttons[2].click());
      assert.equal(submitted, 1);
      assert.equal(blocked, 0);
      assert.equal(buttons[1].disabled, true);
    },
  );
});

test("Astryx text fields keep editable values, composition events and input refs", async () => {
  const ref = createRef<HTMLInputElement>();
  let changes = "";
  let compositions = 0;
  function Form() {
    const [value, setValue] = useState("");
    return h(BitoInput, {
      ref,
      label: "Nama",
      value,
      required: true,
      name: "name",
      onCompositionEnd: () => compositions++,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        changes = e.target.value;
        setValue(changes);
      },
    });
  }
  await mounted(h(Form), async (host) => {
    const input = host.querySelector("input")!;
    assert.equal(ref.current, input);
    assert.equal(input.name, "name");
    assert.equal(input.required, true);
    await typeInto(input, "Bito 🌱");
    await act(async () =>
      input.dispatchEvent(
        new win.CompositionEvent("compositionend", {
          bubbles: true,
          data: "🌱",
        }),
      ),
    );
    assert.equal(changes, "Bito 🌱");
    assert.equal(input.value, "Bito 🌱");
    assert.equal(compositions, 1);
  });
});

test("Astryx textarea keeps native length limit, controlled updates and ref", async () => {
  const ref = createRef<HTMLTextAreaElement>();
  let latest = "";
  function Form() {
    const [value, setValue] = useState("");
    return h(BitoTextArea, {
      ref,
      label: "Catatan",
      value,
      maxLength: 12,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        latest = e.target.value;
        setValue(latest);
      },
    });
  }
  await mounted(h(Form), async (host) => {
    const input = host.querySelector("textarea")!;
    assert.equal(ref.current, input);
    assert.equal(input.maxLength, 12);
    await typeInto(input, "satu\ndua");
    assert.equal(latest, "satu\ndua");
    assert.equal(input.value, latest);
    await typeInto(input, "lebih dari dua belas karakter");
    assert.equal(
      latest,
      "satu\ndua",
      "over-limit changes must not reach saved draft",
    );
  });
});

test("Astryx selector opens options and commits the chosen value", async () => {
  let selected = "todo";
  function Form() {
    const [value, setValue] = useState("todo");
    return h(
      BitoSelect,
      {
        label: "Status tugas",
        value,
        onValueChange: (next: string) => {
          selected = next;
          setValue(next);
        },
      },
      h("option", { value: "todo" }, "Belum mulai"),
      h("option", { value: "done" }, "Selesai"),
    );
  }
  await mounted(h(Form), async (host) => {
    const trigger = host.querySelector<HTMLButtonElement>("[role=combobox]")!;
    assert.ok(trigger);
    await act(async () => trigger.click());
    const options = [
      ...document.querySelectorAll<HTMLElement>("[role=option]"),
    ];
    const done = options.find((option) =>
      option.textContent?.includes("Selesai"),
    );
    assert.ok(done);
    await act(async () => done.click());
    assert.equal(selected, "done");
    assert.match(trigger.textContent ?? "", /Selesai/);
  });
});

test("date control preserves valid ISO dates and rejects impossible persisted dates", async () => {
  await mounted(
    h(BitoDateInput, {
      label: "Tenggat",
      value: "2026-11-06",
      presentation: "native",
    }),
    (host) => {
      const input = host.querySelector<HTMLInputElement>("input")!;
      assert.equal(input.value, "2026-11-06");
    },
  );
  await mounted(
    h(BitoDateInput, {
      label: "Tenggat",
      value: "2026-02-30",
      presentation: "native",
    }),
    (host) => {
      assert.equal(host.querySelector<HTMLInputElement>("input")!.value, "");
    },
  );
});

test("Astryx switches and checkboxes preserve reversible state without form submit", async () => {
  let checked = false;
  let enabled = false;
  let submits = 0;
  function Form() {
    const [done, setDone] = useState(false);
    const [auto, setAuto] = useState(false);
    return h(
      "form",
      {
        onSubmit: (e: React.FormEvent) => {
          e.preventDefault();
          submits++;
        },
      },
      h(CheckboxInput, {
        label: "Tugas selesai",
        value: done,
        onChange: (value) => {
          checked = value;
          setDone(value);
        },
      }),
      h(Switch, {
        label: "Sinkron otomatis",
        value: auto,
        onChange: (value) => {
          enabled = value;
          setAuto(value);
        },
      }),
    );
  }
  await mounted(h(Form), async (host) => {
    const inputs = host.querySelectorAll<HTMLInputElement>("input");
    await act(async () => inputs[0].click());
    assert.equal(checked, true);
    await act(async () => inputs[0].click());
    assert.equal(checked, false);
    await act(async () => inputs[1].click());
    assert.equal(enabled, true);
    assert.equal(submits, 0);
  });
});

test("workspace has one main region and keyboard-accessible disclosure", async () => {
  await mounted(
    h(AppShell, {
      sideNav: h("nav", null, "Proyek"),
      height: "fill",
      contentPadding: 0,
      children: h(
        BitoDisclosure,
        null,
        h("summary", null, "Detail tugas"),
        h("p", null, "Isi detail"),
      ),
    }),
    async (host) => {
      assert.equal(host.querySelectorAll("main,[role=main]").length, 1);
      const trigger = host.querySelector<HTMLButtonElement>("[aria-expanded]")!;
      assert.equal(trigger.getAttribute("aria-expanded"), "false");
      await act(async () => trigger.click());
      assert.equal(trigger.getAttribute("aria-expanded"), "true");
      assert.equal(trigger.type, "button");
      const content = document.getElementById(
        trigger.getAttribute("aria-controls")!,
      );
      assert.match(content?.textContent ?? "", /Isi detail/);
      await act(async () => trigger.click());
      assert.equal(trigger.getAttribute("aria-expanded"), "false");
    },
  );
});

test("workspace dialog supports back, close and native Escape cancellation", async () => {
  let closed = 0;
  let backed = 0;
  await mounted(
    h(WorkspaceDialog, {
      title: "Detail tugas",
      onClose: () => closed++,
      onBack: () => backed++,
      children: h("p", null, "Bahan tugas"),
    }),
    async () => {
      const dialog = document.querySelector("dialog")!;
      assert.ok(dialog.open);
      assert.equal(dialog.getAttribute("aria-label"), "Detail tugas");
      const back = document.querySelector<HTMLButtonElement>(
        "[aria-label='Kembali ke proyek']",
      )!;
      await act(async () => back.click());
      assert.equal(backed, 1);
      await act(async () =>
        dialog.dispatchEvent(new win.Event("cancel", { cancelable: true })),
      );
      assert.equal(closed, 1);
    },
  );
});

// Workspace regressions mount the production components, including Astryx inputs.
const { ProjectGallery, ProjectBoard } = await import("../src/ProjectBoard");
const { newProject } = await import("../src/projects");
const { defaultState } = await import("../electron/core");
const { projectCommand } = await import("../electron/projects");
const { randomUUID } = await import("node:crypto");
function workspaceProject() {
  const p = newProject({
    name: "Essay",
    brief: "Write an essay",
    outcome: "PDF",
    deadline: null,
    availability: "",
  });
  p.status = "active";
  p.plan = {
    id: randomUUID(),
    summary: "Prepare",
    assumptions: [],
    milestones: [
      {
        id: randomUUID(),
        title: "Draft",
        targetDate: null,
        tasks: [
          {
            id: randomUUID(),
            title: "Read sources",
            details: "",
            doneWhen: "",
            estimateMin: 10,
            estimateMax: 15,
            sourceIds: [],
            status: "done",
          },
          {
            id: randomUUID(),
            title: "Write draft",
            details: "",
            doneWhen: "",
            estimateMin: 10,
            estimateMax: 15,
            sourceIds: [],
            status: "todo",
          },
        ],
      },
    ],
  };
  return p;
}
function button(host: ParentNode, label: string) {
  const result = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) =>
      b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
  );
  assert.ok(result, `Button not found: ${label}`);
  return result;
}
test("project directory searches, opens the matching project and explains an unplanned project", async () => {
  const planned = workspaceProject();
  const empty = newProject({
    name: "Kuis",
    brief: "",
    outcome: "",
    deadline: null,
    availability: "",
  });
  let opened = "";
  await mounted(
    h(ProjectGallery, {
      projects: [planned, empty],
      onOpen: (p) => {
        opened = p.id;
      },
      busy: false,
      archives: false,
    }),
    async (host) => {
      assert.match(host.textContent!, /Belum ada rencana/);
      await typeInto(host.querySelector("input")!, "kuis");
      assert.doesNotMatch(host.textContent!, /Essay/);
      await act(async () => button(host, "KuisBelum ada rencana").click());
      assert.equal(opened, empty.id);
      await typeInto(host.querySelector("input")!, "absent");
      assert.match(host.textContent!, /Proyek tidak ditemukan/);
    },
  );
});
test("workspace shows tasks beside calendar and progress and opens project options", async () => {
  const p = workspaceProject();
  const state = {
    ...defaultState(),
    projects: [p],
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
  };
  let details = 0;
  await mounted(
    h(ProjectBoard, {
      project: p,
      state,
      act: async () => ({ ok: true }),
      busy: false,
      onDetails: () => {
        details++;
      },
      onMaterials: () => {},
      onSetup: () => {},
      onWork: () => {},
      onDirty: () => {},
    }),
    async (host) => {
      assert.equal(host.querySelectorAll('input[type="checkbox"]').length, 1);
      assert.ok(host.querySelector('[aria-label="Kalender proyek"]'));
      assert.ok(host.querySelector('[aria-label="Progres proyek"]'));
      assert.equal(host.querySelector('[role="radiogroup"]'), null);
      await act(async () => button(host, "Tampilkan 1 tugas selesai").click());
      assert.equal(host.querySelectorAll('input[type="checkbox"]').length, 2);
      await act(async () => button(host, "Pilihan proyek").click());
      await act(async () => button(document.body, "Detail proyek").click());
      assert.equal(details, 1);
    },
  );
});
test("completion and reopening update the real project state without duplicating tasks", async () => {
  let current = {
    ...defaultState(),
    projects: [workspaceProject()],
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
  };
  function Harness() {
    const [snapshot, setSnapshot] = useState(current);
    return h(ProjectBoard, {
      project: snapshot.projects[0],
      state: snapshot,
      busy: false,
      onDetails: () => {},
      onMaterials: () => {},
      onSetup: () => {},
      onWork: () => {},
      onDirty: () => {},
      act: async (name, payload) => {
        const next = structuredClone(current);
        projectCommand(next, name, payload);
        current = next;
        setSnapshot(next);
        return { ok: true };
      },
    });
  }
  await mounted(h(Harness), async (host) => {
    await act(async () =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    assert.match(host.textContent!, /Semua tugas selesai/);
    assert.equal(
      current.projects[0].plan!.milestones[0].tasks[1].status,
      "done",
    );
    await act(async () => button(host, "Tampilkan 2 tugas selesai").click());
    await act(async () =>
      host
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
        .click(),
    );
    assert.equal(
      current.projects[0].plan!.milestones[0].tasks[1].status,
      "todo",
    );
    assert.equal(current.projects[0].plan!.milestones[0].tasks.length, 2);
    assert.match(host.textContent!, /1 dari 2 tugas selesai/);
  });
});

after(() => dom.window.close());

const { TaskComposer } = await import("../src/TaskComposer");
test("task capture retains input on failure, submits the selected section and guards double submit", async () => {
  const p = workspaceProject();
  let saved = 0,
    calls = 0,
    received: any;
  let release: (value: any) => void = () => {};
  await mounted(
    h(TaskComposer, {
      projects: [p],
      initialProjectId: p.id,
      initialMilestoneId: p.plan!.milestones[0].id,
      onSaved: () => saved++,
      onCancel: () => {},
      act: async (name, payload) => {
        calls++;
        received = { name, payload };
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    }),
    async (host) => {
      const title = host.querySelector<HTMLInputElement>("input")!;
      await typeInto(title, "Review draft");
      await typeInto(host.querySelector("textarea")!, "Check sources");
      await act(async () => button(host, "Tambah tugas").click());
      await act(async () =>
        host
          .querySelector("form")!
          .dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true }),
          ),
      );
      assert.equal(calls, 1);
      await act(async () => release({ ok: false, error: "Tidak tersimpan" }));
      assert.equal(title.value, "Review draft");
      assert.match(host.textContent!, /Tidak tersimpan/);
      assert.equal(saved, 0);
      await act(async () => button(host, "Tambah tugas").click());
      await act(async () => release({ ok: true }));
      assert.equal(saved, 1);
      assert.equal(received.name, "project-task-capture");
      assert.equal(received.payload.milestoneId, p.plan!.milestones[0].id);
      assert.equal(received.payload.details, "Check sources");
    },
  );
});
test("cancelling a populated composer keeps the draft until discard is chosen", async () => {
  let cancelled = 0;
  await mounted(
    h(TaskComposer, {
      projects: [],
      onSaved: () => {},
      onCancel: () => cancelled++,
      act: async () => ({ ok: true }),
    }),
    async (host) => {
      await typeInto(host.querySelector("input")!, "Keep this task");
      await act(async () => button(host, "Batal").click());
      assert.equal(cancelled, 0);
      await act(async () => button(host, "Lanjut edit").click());
      assert.equal(host.querySelector("input")!.value, "Keep this task");
      await act(async () => button(host, "Batal").click());
      await act(async () => button(host, "Abaikan").click());
      assert.equal(cancelled, 1);
    },
  );
});

test("group creation and rename use the real command and keep an empty section available for capture", async () => {
  let current = {
    ...defaultState(),
    projects: [workspaceProject()],
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
  };
  function Harness() {
    const [state, setState] = useState(current);
    return h(ProjectBoard, {
      project: state.projects[0],
      state,
      busy: false,
      onDetails: () => {},
      onMaterials: () => {},
      onSetup: () => {},
      onWork: () => {},
      onDirty: () => {},
      act: async (name, payload) => {
        const next = structuredClone(current);
        const result = projectCommand(next, name, payload);
        current = next;
        setState(next);
        return result;
      },
    });
  }
  await mounted(h(Harness), async (host) => {
    await act(async () => button(host, "Tambah kelompok").click());
    let dialog = document.querySelector<HTMLElement>(
      '.workspace-dialog[aria-label="Tambah kelompok"]',
    )!;
    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="Misalnya, Penyusunan Esai Komparatif"]',
    )!;
    await typeInto(input, "Review tambahan");
    await act(async () => button(dialog, "Tambah kelompok").click());
    assert.ok(
      host.querySelector('[aria-label="Review tambahan"]'),
      document.body.textContent || "",
    );
    assert.equal(current.projects[0].plan!.milestones[1].tasks.length, 0);
    await act(async () =>
      button(host, "Pengaturan kelompok Review tambahan").click(),
    );
    dialog = document.querySelector<HTMLElement>(
      '.workspace-dialog[aria-label="Edit kelompok"]',
    )!;
    await typeInto(
      dialog.querySelector<HTMLInputElement>(
        'input[placeholder="Misalnya, Penyusunan Esai Komparatif"]',
      )!,
      "Review final",
    );
    await act(async () => button(dialog, "Simpan").click());
    assert.ok(host.querySelector('[aria-label="Review final"]'));
    await act(async () => button(host, "Tambah tugas ke Review final").click());
    assert.ok(host.querySelector("form.task-composer"));
  });
});

// CSS belongs to the browser; load the production workspace in this DOM harness.
const { registerHooks } = await import("node:module");
const cssHook = registerHooks({
  load(url, context, next) {
    return url.endsWith(".css")
      ? { format: "module", source: "", shortCircuit: true }
      : next(url, context);
  },
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: win.localStorage,
});
const { ProjectWindow } = await import("../src/ProjectWindow");
cssHook.deregister();

test("workspace has one project creation action and archive browsing never restores or selects it", async () => {
  const active = workspaceProject();
  const archived = workspaceProject();
  archived.name = "Archived essay";
  archived.status = "archived";
  let current = {
    ...defaultState(),
    projects: [active, archived],
    activeProjectId: active.id,
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
  };
  const commands: string[] = [];
  function Harness() {
    const [snapshot, setSnapshot] = useState(current);
    return h(ProjectWindow, {
      state: snapshot,
      act: async (name, payload) => {
        commands.push(name);
        const next = structuredClone(current);
        const result = projectCommand(next, name, payload);
        current = next;
        setSnapshot(next);
        return result;
      },
    });
  }
  await mounted(h(Harness), async (host) => {
    assert.equal(
      [...host.querySelectorAll("button")].filter(
        (b) => b.textContent?.trim() === "Tambah proyek",
      ).length,
      1,
    );
    assert.ok(
      ![...host.querySelectorAll("button")].some(
        (b) => b.textContent?.trim() === "Tambah tugas",
      ),
    );
    await act(async () => button(host, "Tambah proyek").click());
    assert.ok(
      host.querySelector('.workspace-dialog[aria-label="Proyek baru"]'),
    );
    await act(async () => button(host, "Batal").click());
    await act(async () => button(host, "Arsip proyek").click());
    const row = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.includes("Archived essay"),
    )!;
    await act(async () => row.click());
    assert.equal(commands.length, 0, "browsing is read-only");
    assert.equal(
      current.activeProjectId,
      active.id,
      "chat context is unchanged",
    );
    assert.equal(current.projects[1].status, "archived");
    assert.match(host.textContent!, /hanya untuk dilihat/);
    assert.ok(
      [
        ...host.querySelectorAll<HTMLInputElement>(
          ".board-task-row input[type=checkbox]",
        ),
      ].every(
        (input) =>
          input.disabled || input.getAttribute("aria-disabled") === "true",
      ),
      host.querySelector(".board-task-row")?.innerHTML,
    );
    await act(async () => button(host, "Pulihkan proyek").click());
    assert.deepEqual(commands, ["project-status", "project-select"]);
    assert.equal(current.projects[1].status, "active");
    assert.equal(current.activeProjectId, archived.id);
    assert.doesNotMatch(host.textContent!, /hanya untuk dilihat/);
  });
});

test("project board exposes one group creation entry and contextual capture cannot change destination", async () => {
  const p = workspaceProject();
  const state = {
    ...defaultState(),
    projects: [p],
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
  };
  await mounted(
    h(ProjectBoard, {
      project: p,
      state,
      busy: false,
      act: async () => ({ ok: true }),
      onDetails() {},
      onMaterials() {},
      onSetup() {},
      onWork() {},
      onDirty() {},
    }),
    async (host) => {
      const additions = () =>
        [...host.querySelectorAll("button")].filter(
          (b) => b.textContent?.trim() === "Tambah kelompok",
        );
      assert.equal(additions().length, 1);
      await act(async () => button(host, "Pilihan proyek").click());
      assert.equal(
        additions().length,
        1,
        "menu does not repeat group creation",
      );
      await act(async () => button(host, "Pilihan proyek").click());
      await act(async () => button(host, "Tambah tugas ke Draft").click());
      assert.equal(host.querySelector('[aria-label="Proyek tugas"]'), null);
      assert.equal(host.querySelector('[aria-label="Kelompok tugas"]'), null);
      assert.ok(host.querySelector(".task-composer input"));
      assert.ok(host.querySelector("[role=progressbar]"));
      assert.equal(
        host.querySelector(".board-progress-chart svg"),
        null,
        "single/no history uses a truthful progress bar",
      );
    },
  );
});

test("first area drag stages immediately; a fresh capture resets the previous gesture", async()=>{
  const {AreaSelect}=await import("../src/AreaSelectView");
  let frame: (v:any)=>void=()=>{};const submitted:any[]=[];
  (win as any).bitoArea={ready(){},painted(){},cancel(){},onFrame(fn:any){frame=fn;return()=>{}},onClose(){return()=>{}},async submit(payload:any){submitted.push(payload);return {ok:true}}};
  const proto=win.HTMLElement.prototype as any;
  proto.setPointerCapture=()=>{};proto.hasPointerCapture=()=>false;
  await mounted(h(AreaSelect),async host=>{
    const display={session:"first",width:800,height:600,image:"data:image/png;base64,fixture",reducedMotion:true};
    await act(async()=>frame(display));
    const drag=async(type:string,x:number,y:number)=>{
      const event=new win.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});
      Object.defineProperty(event,"pointerId",{value:1});
      await act(async()=>host.querySelector(".area-drag-surface")!.dispatchEvent(event));
    };
    await drag("pointerdown",40,40);await drag("pointerup",240,140);
    assert.equal(submitted.length,1);assert.deepEqual(submitted[0].rect,{x:40,y:40,width:200,height:100});
    assert.equal(submitted[0].question,"");
    await act(async()=>frame({...display,session:"second"}));
    await drag("pointerup",300,300);assert.equal(submitted.length,1);
    await drag("pointerdown",100,100);await drag("pointerup",280,240);
    assert.equal(submitted[1].session,"second");
  });
});
