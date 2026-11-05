import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { AreaSelection as Controller } from "../electron/area-selection";
const key = "__bito_area_test";
let folder: string, AreaSelection: typeof Controller, h: any;
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "bito-area-unit-"));
  await build({
    entryPoints: [resolve("electron/area-selection.ts")],
    outfile: join(folder, "area.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    define: { "process.platform": '"darwin"' },
    plugins: [
      {
        name: "fake-area",
        setup(b) {
          b.onResolve({ filter: /^electron$/ }, () => ({
            path: "electron",
            namespace: "fake",
          }));
          b.onResolve({ filter: /^\.\/screen-context$/ }, () => ({
            path: "context",
            namespace: "fake",
          }));
          b.onLoad({ filter: /.*/, namespace: "fake" }, ({ path }) => ({
            contents:
              path === "context"
                ? `
    export class ScreenContext {
      watchAreaShortcut(fn){const h=globalThis.${key};h.nativeShortcut=fn;return()=>{h.nativeShortcut=null}}
      async captureSelection(){const h=globalThis.${key};h.captureCount++;h.log.push('capture');if(h.holdCapture)await h.holdCapture;return h.native?{data:'/9j/AAAA',width:2880,height:1800,bounds:{x:-1440,y:0,width:1440,height:900}}:null}
      close(){}
    }
  `
                : `
    import {EventEmitter} from 'node:events'; const h=()=>globalThis.${key};
    export const ipcMain=Object.assign(new EventEmitter(),{handle:(n,f)=>h().handlers.set(n,f),removeHandler:n=>h().handlers.delete(n)});
    export class BrowserWindow extends EventEmitter {
      destroyed=false;visible=false;webContents={mainFrame:{},send:(name,value)=>{h().events.push({name,value});if(name==='bito:area-frame'&&h().autoPaint)queueMicrotask(()=>ipcMain.emit('bito:area-painted',{sender:this.webContents,senderFrame:this.webContents.mainFrame},value.session));},setWindowOpenHandler(){},on(){}};
      constructor(options){super();h().windows.push(this);h().options=options;}
      async loadURL(){queueMicrotask(()=>ipcMain.emit('bito:area-ready',{sender:this.webContents,senderFrame:this.webContents.mainFrame}));}
      loadFile(){return this.loadURL()} setAlwaysOnTop(){} setVisibleOnAllWorkspaces(){} setBounds(b){this.bounds=b}
      show(){this.visible=true;h().log.push('show')}focus(){h().log.push('focus')}hide(){this.visible=false;h().log.push('hide')}isDestroyed(){return this.destroyed}destroy(){this.destroyed=true;this.emit('closed')}
    }
    export const globalShortcut={register:(k,fn)=>{if(h().conflict===k)return false;h().shortcuts.set(k,fn);return true},unregister:k=>h().shortcuts.delete(k)};
    export const screen={getCursorScreenPoint:()=>({x:-600,y:400}),getDisplayNearestPoint:()=>({id:9,scaleFactor:2,bounds:{x:-1440,y:0,width:1440,height:900}})};
    export const systemPreferences={getMediaAccessStatus:()=>h().permission};
    const image=(width=2880,height=1800)=>({isEmpty:()=>false,getSize:()=>({width,height}),toDataURL:()=> 'data:image/jpeg;base64,/9j/AAAA',crop:r=>{h().crop=r;return image(r.width,r.height)},resize:r=>image(r.width,r.height),toJPEG:()=>Buffer.from([255,216,255,0,0,0])});
    export const nativeImage={createFromBuffer:()=>image()};
    export const desktopCapturer={getSources:async()=>{h().fallback++;return[{display_id:'9',thumbnail:image()}]}};
  `,
          }));
        },
      },
    ],
  });
  const mod = await import(pathToFileURL(join(folder, "area.mjs")).href);
  AreaSelection = mod.AreaSelection;
});
after(async () => {
  await rm(folder, { recursive: true, force: true });
  delete (globalThis as any)[key];
});
function fixture(conflict?: string) {
  h = {
    conflict,
    windows: [],
    events: [],
    log: [],
    shortcuts: new Map(),
    handlers: new Map(),
    owner: "A",
    enabled: true,
    permission: "granted",
    native: true,
    autoPaint: true,
    captureCount: 0,
    fallback: 0,
    answers: [],
    errors: [],
    busy: undefined,
  };
  (globalThis as any)[key] = h;
  const area = new AreaSelection({
    directory: folder,
    owner: () => h.owner,
    enabled: () => h.enabled,
    reducedMotion: () => true,
    beforeCapture: () => h.log.push("before"),
    canSubmit: () => h.busy,
    submitted: (question, image, id) => h.answers.push({ question, image, id }),
    failed: (text) => h.errors.push(text),
  });
  area.install();
  return area;
}
const wait = async (fn: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw Error("fixture timed out");
};
const frame = () =>
  h.events.findLast((e: any) => e.name === "bito:area-frame")?.value;
const event = () => ({
  sender: h.windows[0].webContents,
  senderFrame: h.windows[0].webContents.mainFrame,
});
const payload = () => ({
  session: frame().session,
  rect: { x: 100, y: 80, width: 300, height: 200 },
  question: "  Jelasin ini  ",
});
test("capture precedes focus, overlay stays hidden until real frame painted, crop alone is handed to chat", async () => {
  const area = fixture();
  h.autoPaint = false;
  try {
    await area.start();
    assert.equal(h.windows[0].visible, false);
    assert.equal(h.answers.length, 0);
    assert.equal(h.captureCount, 1);
    assert.equal(h.fallback, 0);
    assert.equal(h.options.webPreferences.sandbox, true);
    assert.equal(h.options.webPreferences.nodeIntegration, false);
    assert.equal(h.options.acceptFirstMouse, true);
    // Wrong frame/session and hostile web contents cannot make a selection visible.
    const session = (area as any).session;
    assert.ok(session.image);
    assert.equal(session.painted, false);
    // Exercise installed handler via its main controller IPC listener.
    const ownerEvent = event();
    // Painted callback is deliberately extracted from our fake module export below.
    const painted = (area as any).handlers.find(
      (x: any) => x.event === "bito:area-painted",
    ).fn;
    painted({ ...ownerEvent, senderFrame: {} }, session.id);
    assert.equal(h.windows[0].visible, false);
    painted(ownerEvent, "stale");
    assert.equal(h.windows[0].visible, false);
    painted(ownerEvent, session.id);
    assert.equal(h.windows[0].visible, true);
    assert.ok(h.log.indexOf("capture") < h.log.indexOf("focus"));
    const result = await h.handlers.get("bito:area-submit")(
      ownerEvent,
      payload(),
    );
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(h.crop, { x: 200, y: 160, width: 600, height: 400 });
    assert.equal(h.answers[0].question, "Jelasin ini");
    assert.equal(h.answers[0].image.width, 600);
    assert.equal(session.image, undefined);
    assert.equal((area as any).session, undefined);
    assert.equal(h.windows[0].visible, false);
    assert.equal(h.shortcuts.has("Escape"), false);
  } finally {
    area.close();
  }
});
test("stale, subframe, malformed and duplicate submissions cannot send pixels", async () => {
  const area = fixture();
  try {
    await area.start();
    await wait(() => h.windows[0].visible);
    const submit = h.handlers.get("bito:area-submit"),
      valid = payload();
    for (const [e, p] of [
      [{ ...event(), sender: {} }, valid],
      [{ ...event(), senderFrame: {} }, valid],
      [event(), { ...valid, session: "old" }],
      [event(), { ...valid, rect: { x: 0, y: 0, width: 1, height: 50 } }],
      [event(), { ...valid, question: "x".repeat(4001) }],
    ])
      assert.equal((await submit(e, p)).ok, false);
    assert.equal(h.answers.length, 0);
    h.busy = "Tunggu jawaban selesai";
    assert.equal((await submit(event(), valid)).error, h.busy);
    h.busy = undefined;
    assert.equal((await submit(event(), valid)).ok, true);
    assert.equal((await submit(event(), valid)).ok, false);
    assert.equal(h.answers.length, 1);
  } finally {
    area.close();
  }
});
test("escape, blur and shortcut toggle cancel without sending; each session gets a fresh capture", async () => {
  const area = fixture();
  try {
    await area.start();
    await wait(() => h.windows[0].visible);
    h.shortcuts.get("Escape")();
    await wait(() => !h.windows[0].visible);
    assert.equal(h.answers.length, 0);
    await area.start();
    await wait(() => h.windows[0].visible);
    h.windows[0].emit("blur");
    await wait(() => !h.windows[0].visible);
    await area.start();
    await wait(() => h.windows[0].visible);
    await area.start();
    assert.equal(h.windows[0].visible, false);
    assert.equal(h.captureCount, 3);
  } finally {
    area.close();
    area.close();
    assert.equal(h.shortcuts.size, 0);
    assert.equal(h.handlers.size, 0);
    assert.equal(h.nativeShortcut, null);
  }
});
test("cancel while capture pending or switching accounts never reveals stale display pixels", async () => {
  for (const cancel of [true, false]) {
    const area = fixture();
    let release!: () => void;
    h.holdCapture = new Promise<void>((r) => {
      release = r;
    });
    try {
      const starting = area.start();
      await wait(() => h.captureCount === 1);
      if (cancel) await area.cancel();
      else h.owner = "B";
      release();
      await starting;
      assert.equal(h.windows[0].visible, false);
      assert.equal(frame(), undefined);
      assert.equal(h.answers.length, 0);
    } finally {
      area.close();
    }
  }
});
test("screen permission failure is explicit and never opens a black window; native capture has portable fallback", async () => {
  let area = fixture();
  try {
    h.permission = "denied";
    await area.start();
    assert.equal(h.captureCount, 0);
    assert.equal(h.windows[0].visible, false);
    assert.match(h.errors[0], /Perekaman Layar/);
  } finally {
    area.close();
  }
  area = fixture();
  try {
    h.native = false;
    await area.start();
    await wait(() => h.windows[0].visible);
    assert.equal(h.fallback, 1);
  } finally {
    area.close();
  }
});
test("prewarm never captures; locked state disabled; Option+Space remains unregistered", async () => {
  const area = fixture();
  try {
    h.enabled = false;
    await area.start();
    assert.equal(h.captureCount, 0);
    assert.equal(h.answers.length, 0);
    assert.equal(area.shortcut, "CommandOrControl+Shift+2");
    assert.equal(h.shortcuts.has("Alt+Space"), false);
    assert.equal(h.shortcuts.has("Option+Space"), false);
    assert.equal(typeof h.nativeShortcut, "function");
  } finally {
    area.close();
  }
});

test("crop can be staged without asking a question in the selection overlay", async()=>{
 const area=fixture();
 try {await area.start();await wait(()=>h.windows[0].visible);
 const result=await h.handlers.get("bito:area-submit")(event(),{...payload(),question:""});
 assert.equal(result.ok,true);assert.equal(h.answers.length,1);assert.equal(h.answers[0].question,"");
 assert.equal(h.windows[0].visible,false);
 }finally{area.close()}
});
