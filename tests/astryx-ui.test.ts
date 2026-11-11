import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Mount real Astryx controls: verify Bito's adapters preserve editing and native
// form behaviour, rather than just checking generated markup or class names.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://127.0.0.1/",
  pretendToBeVisual: true,
});
const win = dom.window;
beforeEach(() => win.localStorage.clear());
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
    matches:
      !process.env.BITO_TEST_FULL_MOTION &&
      query.includes("prefers-reduced-motion"),
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
const { ProjectBoard } = await import("../src/ProjectBoard");
const { ProjectGallery } = await import("../src/ProjectGallery");
const { WorkspaceTasks } = await import("../src/WorkspaceTasks");
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
      name: "Raka",
      onCreate: () => {},
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
      assert.doesNotMatch(
        host.querySelector(".workspace-project-results")!.textContent!,
        /Essay/,
      );
      await act(async () => button(host, "Buka proyek Kuis").click());
      assert.equal(opened, empty.id);
      await typeInto(host.querySelector("input")!, "absent");
      assert.match(host.textContent!, /Belum ada yang cocok/);
    },
  );
});
test("an empty workspace explains the flow and exposes a direct create action", async () => {
  let created = 0;
  await mounted(
    h(WorkspaceTasks, {
      onAllProjects() {},
      state: {
        ...defaultState(),
        hasKey: false,
        busy: false,
        chatOpen: false,
        dragging: false,
        projects: [],
      },
      act: async () => ({ ok: true }),
      onDirty: () => {},
      busy: false,
      onProject: () => assert.fail("No project exists"),
      onCreate: () => {
        created++;
      },
    }),
    async (host) => {
      assert.equal(host.querySelector("input"), null);
      assert.match(host.textContent!, /Belum ada tugas untuk hari ini/);
      await act(async () => button(host, "Atau buat proyek").click());
      assert.equal(created, 1);
    },
  );
});
test("directory filters recover from an empty result and next-step action opens the real project", async () => {
  const planned = workspaceProject();
  const done = workspaceProject();
  done.name = "Finished";
  done.status = "completed";
  let opened = "";
  await mounted(
    h(ProjectGallery, {
      projects: [planned, done],
      activeId: planned.id,
      name: "Raka",
      busy: false,
      archives: false,
      onOpen: (p) => {
        opened = p.id;
      },
      onCreate: () => assert.fail("An existing work item should open"),
    }),
    async (host) => {
      await act(async () => button(host, "Buka proyek Essay").click());
      assert.equal(opened, planned.id);
      await act(async () => button(host, "Selesai").click());
      const results = host.querySelector(".workspace-project-results")!;
      assert.match(results.textContent!, /Finished/);
      assert.doesNotMatch(results.textContent!, /Essay/);
      await typeInto(host.querySelector("input")!, "absent");
      assert.match(results.textContent!, /Belum ada yang cocok/);
      await act(async () => button(host, "Tampilkan semua").click());
      assert.equal(host.querySelector("input")!.value, "");
      assert.equal(document.activeElement, host.querySelector("input"));
      assert.match(results.textContent!, /Essay/);
      assert.match(results.textContent!, /Finished/);
      assert.equal(
        host.querySelector('.workspace-result-status[role="status"]')
          ?.textContent,
        "2 proyek",
      );
      const card = button(host, "Buka proyek Finished");
      const descriptions = card.getAttribute("aria-describedby")!.split(" ");
      assert.ok(descriptions.every((id) => document.getElementById(id)));
      await typeInto(host.querySelector("input")!, "Essay");
      await act(async () => button(host, "Hapus pencarian").click());
      assert.equal(document.activeElement, host.querySelector("input"));
    },
  );
});
test("workspace continuation displays the latest checkpoint instead of an obsolete session objective", async () => {
  const p = workspaceProject();
  const task = p.plan!.milestones[0].tasks[0];
  task.status = "doing";
  p.sessions = [
    {
      id: "session",
      taskId: task.id,
      taskTitle: task.title,
      objective: "Tujuan lama",
      minutes: 15,
      phase: "paused",
      startedAt: 1,
      resumedAt: null,
      elapsedMs: 1000,
      endedAt: null,
    },
  ];
  p.checkpoint = {
    taskId: task.id,
    lastStop: "Bagian pertama",
    nextStep: "Periksa bagian kedua",
    blocker: "",
    updatedAt: 2,
  };
  await mounted(
    h(WorkspaceTasks, {
      onAllProjects() {},
      state: {
        ...defaultState(),
        hasKey: false,
        busy: false,
        chatOpen: false,
        dragging: false,
        projects: [p],
      },
      act: async () => ({ ok: true }),
      onDirty: () => {},
      busy: false,
      onCreate: () => {},
      onProject: () => {},
    }),
    async (host) => {
      assert.equal(
        host.querySelector(".workspace-focus h3")?.textContent,
        "Periksa bagian kedua",
      );
      assert.ok(button(host, "Lanjutkan"));
    },
  );
});
test("a blocked workspace opens its existing plan for review instead of asking for another project", async () => {
  const p = workspaceProject();
  for (const milestone of p.plan!.milestones)
    for (const task of milestone.tasks) task.status = "blocked";
  let opened = "";
  await mounted(
    h(WorkspaceTasks, {
      onAllProjects() {},
      state: {
        ...defaultState(),
        hasKey: false,
        busy: false,
        chatOpen: false,
        dragging: false,
        projects: [p],
      },
      act: async () => ({ ok: true }),
      onDirty: () => {},
      busy: false,
      onCreate: () => assert.fail("Blocked work still needs a review path"),
      onProject: (project) => {
        opened = project.id;
      },
    }),
    async (host) => {
      assert.match(host.textContent!, /Terhambat|terhambat/);
      await act(async () => button(host, `Tinjau proyek ${p.name}`).click());
      assert.equal(opened, p.id);
    },
  );
});
test("workspace keeps tasks central, moves calendar out and preserves project options", async () => {
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
      assert.equal(host.querySelector('[aria-label="Kalender proyek"]'), null);
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
      [...host.querySelectorAll(".task-group-toggle")].some((el) =>
        el.textContent?.includes("Review tambahan"),
      ),
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
    assert.ok(
      [...host.querySelectorAll(".task-group-toggle")].some((el) =>
        el.textContent?.includes("Review final"),
      ),
    );
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

test("project task details stay in the context rail and protect drafts when switching tasks", async () => {
  const project = workspaceProject();
  const group = project.plan!.milestones[0];
  group.tasks.push({
    ...group.tasks[1],
    id: randomUUID(),
    title: "Review draft",
  });
  const state = {
    ...defaultState(),
    projects: [project],
    activeProjectId: project.id,
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
  };
  state.settings.reducedMotion = true;
  await mounted(
    h(ProjectBoard, {
      project,
      state,
      busy: false,
      act: async () => ({ ok: true }),
      onDirty() {},
      onDetails() {},
      onMaterials() {},
      onWork() {},
      onSetup() {},
    }),
    async (host) => {
      const rows = () =>
        host.querySelectorAll<HTMLButtonElement>(".workspace-task-open");
      await act(async () => rows()[0].click());
      await waitForUi(
        () =>
          !!host.querySelector(".workspace-context-column .task-detail-column"),
      );
      assert.equal(host.querySelectorAll(".workspace-dialog[open]").length, 0);
      await act(async () => button(host, "Edit tugas").click());
      const input = host.querySelector<HTMLInputElement>(
        ".task-detail-column input",
      )!;
      await typeInto(input, "Keep my draft");
      await act(async () => rows()[1].click());
      assert.ok(host.querySelector(".task-switch-confirm"));
      assert.equal(input.value, "Keep my draft");
      await act(async () => button(host, "Lanjut mengedit").click());
      assert.ok(host.contains(input));
      await act(async () => button(host, "Tutup kolom kanan").click());
      await act(async () => button(host, "Abaikan perubahan").click());
      assert.equal(
        host
          .querySelector(".workspace-task-columns")
          ?.getAttribute("data-insights"),
        "false",
      );
      await act(async () => button(host, "Buka ringkasan").click());
      await waitForUi(() => !!host.querySelector(".workspace-insights"));
      assert.equal(host.querySelector(".insights-scope")?.textContent, "Essay");
      assert.doesNotMatch(
        host.querySelector(".workspace-insights")!.textContent!,
        /Progres per proyek/,
      );
      const toggle =
        host.querySelector<HTMLButtonElement>(".task-group-toggle")!;
      const contents = document.getElementById(
        toggle.getAttribute("aria-controls")!,
      )!;
      await act(async () => toggle.click());
      assert.equal(contents.getAttribute("aria-hidden"), "true");
      assert.ok(contents.hasAttribute("inert"));
      await act(async () => toggle.click());
      assert.equal(contents.getAttribute("aria-hidden"), "false");
    },
  );
});

test(
  "project checklist waits for persistence and keeps the check visible before its animated exit",
  { skip: !process.env.BITO_TEST_FULL_MOTION },
  async () => {
    let current = {
      ...defaultState(),
      projects: [workspaceProject()],
      hasKey: false,
      busy: false,
      chatOpen: false,
      dragging: false,
    };
    current.settings.reducedMotion = false;
    let resolveSave!: () => void;
    const saved = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    let calls = 0;
    function Harness() {
      const [snapshot, setSnapshot] = useState(current);
      return h(ProjectBoard, {
        project: snapshot.projects[0],
        state: snapshot,
        busy: false,
        onDirty() {},
        onDetails() {},
        onMaterials() {},
        onWork() {},
        onSetup() {},
        act: async (name, payload) => {
          calls++;
          await saved;
          const next = structuredClone(current);
          const result = projectCommand(next, name, payload);
          current = next;
          setSnapshot(next);
          return result;
        },
      });
    }
    await mounted(h(Harness), async (host) => {
      const row = host.querySelector<HTMLElement>(".workspace-task-row")!;
      const check = row.querySelector<HTMLInputElement>(
        "input[type=checkbox]",
      )!;
      await act(async () => {
        check.click();
        check.click();
      });
      assert.equal(calls, 1);
      assert.equal(row.dataset.checked, "false");
      await act(async () => resolveSave());
      assert.equal(row.dataset.checked, "true");
      assert.equal(row.dataset.completing, "true");
      assert.ok(row.isConnected);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 240));
      });
      assert.ok(row.isConnected);
      await waitForUi(
        () => !row.isConnected || !!row.closest(".task-row-motion[inert]"),
        1200,
      );
      assert.equal(
        current.projects[0].plan!.milestones[0].tasks[1].status,
        "done",
      );
      assert.equal(calls, 1);
    });
  },
);

test("schedule shares the task shell and keeps task details inline with guarded date changes", async () => {
  const { WorkspaceSchedule } = await import("../src/WorkspaceSchedule");
  const { localDateKey } = await import("../src/project-board");
  const project = workspaceProject();
  const today = localDateKey(new Date());
  project.plan!.milestones[0].targetDate = today;
  const state = {
    ...defaultState(),
    projects: [project],
    activeProjectId: project.id,
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
  };
  state.settings.reducedMotion = true;
  await mounted(
    h(WorkspaceSchedule, {
      state,
      busy: false,
      act: async () => ({ ok: true }),
      onDirty: () => {},
      onProject: () => {},
    }),
    async (host) => {
      assert.ok(
        host.querySelector(
          ".workspace-task-columns .workspace-tasks .tasks-page-header",
        ),
      );
      assert.ok(host.querySelector('[aria-label="Agenda tanggal terpilih"]'));
      assert.equal(host.querySelectorAll(".schedule-cell").length, 42);
      await act(async () => button(host, "Minggu").click());
      assert.equal(host.querySelectorAll(".schedule-cell").length, 7);
      const openTask = [
        ...host.querySelectorAll<HTMLButtonElement>(".schedule-event"),
      ].find((b) => b.textContent?.includes("Write draft"))!;
      await act(async () => openTask.click());
      await waitForUi(() => !!host.querySelector(".task-detail-column"));
      assert.ok(
        host.querySelector(".workspace-context-column .task-detail-column"),
      );
      assert.equal(
        host.querySelectorAll("dialog[open], .workspace-dialog-backdrop")
          .length,
        0,
        "details never cover calendar",
      );
      await act(async () => button(host, "Edit tugas").click());
      const editor = host.querySelector<HTMLInputElement>(
        ".task-detail-column input",
      )!;
      await typeInto(editor, "Keep schedule draft");
      await act(async () => button(host, "Bulan").click());
      assert.equal(host.querySelector(".task-detail-column input"), editor);
      const date = [
        ...host.querySelectorAll<HTMLButtonElement>(".schedule-date"),
      ].find((b) => b.getAttribute("aria-pressed") !== "true")!;
      await act(async () => date.click());
      assert.ok(host.querySelector(".task-switch-confirm"));
      assert.equal(editor.value, "Keep schedule draft");
      await act(async () => button(host, "Lanjut mengedit").click());
      assert.equal(host.querySelector(".task-switch-confirm"), null);
      await act(async () => button(host, "Tutup kolom kanan").click());
      await act(async () => button(host, "Abaikan perubahan").click());
      assert.equal(
        host
          .querySelector(".workspace-task-columns")!
          .getAttribute("data-insights"),
        "false",
      );
      await act(async () => button(host, "Buka agenda").click());
      await waitForUi(
        () => !!host.querySelector('[aria-label="Agenda tanggal terpilih"]'),
      );
      assert.equal(
        host
          .querySelector(".schedule-date[aria-pressed=true]")
          ?.getAttribute("aria-current"),
        "date",
        "discarded navigation did not change selected day",
      );
      await act(async () =>
        button(host, "Bulan").dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Home", bubbles: true }),
        ),
      );
      assert.equal(
        button(host, "Minggu").getAttribute("aria-selected"),
        "true",
      );
      assert.equal(document.activeElement, button(host, "Minggu"));
    },
  );
});

test("one Tasks destination preserves the summary and detail editor across views and restores preferences", async () => {
  const project = workspaceProject();
  const { localDateKey } = await import("../src/project-board");
  const today = localDateKey(new Date());
  project.plan!.milestones[0].targetDate = today;
  const state = {
    ...defaultState(),
    projects: [project],
    activeProjectId: project.id,
    tasks: [
      { id: "later", title: "Future task", done: false, dueDate: "2099-01-01" },
    ],
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
  };
  state.settings.reducedMotion = true;
  const render = () =>
    h(ProjectWindow, { state, act: async () => ({ ok: true }) });
  await mounted(render(), async (host) => {
    const nav = host.querySelector('[aria-label="Halaman workspace"]')!;
    assert.equal(
      nav.querySelectorAll("button").length,
      2,
      "only Tasks and Schedule remain",
    );
    const todayTab = button(host, "Hari ini"),
      allTab = button(host, "Semua");
    assert.equal(todayTab.getAttribute("aria-selected"), "true");
    assert.doesNotMatch(
      host.querySelector(".workspace-task-list")!.textContent!,
      /Future task/,
    );
    const summary = host.querySelector(".workspace-insights");
    await act(async () => allTab.click());
    assert.equal(
      host.querySelector(".workspace-insights"),
      summary,
      "tab change does not remount summary",
    );
    assert.match(
      host.querySelector(".workspace-task-list")!.textContent!,
      /Future task/,
    );
    const search = host.querySelector<HTMLInputElement>(
      ".workspace-task-search input",
    )!;
    await typeInto(search, "Future");
    await act(async () => todayTab.click());
    assert.match(
      host.querySelector(".workspace-task-list")!.textContent!,
      /Write draft/,
      "hidden search cannot filter Today",
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".workspace-task-open")!.click(),
    );
    await waitForUi(() => !!host.querySelector(".task-detail-column"));
    await act(async () => button(host, "Edit tugas").click());
    const editor = host.querySelector<HTMLInputElement>(
      ".task-detail-column input",
    )!;
    await typeInto(editor, "Keep this draft");
    await act(async () => allTab.click());
    assert.equal(host.querySelector(".task-detail-column input"), editor);
    assert.equal(editor.value, "Keep this draft");
    // Leave the editor through the existing discard guard, then close the summary.
    await act(async () => button(host, "Tutup kolom kanan").click());
    assert.ok(host.querySelector(".task-switch-confirm"));
    await act(async () => button(host, "Abaikan perubahan").click());
    assert.equal(
      host
        .querySelector(".workspace-task-columns")!
        .getAttribute("data-insights"),
      "false",
    );
    await act(async () => todayTab.click());
    assert.equal(
      host
        .querySelector(".workspace-task-columns")!
        .getAttribute("data-insights"),
      "false",
    );
    await act(async () => {
      todayTab.focus();
      todayTab.dispatchEvent(
        new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    assert.equal(document.activeElement, allTab);
    assert.equal(allTab.getAttribute("aria-selected"), "true");
    assert.equal(win.localStorage.getItem("bito-task-view"), "all");
    assert.equal(win.localStorage.getItem("bito-task-panel-open"), "false");
  });
  await mounted(render(), async (host) => {
    assert.equal(button(host, "Semua").getAttribute("aria-selected"), "true");
    assert.equal(
      button(host, "Buka ringkasan").getAttribute("aria-expanded"),
      "false",
    );
    await act(async () => button(host, "Buka ringkasan").click());
    await waitForUi(() => !!host.querySelector(".workspace-insights"));
    assert.match(
      host.querySelector(".insights-scope")!.textContent!,
      /Ringkasan semua tugas/,
    );
  });
});

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
        (b) => b.getAttribute("aria-label") === "Tambah proyek",
      ).length,
      1,
    );
    assert.ok(
      [...host.querySelectorAll("button")].some(
        (b) => b.textContent?.trim() === "Tambah tugas",
      ),
    );
    await act(async () => button(host, "Sempitkan sidebar").click());
    assert.equal(
      button(host, "Lebarkan sidebar").getAttribute("aria-expanded"),
      "false",
    );
    await act(async () => button(host, "Tugas").click());
    assert.ok(host.querySelector('[data-view="tasks"]'));
    await act(async () => button(host, "Lebarkan sidebar").click());
    assert.equal(
      button(host, "Sempitkan sidebar").getAttribute("aria-expanded"),
      "true",
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

test("first area drag stages immediately; a fresh capture resets the previous gesture", async () => {
  const { AreaSelect } = await import("../src/AreaSelectView");
  let frame: (v: any) => void = () => {};
  const submitted: any[] = [];
  (win as any).bitoArea = {
    ready() {},
    painted() {},
    cancel() {},
    onFrame(fn: any) {
      frame = fn;
      return () => {};
    },
    onClose() {
      return () => {};
    },
    async submit(payload: any) {
      submitted.push(payload);
      return { ok: true };
    },
  };
  const proto = win.HTMLElement.prototype as any;
  proto.setPointerCapture = () => {};
  proto.hasPointerCapture = () => false;
  await mounted(h(AreaSelect), async (host) => {
    const display = {
      session: "first",
      width: 800,
      height: 600,
      image: "data:image/png;base64,fixture",
      reducedMotion: true,
    };
    await act(async () => frame(display));
    const drag = async (type: string, x: number, y: number) => {
      const event = new win.MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: x,
        clientY: y,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      await act(async () =>
        host.querySelector(".area-drag-surface")!.dispatchEvent(event),
      );
    };
    await drag("pointerdown", 40, 40);
    await drag("pointerup", 240, 140);
    assert.equal(submitted.length, 1);
    assert.deepEqual(submitted[0].rect, {
      x: 40,
      y: 40,
      width: 200,
      height: 100,
    });
    assert.equal(submitted[0].question, "");
    await act(async () => frame({ ...display, session: "second" }));
    await drag("pointerup", 300, 300);
    assert.equal(submitted.length, 1);
    await drag("pointerdown", 100, 100);
    await drag("pointerup", 280, 240);
    assert.equal(submitted[1].session, "second");
  });
});

test("daily workspace starts a real session without opening chat and saves a partial checkpoint", async () => {
  const project = workspaceProject();
  const date = new Date();
  project.plan!.milestones[0].targetDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  let current = {
    ...defaultState(),
    projects: [project],
    activeProjectId: project.id,
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
  };
  const commands: string[] = [];
  function Harness() {
    const [state, setState] = useState(current);
    return h(WorkspaceTasks, {
      state,
      busy: false,
      onDirty() {},
      onProject() {},
      onAllProjects() {},
      onCreate() {},
      act: async (name, payload) => {
        commands.push(name);
        const next = structuredClone(current);
        const result = projectCommand(next, name, payload);
        current = next;
        setState(next);
        return result;
      },
    });
  }
  await mounted(h(Harness), async (host) => {
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".workspace-task-open")!.click(),
    );
    assert.equal(
      commands.length,
      0,
      "Opening details does not start a session",
    );
    await waitForUi(() => !!host.querySelector(".task-detail-column"));
    assert.equal(host.querySelectorAll("dialog").length, 0);
    assert.equal(host.querySelectorAll(".workspace-insights").length, 0);
    await act(async () => button(document.body, "Mulai fokus").click());
    assert.deepEqual(commands, ["project-work-start"]);
    assert.equal(current.projects[0].sessions?.[0].phase, "running");
    let dialog = document.querySelector<HTMLElement>(
      '.task-detail-column[aria-label="Detail tugas"]',
    )!;
    assert.ok(dialog);
    await act(async () => button(dialog, "Simpan progres").click());
    const note = dialog.querySelector<HTMLTextAreaElement>("textarea")!;
    await typeInto(note, "Draf pembuka sudah ditulis.");
    await act(async () => button(dialog, "Simpan hasil").click());
    assert.equal(current.projects[0].sessions?.[0].phase, "finished");
    assert.equal(
      current.projects[0].checkpoint?.lastStop,
      "Draf pembuka sudah ditulis.",
    );
    assert.equal(
      current.projects[0].plan!.milestones[0].tasks.find(
        (task) => task.id === current.projects[0].sessions?.[0].taskId,
      )!.status,
      "doing",
    );
    await act(async () => button(dialog, "Tutup detail tugas").click());
    assert.match(
      host.querySelector(".workspace-focus")!.textContent!,
      /Draf pembuka sudah ditulis/,
    );
    assert.ok(button(host, "Lanjutkan"));
    assert.ok(!commands.includes("project-assist"));
  });
});

async function waitForUi(condition: () => boolean, timeout = 600) {
  for (
    let attempt = 0;
    attempt < Math.ceil(timeout / 20) && !condition();
    attempt++
  )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  assert.ok(condition(), "UI transition completed");
}

test("task details replace insights and keep unsaved edits when switching tasks", async () => {
  const p = workspaceProject();
  p.plan!.milestones[0].tasks[0].status = "todo";
  const state = {
    ...defaultState(),
    projects: [p],
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
  };
  await mounted(
    h(WorkspaceTasks, {
      state,
      all: true,
      busy: false,
      act: async () => ({ ok: true }),
      onDirty() {},
      onProject() {},
      onAllProjects() {},
      onCreate() {},
    }),
    async (host) => {
      const rows = host.querySelectorAll<HTMLButtonElement>(
        ".workspace-task-open",
      );
      await act(async () => rows[0].click());
      await waitForUi(() => !!host.querySelector(".task-detail-column"));
      assert.equal(host.querySelectorAll("dialog").length, 0);
      assert.equal(host.querySelectorAll(".workspace-insights").length, 0);
      await act(async () => button(host, "Edit tugas").click());
      const title = host.querySelector<HTMLInputElement>(
        ".task-detail-column input",
      )!;
      await typeInto(title, "Unsaved task title");
      await act(async () => rows[1].click());
      assert.ok(host.querySelector(".task-switch-confirm"));
      assert.equal(title.value, "Unsaved task title");
      await act(async () => button(host, "Lanjut mengedit").click());
      assert.equal(host.querySelector(".task-switch-confirm"), null);
      assert.equal(title.value, "Unsaved task title");
      await act(async () => rows[1].click());
      await act(async () => button(host, "Abaikan perubahan").click());
      await waitForUi(
        () =>
          host.querySelector(".task-detail-column .workspace-task-panel h2")
            ?.textContent === "Write draft",
      );
      assert.equal(rows[1].getAttribute("aria-pressed"), "true");
      await act(async () => button(host, "Tutup detail tugas").click());
      await waitForUi(() => !!host.querySelector(".workspace-insights"));
      assert.equal(host.querySelector(".task-detail-column"), null);
    },
  );
});

test("task view menu offers direct choices, closes on selection and supports arrow keys", async () => {
  const { TaskViewMenu } = await import("../src/TaskViewMenu");
  let selected = "date";
  let completed = false;
  function Harness() {
    const [sort, setSort] =
      useState<import("../src/workspace-task-model").TaskSort>("date");
    const [done, setDone] = useState(false);
    return h(TaskViewMenu, {
      sort,
      completed: done,
      onSort(value) {
        selected = value;
        setSort(value);
      },
      onCompleted(value) {
        completed = value;
        setDone(value);
      },
    });
  }
  await mounted(h(Harness), async (host) => {
    await act(async () => button(host, "Atur tampilan").click());
    let menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    assert.ok(menu);
    assert.equal(menu.querySelector("select"), null);
    await act(async () => button(menu, "Abjad").click());
    assert.equal(selected, "title");
    assert.equal(
      button(host, "Atur tampilan").getAttribute("aria-expanded"),
      "false",
    );
    await act(async () => button(host, "Atur tampilan").click());
    menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    await waitForUi(
      () => document.activeElement === button(menu, "Urutan asli"),
    );
    assert.equal(button(menu, "Abjad").getAttribute("aria-checked"), "true");
    await act(async () => {
      button(menu, "Abjad").focus();
      button(menu, "Abjad").dispatchEvent(
        new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    assert.equal(document.activeElement?.textContent, "Tanggal tugas");
    await act(async () => button(menu, "Tugas selesai").click());
    assert.equal(completed, true);
    assert.equal(
      button(host, "Atur tampilan").getAttribute("aria-expanded"),
      "false",
    );
  });
});

test("context column can close, reopen and switch to a task while keeping progress accessible", async () => {
  const state = {
    ...defaultState(),
    projects: [workspaceProject()],
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
  };
  state.settings.reducedMotion = true;
  await mounted(
    h(WorkspaceTasks, {
      state,
      all: true,
      busy: false,
      act: async () => ({ ok: true }),
      onDirty() {},
      onProject() {},
      onAllProjects() {},
      onCreate() {},
    }),
    async (host) => {
      const progress = host.querySelector('[role="progressbar"]')!;
      assert.equal(progress.getAttribute("aria-valuenow"), "1");
      assert.equal(progress.getAttribute("aria-valuemax"), "2");
      assert.equal(host.querySelector(".insight-percent")!.textContent, "50%");
      const toggle = host.querySelector<HTMLButtonElement>(".insights-toggle")!;
      await act(async () =>
        button(
          host.querySelector(".workspace-insights")!,
          "Tutup ringkasan",
        ).click(),
      );
      assert.equal(document.activeElement, toggle);
      assert.ok(
        host.querySelector(".workspace-context-slot")!.hasAttribute("inert"),
      );
      await act(async () => toggle.click());
      assert.equal(toggle.getAttribute("aria-expanded"), "true");
      assert.ok(
        !host.querySelector(".workspace-context-slot")!.hasAttribute("inert"),
      );
      await waitForUi(() => !!host.querySelector(".workspace-insights"));
      await act(async () => toggle.click());
      await act(async () =>
        host.querySelector<HTMLButtonElement>(".workspace-task-open")!.click(),
      );
      await waitForUi(() => !!host.querySelector(".task-detail-column"));
      assert.equal(toggle.getAttribute("aria-expanded"), "true");
      assert.equal(
        host.querySelectorAll(".workspace-context-column").length,
        1,
      );
      await act(async () => button(host, "Tutup detail tugas").click());
      await waitForUi(() => !!host.querySelector(".workspace-insights"));
      assert.equal(host.querySelector(".insight-percent")!.textContent, "50%");
    },
  );
});

test("project insights show four real projects, open the selected one and expose all projects only on overflow", async () => {
  const { WorkspaceInsights } = await import("../src/WorkspaceInsights");
  const projects = Array.from({ length: 6 }, (_, i) => ({
    ...workspaceProject(),
    name: `Project ${i + 1}`,
  }));
  projects[5].status = "archived";
  let selected = "",
    allOpened = 0;
  for (const count of [0, 4, 6]) {
    await mounted(
      h(WorkspaceInsights, {
        items: [],
        projects: projects.slice(0, count),
        today: "2026-11-09",
        reduced: true,
        onClose() {},
        onSelect() {},
        onProject(p) {
          selected = p.id;
        },
        onAllProjects() {
          allOpened++;
        },
      }),
      async (host) => {
        const card = host.querySelector(".insight-projects")!;
        assert.equal(
          card.querySelectorAll(".insight-project-row").length,
          Math.min(count, 4),
        );
        assert.doesNotMatch(card.textContent!, /Project 6|Riwayat progres/);
        if (!count) {
          assert.match(card.textContent!, /Belum ada proyek/);
          return;
        }
        assert.match(card.textContent!, /1 dari 2 selesai/);
        await act(async () => button(host, "Buka proyek Project 2").click());
        assert.equal(selected, projects[1].id);
        const more = card.querySelector<HTMLButtonElement>(
          ".insight-project-all",
        );
        if (count > 4) {
          assert.ok(more);
          await act(async () => more.click());
          assert.equal(allOpened, 1);
        } else assert.equal(more, null);
      },
    );
  }
});

test("attention list shows up to five directly and expands additional tasks in place", async () => {
  const { WorkspaceInsights } = await import("../src/WorkspaceInsights");
  for (const count of [4, 5, 6]) {
    let selected = "";
    const items = Array.from({ length: count }, (_, i) => ({
      id: `task-${i}`,
      title: `Tugas ${i + 1}`,
      date: "2026-11-05",
      done: false,
      priority: 4,
      blocked: false,
      projectId: null,
      projectName: "Pribadi",
    }));
    await mounted(
      h(WorkspaceInsights, {
        projects: [],
        onProject() {},
        onAllProjects() {},
        items,
        today: "2026-11-09",
        reduced: true,
        onClose() {},
        onSelect(task) {
          selected = task.id;
        },
      }),
      async (host) => {
        const toggle = host.querySelector<HTMLButtonElement>(
          ".insight-more-toggle",
        );
        if (count <= 5) {
          assert.equal(toggle, null);
          assert.equal(
            host.querySelectorAll(".insight-attention-task").length,
            count,
          );
          return;
        }
        assert.ok(toggle);
        assert.match(toggle.textContent!, /Tampilkan 1 tugas lagi/);
        const extra = host.querySelector<HTMLElement>(".insight-more-tasks")!;
        assert.equal(toggle.getAttribute("aria-controls"), extra.id);
        assert.ok(extra.hasAttribute("inert"));
        await act(async () => toggle.click());
        assert.equal(toggle.getAttribute("aria-expanded"), "true");
        assert.ok(!extra.hasAttribute("inert"));
        await act(async () =>
          extra.querySelector<HTMLButtonElement>("button")!.click(),
        );
        assert.equal(selected, "task-5");
        await act(async () => button(host, "Tampilkan lebih sedikit").click());
        assert.equal(toggle.getAttribute("aria-expanded"), "false");
        assert.ok(extra.hasAttribute("inert"));
      },
    );
  }
});

test("task groups collapse accessibly and task completion preserves the real list flow", async () => {
  const project = workspaceProject();
  project.plan!.milestones[0].targetDate = "2020-01-01";
  let current = {
    ...defaultState(),
    projects: [project],
    activeProjectId: project.id,
    hasKey: false,
    busy: false,
    chatOpen: false,
    dragging: false,
  };
  current.settings.reducedMotion = true;
  const commands: string[] = [];
  let rejectUpdate = true;
  function Harness() {
    const [state, setState] = useState(current);
    return h(WorkspaceTasks, {
      state,
      all: true,
      busy: false,
      onDirty() {},
      onProject() {},
      onAllProjects() {},
      onCreate() {},
      act: async (name, payload) => {
        commands.push(name);
        if (rejectUpdate) return { ok: false, error: "Coba lagi." };
        const next = structuredClone(current);
        const result = projectCommand(next, name, payload);
        if (result.ok) {
          current = next;
          setState(next);
        }
        return result;
      },
    });
  }
  await mounted(h(Harness), async (host) => {
    const heading = host.querySelector<HTMLButtonElement>(
      ".group-overdue .task-group-toggle",
    )!;
    assert.equal(heading.getAttribute("aria-expanded"), "true");
    const contents = document.getElementById(
      heading.getAttribute("aria-controls")!,
    )!;
    const task = contents.querySelector<HTMLButtonElement>(
      ".workspace-task-open",
    )!;
    heading.focus();
    await act(async () => heading.click());
    assert.equal(heading.getAttribute("aria-expanded"), "false");
    assert.equal(contents.getAttribute("aria-hidden"), "true");
    assert.ok(contents.hasAttribute("inert"));
    assert.equal(document.activeElement, heading);
    assert.equal(commands.length, 0, "Collapsing does not change task data");
    await act(async () => heading.click());
    assert.ok(!contents.hasAttribute("inert"));
    assert.equal(contents.querySelector(".workspace-task-open"), task);
    await act(async () => task.click());
    await waitForUi(() => !!host.querySelector(".task-detail-column"));
    assert.equal(task.getAttribute("aria-pressed"), "true");
    assert.equal(host.querySelectorAll("dialog").length, 0);
    await act(async () => button(host, "Tutup detail tugas").click());
    const checkbox = contents.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    await act(async () => checkbox.click());
    assert.match(
      host.querySelector('[role="alert"]')!.textContent!,
      /Coba lagi/,
    );
    assert.ok(
      host.contains(checkbox),
      "Failed updates keep the task in the list",
    );
    rejectUpdate = false;
    await act(async () => checkbox.click());
    await waitForUi(() => !host.querySelector(".group-overdue"));
    assert.equal(
      current.projects[0].plan!.milestones[0].tasks[1].status,
      "done",
    );
    assert.deepEqual(commands, ["project-task", "project-task"]);
    await act(async () => button(host, "Atur tampilan").click());
    await act(async () => button(document.body, "Tugas selesai").click());
    await waitForUi(
      () => host.querySelectorAll(".workspace-task-row.is-done").length === 2,
    );
    assert.match(
      host.querySelector(".workspace-task-list")!.textContent!,
      /Write draft/,
    );
  });
});

test(
  "task completion waits for persistence then shows its check before leaving",
  {
    skip: !process.env.BITO_TEST_FULL_MOTION,
  },
  async () => {
    const project = workspaceProject();
    project.plan!.milestones[0].targetDate = "2020-01-01";
    let current = {
      ...defaultState(),
      projects: [project],
      activeProjectId: project.id,
      hasKey: false,
      busy: false,
      chatOpen: false,
      dragging: false,
    };
    current.settings.reducedMotion = false;
    let resolveSave!: () => void;
    const save = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    let calls = 0;
    function Harness() {
      const [state, setState] = useState(current);
      return h(WorkspaceTasks, {
        state,
        all: true,
        busy: false,
        onDirty() {},
        onProject() {},
        onAllProjects() {},
        onCreate() {},
        act: async (name, payload) => {
          calls++;
          await save;
          const next = structuredClone(current);
          const result = projectCommand(next, name, payload);
          current = next;
          setState(next);
          return result;
        },
      });
    }
    await mounted(h(Harness), async (host) => {
      const row = host.querySelector<HTMLElement>(".workspace-task-row")!;
      const checkbox = row.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      )!;
      await act(async () => {
        checkbox.click();
        checkbox.click();
      });
      assert.equal(calls, 1, "Repeated clicks cannot submit completion twice");
      assert.equal(
        row.dataset.checked,
        "false",
        "Pending save does not claim completion",
      );
      assert.equal(checkbox.getAttribute("aria-readonly"), "true");
      await act(async () => resolveSave());
      assert.equal(
        current.projects[0].plan!.milestones[0].tasks[1].status,
        "done",
      );
      assert.equal(row.dataset.checked, "true");
      assert.equal(row.dataset.completing, "true");
      assert.ok(
        row.isConnected,
        "Confirmed task stays visible for the check and strike",
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 240));
      });
      assert.ok(row.isConnected, "Check animation gets time before the exit");
      // JSDOM cannot measure height:auto. Verify entry into the inert exit
      // phase here; the actual height/fade exit is checked in the browser.
      await waitForUi(() => {
        const group = host.querySelector(".group-overdue");
        return !group || group.hasAttribute("inert");
      }, 1200);
      assert.equal(calls, 1);
    });
  },
);
