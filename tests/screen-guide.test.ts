import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ScreenGuide as Guide } from "../electron/screen-guide";
import type { GroundingResult } from "../src/grounding";
const key = "__bito_screen_test";
let folder: string, ScreenGuide: typeof Guide;
const initial = {
  id: "42",
  pid: 500,
  app: "Editor",
  title: "Document",
  bounds: { x: 0, y: 25, width: 1440, height: 900 },
};
const result: GroundingResult = {
  status: "found",
  answer: "Plugins-nya di sini.",
  label: "Plugins",
  confidence: 0.96,
  box: [50, 750, 100, 800],
};
let h: any;
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "bito-screen-unit-"));
  // Exercise the actual controller with in-memory windows/images. No Electron
  // app, OS capture, keyboard registration or provider request is performed.
  await build({
    entryPoints: [resolve("electron/screen-guide.ts")],
    outfile: join(folder, "guide.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    define: { "process.platform": '"darwin"' },
    plugins: [
      {
        name: "fake-desktop",
        setup(build) {
          build.onResolve({ filter: /^electron$/ }, () => ({
            path: "electron",
            namespace: "fake",
          }));
          build.onResolve({ filter: /^\.\/screen-context$/ }, () => ({
            path: "context",
            namespace: "fake",
          }));
          build.onLoad({ filter: /.*/, namespace: "fake" }, ({ path }) => ({
            contents:
              path === "context"
                ? `
      export class ScreenContext {
        subscribe(pid, changed){ const h=globalThis.${key}; h.notify=changed; h.subscriptions=(h.subscriptions||0)+1; return ()=>{h.notify=undefined;h.unsubscriptions=(h.unsubscriptions||0)+1}; }
        async read(){ return structuredClone(globalThis.${key}.window); }
        async observe(){ const h=globalThis.${key}; return {frontPid:h.frontPid??h.window.pid,activity:String(h.activity),accessible:true,elements:structuredClone(h.elements||[])}; }
        async activate(){ globalThis.${key}.activations++; return true; }
        async accessibility(prompt=false){ const h=globalThis.${key}; if(prompt) h.accessibilityPrompts=(h.accessibilityPrompts||0)+1; return h.accessible!==false; }
        async capture(){ const h=globalThis.${key}; h.nativeCalls++; return h.native ? {data:'/9j/AAAA',width:1440,height:1000,bounds:{x:0,y:0,width:1440,height:1000}} : null; }
        close(){}
      }
    `
                : `
      import {EventEmitter} from 'node:events';
      const h=()=>globalThis.${key};
      export const ipcMain=new EventEmitter();
      export class BrowserWindow {
        destroyed=false; visible=false;
        webContents={id:99,mainFrame:{},send:(name,value)=>{
          h().events.push({name,value});
          if(value.target) queueMicrotask(()=>ipcMain.emit('bito:spotlight-painted',{sender:this.webContents,senderFrame:this.webContents.mainFrame}));
        },setWindowOpenHandler(){},on(){},session:{setPermissionRequestHandler(){}}};
        constructor(options){ h().overlays.push(this); h().windowOptions=options; }
        async loadURL(){ queueMicrotask(()=>ipcMain.emit('bito:spotlight-ready',{sender:this.webContents,senderFrame:this.webContents.mainFrame})); }
        async loadFile(){return this.loadURL()}
        setIgnoreMouseEvents(value){h().clickThrough=value} setAlwaysOnTop(){} setBounds(value){this.bounds=value} getBounds(){return this.bounds}
        showInactive(){this.visible=true} hide(){this.visible=false} isDestroyed(){return this.destroyed} destroy(){this.destroyed=true}
      }
      export const screen={getDisplayMatching:()=>({id:1,bounds:{x:0,y:0,width:1440,height:1000},workArea:{x:0,y:25,width:1440,height:975}})};
      export const systemPreferences={getMediaAccessStatus:()=>h().permission};
      export const globalShortcut={register:(key,fn)=>{h().escape=fn;return true},unregister:()=>{h().escape=null}};
      export const shell={openExternal:async()=>{}};
      export const dialog={showMessageBox:async()=>({response:1})};
      const image=(native=false)=>({isEmpty:()=>native ? !!h().nativeEmpty : !!h().empty,
        getSize:()=>({width:1440,height:native?1000:900}),resize(){return this},
        toBitmap:()=>Buffer.alloc(160*100*4,h().pixels ?? (h().changed && (native?h().nativeCalls:h().captures)>1?0:255)),
        toJPEG:()=>Buffer.from([255,216,255,0,0,0])});
      export const nativeImage={createFromBuffer:()=>image(true)};
      export const desktopCapturer={getSources:async()=>{
        h().captures++;
        if(h().missing) return [];
        return [{id:'window:42:0',thumbnail:image()}];
      }};
    `,
          }));
        },
      },
    ],
  });
  ScreenGuide = (await import(pathToFileURL(join(folder, "guide.mjs")).href))
    .ScreenGuide;
});
after(async () => {
  await rm(folder, { recursive: true, force: true });
  delete (globalThis as any)[key];
});
function fixture(reducedMotion = true) {
  h = {
    window: structuredClone(initial),
    permission: "granted",
    events: [],
    overlays: [],
    captures: 0,
    nativeCalls: 0,
    native: false,
    changed: false,
    moves: [],
    enabled: true,
    activity: 0,
    activations: 0,
    starts: 0,
    phases: [],
  };
  (globalThis as any)[key] = h;
  const pet = {
    focusable: true,
    isFocusable() {
      return this.focusable;
    },
    setFocusable(value: boolean) {
      this.focusable = value;
    },
    bounds: { x: 800, y: 650, width: 200, height: 200 },
    getBounds() {
      return { ...this.bounds };
    },
    setPosition(x: number, y: number) {
      this.bounds = { ...this.bounds, x, y };
      h.moves.push({ x, y });
    },
    isDestroyed: () => false,
    setAlwaysOnTop() {},
    moveTop() {},
  };
  const guide = new ScreenGuide({
    directory: folder,
    pet: () => pet as any,
    chat: () => null,
    enabled: () => h.enabled,
    reducedMotion: () => reducedMotion,
    restoreLevel: () => {},
    onMove: () => {},
    beginGuide: async () => {
      h.starts++;
      h.startTypingPhase = h.events.filter((e: any) => e.value.guide).at(-1)
        ?.value.guide.phase;
    },
    guideState: (phase) => h.phases.push(phase),
    watchInterval: 15,
  });
  const answers: string[] = [],
    progress: string[] = [],
    controller = new AbortController();
  const answer = (generate: any = async () => structuredClone(result)) =>
    guide.answer({
      question: "tombol plugins dimana?",
      style: "chill",
      signal: controller.signal,
      generate,
      onAnswer: (text) => answers.push(text),
    });
  return { guide, pet, answers, progress, controller, answer };
}
test("model context reads metadata without taking screenshots; implicit inspection returns actual highlight state", async () => {
  const f = fixture();
  try {
    assert.deepEqual(await f.guide.modelContext(), {
      app: "Editor",
      title: "Document",
    });
    assert.equal(h.captures, 0);
    assert.equal(h.nativeCalls, 0);
    const r = await f.guide.answer({
      question: "aku mau bikin daftar isi",
      history: [{ role: "user", content: "lagi ngerjain dokumen" }],
      style: "chill",
      signal: f.controller.signal,
      generate: async (input) => {
        assert.equal(input.history[0].content, "lagi ngerjain dokumen");
        return result;
      },
      onAnswer() {},
    });
    assert.equal(r.status, "found");
    assert.equal(r.highlighted, true);
    h.permission = "denied";
    const unavailable = await f.answer();
    assert.equal(unavailable.status, "unavailable");
    assert.equal(unavailable.highlighted, false);
  } finally {
    f.guide.close();
  }
});
const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("test condition timed out");
};
test("screen controller captures the external window, paints click-through highlight, preserves home and returns", async () => {
  const f = fixture(),
    home = f.pet.getBounds();
  try {
    await f.answer();
    assert.equal(h.captures, 2);
    assert.deepEqual(f.answers, [result.answer]);
    assert.equal(h.clickThrough, true);
    assert.equal(h.windowOptions.focusable, false);
    assert.equal(h.windowOptions.webPreferences.backgroundThrottling, false);
    assert.deepEqual(f.guide.originalPosition, home);
    assert.notDeepEqual(f.pet.getBounds(), home);
    h.escape();
    await waitFor(() => !f.guide.originalPosition);
    assert.deepEqual(f.pet.getBounds(), home);
  } finally {
    f.guide.close();
  }
});
test("changed page pixels and moved/switched window never receive a highlight", async () => {
  for (const change of [
    () => {
      h.changed = true;
    },
    () => {
      h.window.bounds.x = 30;
    },
    () => {
      h.window.id = "55";
    },
  ]) {
    const f = fixture();
    try {
      await f.answer(async () => {
        change();
        return structuredClone(result);
      });
      assert.equal(h.overlays.length, 0);
      assert.equal(h.moves.length, 0);
      assert.match(f.answers[0], /berubah/);
    } finally {
      f.guide.close();
    }
  }
});
test("drag during travel cancels without hanging or moving Bito back out of the user's hand", async () => {
  const f = fixture(false);
  try {
    const pending = f.answer();
    await waitFor(() => h.moves.length >= 2);
    f.guide.cancel("Kamu memindahkan Bito.", false);
    f.pet.setPosition(20, 30);
    await pending;
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(f.pet.getBounds(), {
      x: 20,
      y: 30,
      width: 200,
      height: 200,
    });
    assert.equal(f.guide.originalPosition, undefined);
    assert.deepEqual(
      f.answers,
      [result.answer],
      "instruction is delivered before travel finishes; cancellation stops only the remaining motion",
    );
  } finally {
    f.guide.close();
  }
});
test("unsupported/ambiguous targets and revoked screen permission cannot point", async () => {
  const f = fixture();
  try {
    await f.answer(async () => ({
      ...result,
      status: "ambiguous",
      answer: "Plugins yang mana?",
      box: [],
    }));
    assert.equal(h.overlays.length, 0);
    h.permission = "denied";
    await f.answer(async () => {
      throw Error("must not call provider");
    });
    assert.match(f.answers.at(-1)!, /Perekaman Layar/);
  } finally {
    f.guide.close();
  }
});

test("native display capture survives missing Electron window IDs and maps menu-bar coordinates", async () => {
  const f = fixture();
  h.native = true;
  h.missing = true;
  try {
    await f.answer(async (input: any) => {
      assert.equal(input.scope, "display");
      assert.equal(input.title, "Document");
      assert.deepEqual(input.history, []);
      return { ...result, box: [2, 100, 20, 140], label: "Insert" };
    });
    assert.equal(h.captures, 0);
    assert.equal(h.nativeCalls, 2);
    assert.deepEqual(f.answers, [result.answer]);
    const target = h.events.find((e: any) => e.value.target)?.value.target;
    assert.equal(target.y, 2); // Display origin, not window origin y=25.
    assert.equal(target.height, 18);
  } finally {
    f.guide.close();
  }
});
test("empty native image falls back to the external window; missing both explains OS capture failure", async () => {
  for (const missing of [false, true]) {
    const f = fixture();
    h.native = true;
    h.nativeEmpty = true;
    h.missing = missing;
    try {
      let calls = 0;
      await f.answer(async (input: any) => {
        calls++;
        assert.equal(input.scope, "window");
        return result;
      });
      assert.equal(calls, missing ? 0 : 1);
      if (missing) {
        assert.match(f.answers[0], /gambar jendelanya dari sistem/);
        assert.equal(h.overlays.length, 0);
      } else assert.deepEqual(f.answers, [result.answer]);
    } finally {
      f.guide.close();
    }
  }
});
test("follow-up uses bounded recent dialogue only for the same external application window", async () => {
  const f = fixture();
  try {
    await f.answer(async () => ({
      ...result,
      status: "not_found",
      box: [],
      answer: "Buka menu Sisipkan dulu.",
    }));
    assert.equal(f.guide.hasRecentContext, true);
    await f.answer(async (input: any) => {
      assert.equal(input.history.length, 2);
      assert.equal(input.history[1].content, "Buka menu Sisipkan dulu.");
      return { ...result, status: "not_found", box: [] };
    });
    h.window.pid = 501;
    await f.answer(async (input: any) => {
      assert.deepEqual(input.history, []);
      return { ...result, status: "not_found", box: [] };
    });
    f.guide.forgetConversation();
    assert.equal(f.guide.hasRecentContext, false);
  } finally {
    f.guide.close();
  }
});
test("a failed second native capture cannot reuse coordinates or switch capture frames", async () => {
  const f = fixture();
  h.native = true;
  try {
    await f.answer(async () => {
      h.native = false;
      return result;
    });
    assert.equal(h.overlays.length, 0);
    assert.equal(h.captures, 0);
    assert.match(f.answers[0], /terputus/);
  } finally {
    f.guide.close();
  }
});

const interactive = (
  progress: "initial" | "waiting" | "advanced" = "initial",
): GroundingResult => ({
  ...result,
  answer: "Klik menu Insert ini.",
  label: "Insert",
  guide: {
    progress,
    expected: "Menu Insert terbuka",
    evidence: progress === "advanced" ? "Menu sebelumnya sudah terbuka" : "",
    elementId: "",
  },
});
function startGuide(
  f: ReturnType<typeof fixture>,
  generate: (input: any, signal: AbortSignal) => Promise<GroundingResult>,
) {
  h.native = true;
  return f.guide.answer({
    question: "bantu bikin daftar isi",
    style: "chill",
    signal: f.controller.signal,
    generate: async () => interactive(),
    continueWith: generate,
    onAnswer: (text) => f.answers.push(text),
    onProgress: (text) => f.progress.push(text),
  });
}
test("continuous guide closes chat once, shows one passive bubble, and does not call AI while idle or after an ineffective click", async () => {
  const f = fixture();
  let requests = 0;
  try {
    await startGuide(f, async () => {
      requests++;
      return interactive("waiting");
    });
    assert.equal(h.starts, 1);
    assert.equal(h.activations, 1);
    assert.equal(h.windowOptions.focusable, false);
    assert.equal(h.clickThrough, true);
    assert.equal(f.guide.guiding, true);
    await new Promise((r) => setTimeout(r, 55));
    assert.equal(requests, 0);
    assert.equal(h.nativeCalls, 2, "idle only reads metadata/activity");
    h.activity++;
    await new Promise((r) => setTimeout(r, 90));
    assert.equal(requests, 0, "a click without a UI change is not progress");
    const bubbles = h.events.filter((e: any) => e.value.guide);
    assert.equal(bubbles.at(-1).value.guide.text, "Klik menu Insert ini.");
  } finally {
    f.guide.close();
  }
});
test("initial provider latency displays a passive typing bubble until the instruction is ready", async () => {
  const f = fixture();
  let release!: (value: GroundingResult) => void;
  let requested = false;
  h.native = true;
  try {
    const pending = f.guide.answer({
      question: "bantu bikin daftar isi",
      style: "chill",
      signal: f.controller.signal,
      generate: () => {
        requested = true;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
      continueWith: async () => interactive("waiting"),
      onAnswer: (text) => f.answers.push(text),
    });
    await waitFor(() => requested);
    assert.equal(
      h.events.filter((e: any) => e.value.guide).at(-1).value.guide.phase,
      "thinking",
    );
    assert.equal(h.overlays[0].visible, true);
    assert.equal(
      h.startTypingPhase,
      "thinking",
      "typing is visible before the full chat closes",
    );
    assert.equal(h.clickThrough, true);
    release(interactive());
    await pending;
    assert.equal(
      h.events.filter((e: any) => e.value.guide).at(-1).value.guide.phase,
      "talking",
    );
    assert.equal(
      h.events.filter((e: any) => e.value.guide).at(-1).value.guide.text,
      "Klik menu Insert ini.",
    );
  } finally {
    f.guide.close();
  }
});
const explanation = (): GroundingResult => ({
  status: "not_found",
  answer: "Aku jelasin bagian yang kelihatan satu-satu, ya.",
  label: "",
  confidence: 0.97,
  box: [],
  guide: {
    progress: "done",
    expected: "",
    evidence: "Toolbar dan panel terlihat",
    elementId: "",
  },
  explanation: [
    {
      answer: "Ini toolbar untuk mengatur dokumen.",
      label: "Toolbar",
      confidence: 0.96,
      box: [50, 100, 110, 800],
    },
    {
      answer: "Ini panel properti objek yang kamu pilih.",
      label: "Properties",
      confidence: 0.96,
      box: [150, 820, 600, 980],
    },
  ],
});
test("screen explanation shows one grounded stop at a time, advances only on Bito click, and uses no extra AI", async () => {
  const f = fixture();
  h.native = true;
  let calls = 0;
  try {
    const receipt = await f.guide.answer({
      question: "jelaskan ada apa aja di layar aku sekarang",
      style: "chill",
      signal: f.controller.signal,
      generate: async () => {
        calls++;
        return explanation();
      },
      continueWith: async () => {
        throw Error("must not call AI again");
      },
      onAnswer: (text) => f.answers.push(text),
    });
    assert.equal(receipt.handled, true);
    assert.equal(receipt.highlighted, true);
    assert.equal(f.guide.explaining, true);
    const bubble = () =>
      h.events.filter((e: any) => e.value.guide).at(-1).value.guide;
    assert.match(bubble().hint, /1\/2.*Klik Bito/);
    assert.match(bubble().text, /toolbar/);
    const captures = h.nativeCalls;
    h.activity++;
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(
      h.nativeCalls,
      captures,
      "no background capture or auto-advance while reading",
    );
    await f.guide.nextExplanation();
    assert.match(bubble().hint, /2\/2.*selesai/);
    assert.match(bubble().text, /properti/);
    assert.equal(calls, 1);
    await f.guide.nextExplanation();
    assert.equal(f.guide.explaining, false);
    assert.equal(bubble().hint, undefined);
    assert.match(bubble().text, /bagian-bagian/);
  } finally {
    f.guide.close();
  }
});
test("screen explanation rejects stale or switched windows and Escape ends it", async () => {
  for (const changedWindow of [false, true]) {
    const f = fixture();
    h.native = true;
    try {
      await f.guide.answer({
        question: "jelasin layarku",
        style: "care",
        signal: f.controller.signal,
        generate: async () => explanation(),
        continueWith: async () => explanation(),
        onAnswer() {},
      });
      if (changedWindow) h.window.pid++;
      else h.pixels = 0;
      await f.guide.nextExplanation();
      assert.equal(f.guide.explaining, false);
      assert.match(
        h.events.filter((e: any) => e.value.guide).at(-1).value.guide.text,
        /berubah/,
      );
      h.escape();
      assert.equal(f.guide.guiding, false);
    } finally {
      f.guide.close();
    }
  }
});
test("provider failures keep the actual safe reason in the passive bubble and chat receipt", async () => {
  const f = fixture();
  h.native = true;
  try {
    const receipt = await f.guide.answer({
      question: "jelaskan layar",
      style: "chill",
      signal: f.controller.signal,
      generate: async () => {
        throw Object.assign(Error("private provider body"), {
          code: "invalid_grounding",
        });
      },
      continueWith: async () => explanation(),
      onAnswer: (text) => f.answers.push(text),
    });
    assert.equal(receipt.status, "unavailable");
    assert.match(receipt.answer, /belum valid/);
    assert.ok(!receipt.answer.includes("private"));
    assert.equal(f.answers[0], receipt.answer);
    assert.equal(
      h.events.filter((e: any) => e.value.guide).at(-1).value.guide.text,
      receipt.answer,
    );
  } finally {
    f.guide.close();
  }
});
test("missing macOS accessibility requests OS consent once, never captures or calls AI before that prompt", async () => {
  const f = fixture();
  h.accessible = false;
  let called = 0;
  try {
    const first = await f.answer(async () => {
      called++;
      return result;
    });
    assert.equal(first.status, "unavailable");
    assert.match(first.answer, /Aksesibilitas/);
    assert.equal(h.accessibilityPrompts, 1);
    assert.equal(called, 0);
    assert.equal(h.captures, 0);
    h.accessible = true;
    assert.equal(
      (
        await f.answer(async () => {
          called++;
          return result;
        })
      ).status,
      "found",
    );
    assert.equal(h.accessibilityPrompts, 1);
    assert.equal(called, 1);
  } finally {
    f.guide.close();
  }
});
test("delayed activation waits without capture, and clicking the app resumes the same guide automatically", async () => {
  const f = fixture();
  h.frontPid = 999;
  try {
    const pending = startGuide(f, async () => interactive("waiting"));
    await waitFor(() =>
      h.events.some((e: any) => e.value.guide?.text.includes("Aku tunggu")),
    );
    assert.equal(
      h.nativeCalls,
      0,
      "never capture the app that is still behind",
    );
    assert.equal(h.starts, 1);
    assert.equal(f.guide.guiding, true);
    h.frontPid = initial.pid;
    const result = await pending;
    assert.equal(result.status, "found");
    assert.equal(result.guiding, true);
    assert.equal(h.activations, 1, "no repeated focus stealing while waiting");
    assert.equal(h.starts, 1, "the user need not submit their question again");
    assert.ok(
      h.events.some(
        (e: any) => e.value.guide?.text === "Klik menu Insert ini.",
      ),
    );
  } finally {
    f.guide.close();
  }
});
test("Escape cancels initial focus waiting without capture or a provider request", async () => {
  const f = fixture();
  h.frontPid = 999;
  try {
    const pending = startGuide(f, async () => {
      throw Error("unexpected provider");
    });
    await waitFor(() =>
      h.events.some((e: any) => e.value.guide?.text.includes("Aku tunggu")),
    );
    h.escape();
    const result = await pending;
    assert.equal(result.status, "unavailable");
    assert.equal(result.handled, true);
    assert.equal(h.nativeCalls, 0);
    assert.equal(f.guide.guiding, false);
  } finally {
    f.guide.close();
  }
});
test("a real focus failure has the identical explanation in its bubble and chat receipt, never a generic paused answer", async () => {
  const f = fixture();
  h.native = true;
  try {
    const result = await f.guide.answer({
      question: "bantu bikin daftar isi",
      style: "chill",
      signal: f.controller.signal,
      generate: async () => {
        h.frontPid = 999;
        return interactive();
      },
      continueWith: async () => interactive("waiting"),
      onAnswer: (text) => f.answers.push(text),
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.handled, true);
    assert.match(result.answer, /Isi layarnya sudah berubah/);
    assert.equal(f.answers.at(-1), result.answer);
    assert.equal(
      h.events.filter((e: any) => e.value.guide).at(-1).value.guide.text,
      result.answer,
    );
    assert.notEqual(result.answer, "Panduan dijeda.");
  } finally {
    f.guide.close();
  }
});
test("same-app popup is verified against the original goal then shows the next target without opening chat", async () => {
  const f = fixture();
  let requests = 0;
  try {
    await startGuide(f, async (input) => {
      requests++;
      assert.equal(input.guide.goal, "bantu bikin daftar isi");
      assert.equal(input.guide.previous.expected, "Menu Insert terbuka");
      assert.equal(input.guide.step, 1);
      return {
        ...interactive("advanced"),
        answer: "Sekarang pilih Table of contents.",
        label: "Table of contents",
        box: [200, 150, 240, 300],
        guide: {
          progress: "advanced",
          expected: "Daftar isi muncul",
          evidence: "Menu Insert sudah terbuka dan berisi Table of contents",
          elementId: "",
        },
      };
    });
    h.window.id = "55";
    h.window.title = "Insert menu";
    h.activity++;
    h.pixels = 0;
    await waitFor(() =>
      h.events.some(
        (e: any) => e.value.guide?.text === "Sekarang pilih Table of contents.",
      ),
    );
    assert.equal(requests, 1);
    assert.equal(h.starts, 1);
    assert.equal(h.activations, 1);
    assert.equal(h.overlays.length, 1);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(requests, 1);
  } finally {
    f.guide.close();
  }
});
test("wrong click yields the previous instruction, never a fabricated next step", async () => {
  const f = fixture();
  let requests = 0;
  try {
    await startGuide(f, async () => {
      requests++;
      return {
        ...interactive("waiting"),
        answer: "should not replace current instruction",
      };
    });
    h.activity++;
    h.pixels = 0;
    await waitFor(() => requests === 1);
    await waitFor(() => h.phases.at(-1) === "talking");
    assert.equal(
      h.events.filter((e: any) => e.value.guide).at(-1).value.guide.text,
      "Klik menu Insert ini.",
    );
  } finally {
    f.guide.close();
  }
});
test("switching app pauses without activating it or analyzing unrelated pixels", async () => {
  const f = fixture();
  let requests = 0;
  try {
    await startGuide(f, async () => {
      requests++;
      return interactive("advanced");
    });
    h.window.pid = 900;
    h.activity++;
    h.pixels = 0;
    await waitFor(() =>
      h.events.some((e: any) => e.value.guide?.text.includes("kembali")),
    );
    assert.equal(requests, 0);
    assert.equal(h.nativeCalls, 2);
    assert.equal(h.activations, 1);
    h.window.pid = 500;
    await waitFor(() => requests === 1);
    await new Promise((r) => setTimeout(r, 75));
    assert.equal(
      requests,
      1,
      "a changed return is verified once, never inferred as completion",
    );
  } finally {
    f.guide.close();
  }
});
test("a stale next-step response cannot paint; Escape aborts in-flight verification and clears the passive bubble", async () => {
  const f = fixture();
  let release!: (v: GroundingResult) => void, signal: AbortSignal | undefined;
  try {
    await startGuide(f, async (_input, s) => {
      signal = s;
      return new Promise((r) => {
        release = r;
      });
    });
    h.activity++;
    h.pixels = 0;
    await waitFor(() => !!signal);
    assert.equal(
      h.events.filter((e: any) => e.value.guide).at(-1).value.guide.phase,
      "thinking",
      "subsequent verification also exposes a typing state",
    );
    const paints = h.events.filter((e: any) => e.value.target).length;
    h.activity++;
    h.pixels = 120;
    release(interactive("advanced"));
    await waitFor(() =>
      h.events.some((e: any) =>
        e.value.guide?.text.includes("Tampilannya berubah"),
      ),
    );
    assert.equal(h.events.filter((e: any) => e.value.target).length, paints);
    h.escape();
    await waitFor(() => !f.guide.guiding);
    assert.equal(signal!.aborted, true);
    assert.equal(
      h.events.some((e: any) => e.value.guide === null),
      true,
    );
  } finally {
    f.guide.close();
  }
});
test("verified completion removes the spotlight, keeps a single final bubble and stops observations", async () => {
  const f = fixture();
  let requests = 0;
  try {
    await startGuide(f, async () => {
      requests++;
      return {
        ...interactive(),
        status: "not_found",
        box: [],
        answer: "Beres, daftar isinya sudah muncul.",
        guide: {
          progress: "done",
          expected: "",
          evidence: "Daftar isi terlihat di dokumen",
          elementId: "",
        },
      };
    });
    h.activity++;
    h.pixels = 0;
    await waitFor(() =>
      h.events.some((e: any) => e.value.guide?.text.startsWith("Beres")),
    );
    const captures = h.nativeCalls;
    h.activity++;
    h.pixels = 120;
    await new Promise((r) => setTimeout(r, 75));
    assert.equal(requests, 1);
    assert.equal(h.nativeCalls, captures);
    assert.equal(h.events.at(-2).value.visible, false);
    assert.equal(h.starts, 1);
  } finally {
    f.guide.close();
  }
});

test("returning without a screen change restores the current target without requesting AI or stealing focus", async () => {
  const f = fixture();
  let calls = 0;
  try {
    await startGuide(f, async () => {
      calls++;
      return interactive("waiting");
    });
    assert.equal(f.pet.focusable, false);
    const paints = h.events.filter((e: any) => e.value.target).length;
    h.frontPid = 999;
    await waitFor(() =>
      h.events.some((e: any) => e.value.guide?.text.includes("kembali")),
    );
    h.frontPid = initial.pid;
    await waitFor(
      () => h.events.filter((e: any) => e.value.target).length > paints,
    );
    assert.equal(calls, 0);
    assert.equal(h.activations, 1);
    f.guide.cancel(undefined, false);
    assert.equal(f.pet.focusable, true);
  } finally {
    f.guide.close();
  }
});

test("each verified next step and failure has the identical passive bubble and chat history receipt", async () => {
  const f = fixture();
  let calls = 0;
  try {
    await startGuide(f, async () => {
      if (++calls === 2)
        throw Object.assign(Error("secret provider body"), {
          code: "provider_limit",
        });
      return {
        ...interactive("advanced"),
        answer: "Sekarang pilih Daftar isi.",
      };
    });
    assert.deepEqual(
      f.progress,
      [],
      "initial answer already belongs to the original chat turn",
    );
    h.activity++;
    h.pixels = 0;
    await waitFor(() => f.progress.length === 1);
    assert.deepEqual(f.progress, ["Sekarang pilih Daftar isi."]);
    assert.equal(
      h.events.filter((e: any) => e.value.guide).at(-1).value.guide.text,
      f.progress[0],
    );
    h.activity++;
    h.pixels = 120;
    await waitFor(() => f.progress.length === 2);
    assert.match(f.progress[1], /batas pemakaian/);
    assert.equal(
      h.events.filter((e: any) => e.value.guide).at(-1).value.guide.text,
      f.progress[1],
    );
    assert.ok(!f.progress.join().includes("secret"));
  } finally {
    f.guide.close();
  }
});

test("a late old abort and provider result cannot cancel or update the replacement guide", async () => {
  const f = fixture();
  const old = new AbortController(),
    next = new AbortController();
  let release!: (v: GroundingResult) => void;
  const oldAnswers: string[] = [];
  h.native = true;
  try {
    const pending = f.guide
      .answer({
        question: "old",
        style: "chill",
        signal: old.signal,
        generate: () =>
          new Promise((r) => {
            release = r;
          }),
        continueWith: async () => interactive(),
        onAnswer: (s) => oldAnswers.push(s),
      })
      .catch(() => undefined);
    await waitFor(() => !!release);
    await f.guide.answer({
      question: "new",
      style: "chill",
      signal: next.signal,
      generate: async () => ({
        ...interactive(),
        answer: "Panduan yang baru.",
      }),
      continueWith: async () => interactive(),
      onAnswer() {},
    });
    old.abort();
    assert.equal(f.guide.guiding, true);
    release(interactive());
    await pending;
    assert.equal(f.guide.guiding, true);
    assert.deepEqual(oldAnswers, []);
    assert.equal(
      h.events.filter((e: any) => e.value.guide).at(-1).value.guide.text,
      "Panduan yang baru.",
    );
  } finally {
    f.guide.close();
  }
});

test("a settling menu gets one automatic re-observation after a stale answer, with no endless model loop", async () => {
  const f = fixture();
  let calls = 0;
  try {
    await startGuide(f, async () => {
      calls++;
      h.pixels = calls % 2 ? 120 : 0;
      return {
        ...interactive("advanced"),
        answer: "Must not paint stale coordinates.",
      };
    });
    h.activity++;
    h.pixels = 0;
    await waitFor(() => calls === 2);
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(calls, 2);
    assert.deepEqual(f.progress, []);
    assert.ok(
      !h.events.some(
        (e: any) => e.value.guide?.text === "Must not paint stale coordinates.",
      ),
    );
  } finally {
    f.guide.close();
  }
});

test("unresolved native IDs never tell the user to click an unpainted target", async () => {
  const f = fixture();
  h.native = true;
  try {
    const receipt = await f.guide.answer({
      question: "settings dimana?",
      style: "chill",
      signal: f.controller.signal,
      generate: async () => ({
        ...interactive(),
        guide: { ...interactive().guide!, elementId: "invented" },
      }),
      continueWith: async () => interactive(),
      onAnswer: (s) => f.answers.push(s),
    });
    assert.equal(receipt.highlighted, false);
    assert.equal(receipt.status, "ambiguous");
    assert.match(receipt.answer, /belum bisa memastikan/);
    assert.equal(f.answers[0], receipt.answer);
    assert.equal(
      h.events.filter((e: any) => e.value.guide).at(-1).value.guide.text,
      receipt.answer,
    );
  } finally {
    f.guide.close();
  }
});

test("native notification advances a unique verified planned menu item without another model call", async () => {
  const f = fixture();
  h.native = true;
  const trigger = {
    id: "menu.1",
    name: "Insert",
    role: "AXMenuBarItem",
    enabled: true,
    hitVerified: true,
    bounds: { x: 1080, y: 50, width: 72, height: 50 },
  };
  const item = {
    id: "menu.1.0.2",
    name: "Table of contents",
    role: "AXMenuItem",
    enabled: true,
    hitVerified: true,
    bounds: { x: 1080, y: 100, width: 160, height: 30 },
  };
  h.elements = [trigger];
  let requests = 0;
  try {
    await f.guide.answer({
      question: "Bikin daftar isi",
      style: "chill",
      signal: f.controller.signal,
      generate: async () => ({
        ...interactive(),
        guide: {
          ...interactive().guide!,
          elementId: trigger.id,
          nextMenu: {
            name: item.name,
            instruction: "Klik Table of contents.",
            expected: "Daftar isi terlihat",
          },
        },
      }),
      continueWith: async () => {
        requests++;
        return {
          ...interactive(),
          status: "not_found",
          box: [],
          guide: {
            ...interactive().guide!,
            progress: "done",
            evidence: "Daftar isi terlihat",
          },
        };
      },
      onAnswer: (t) => f.answers.push(t),
      onProgress: (t) => f.progress.push(t),
    });
    assert.equal(h.subscriptions, 1);
    h.elements = [trigger, item];
    h.pixels = 0;
    h.notify(); // No input counter change: menu opened asynchronously.
    await waitFor(() => f.progress.includes("Klik Table of contents."));
    assert.equal(requests, 0);
    assert.equal(f.guide.guiding, true);
    assert.ok(
      f.guide.diagnostics.some(
        (s) => s.stage === "decision" && s.source === "local",
      ),
    );
    h.activity++;
    h.pixels = 100;
    h.elements = [trigger];
    h.notify();
    await waitFor(() => requests === 1);
    await waitFor(() => h.unsubscriptions === 1);
    assert.ok(f.progress.includes("Klik menu Insert ini."));
  } finally {
    f.guide.close();
  }
});
test("an event burst during inference is single-flight and unsubscribed on cancellation", async () => {
  const f = fixture();
  let calls = 0,
    release!: (r: GroundingResult) => void;
  try {
    await startGuide(f, () => {
      calls++;
      return new Promise((r) => {
        release = r;
      });
    });
    h.activity++;
    h.pixels = 0;
    h.notify();
    await waitFor(() => calls === 1);
    for (let i = 0; i < 30; i++) h.notify();
    await new Promise((r) => setTimeout(r, 35));
    assert.equal(calls, 1);
    const late = h.notify;
    f.guide.cancel(undefined, false);
    late();
    release(interactive("advanced"));
    await new Promise((r) => setTimeout(r, 35));
    assert.equal(calls, 1);
    assert.equal(h.unsubscriptions, 1);
    assert.equal(f.progress.length, 0);
  } finally {
    f.guide.close();
  }
});
