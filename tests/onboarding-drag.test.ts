import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

// Exercise real drag IPC in memory, without launching or driving the desktop.
test("onboarding waits for the visible native frame, then one setup gesture follows the cursor through release", async () => {
  const folder = await mkdtemp(join(tmpdir(), "bito-onboarding-drag-"));
  let h: any;
  try {
    const out = join(folder, "main.cjs");
    await build({
      entryPoints: [resolve("electron/main.ts")], outfile: out,
      bundle: true, platform: "node", format: "cjs", target: "node24",
      define: { __BITO_PUBLIC_CONFIG__: '{"url":"","publishableKey":""}' },
      plugins: [{ name: "drag-host", setup(build) {
        build.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "test" }));
        build.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: `
          const {EventEmitter}=require('node:events');
          export const app=Object.assign(new EventEmitter(),{setName(){},setPath(){},requestSingleInstanceLock:()=>true,whenReady:()=>new Promise(()=>{})});
          export const ipcMain=Object.assign(new EventEmitter(),{handle(){},removeHandler(){}});
          export const screen={cursor:{x:450,y:350},getCursorScreenPoint(){return {...this.cursor}}};
          export const BrowserWindow=class {};
          export const Menu={},MenuItem=class {},Tray=class {},nativeImage={},dialog={},Notification=class {},safeStorage={},shell={},powerMonitor={},desktopCapturer={},systemPreferences={},globalShortcut={};
        ` }));
        build.onLoad({ filter: /electron\/main\.ts$/ }, async ({path}) => ({
          contents: (await readFile(path, "utf8")) + `
            export const dragTest={ipcMain,screen,command,published:[],
              fixture(p,s){state=defaultState();pet=p;studio=s;quitting=false;switchingAccount=false;
                onboarding={view:{step:2,phase:'anchored',talking:false,characterReady:true},originalVisible:false};
                characterReady=true;characterFrame={width:104,height:104};cloud={view:{status:'ready',userId:'test'}};activeAccount='test';cloudConfigError=undefined;
                screenGuide.cancel=()=>{};publish=()=>{dragTest.published.push({phase:onboarding.view.phase,nativeReady:petFrameReady()&&pet.isVisible()})};endChatResize=()=>{};
                finishPresentation=()=>{onboarding.view.phase='departing'};
                returnToAnchor=()=>{onboarding.view.phase='ready'};registerIPC();},
              anchor(phase){onboarding.view.phase=phase;onboarding.slot={x:200,y:100,width:282,height:282};positionAnchor();},
              phase:()=>onboarding.view.phase,
              hide(){pet.hide()},
              cleanup(){clearTimeout(dragWatch);stopDragMotion();dragging=false;dragOrigin=null;}
            };
          `, loader: "ts",
        }));
      }}],
    });
    h = createRequire(import.meta.url)(out).dragTest;
    let bounds = { x: 400, y: 300, width: 282, height: 282 };
    let moves = 0;
    let preparing = true, ignored = true, visible = false;
    const stable = () => { if (!preparing) throw Error("native drag surface must remain stable during pointer-down"); };
    const pet = {
      webContents: { id: 11, send() {} }, isDestroyed: () => false,
      getBounds: () => ({...bounds}), getContentBounds: () => ({...bounds}),
      setPosition(x: number, y: number) { bounds = {...bounds, x, y}; moves++; },
      setBounds(next: typeof bounds) {stable();bounds={...next};}, setParentWindow: stable, setVisibleOnAllWorkspaces: stable,
      setFocusable:stable,
      setAlwaysOnTop: stable, showInactive() {stable();visible=true;}, hide() {stable();visible=false;},
      getParentWindow:()=>null, isVisible:()=>visible,
      setIgnoreMouseEvents(value: boolean) {stable();ignored=value;},
    };
    const studio = { isDestroyed:()=>false,isVisible:()=>true,isMinimized:()=>false,isFocused:()=>true, webContents: { id: 22, getZoomFactor:()=>1 }, getBounds: () => ({x:200,y:200,width:1000,height:700}), getContentBounds:()=>({x:200,y:200,width:1000,height:700}) };
    h.fixture(pet, studio);
    const event = { sender: studio.webContents };
    const other = { sender: pet.webContents };
    await h.command("onboarding-arm");
    assert.equal(h.phase(), "anchored", "arming without an anchor must wait");
    await h.command("onboarding-anchor", {x:200,y:100,width:282,height:282});
    assert.equal(h.phase(), "anchored", "the old 104px login frame cannot arm a 282px pet");
    assert.equal(visible,false);
    h.ipcMain.emit("bito:drag-start", event);
    assert.equal(h.phase(), "anchored", "hidden/unpainted characters cannot begin a fake held gesture");
    await h.command("character-ready", {width:282,height:282});
    assert.equal(h.phase(), "ready", "the pending arm completes automatically after the correct paint");
    assert.equal(visible,true);
    assert.equal(h.published.at(-1).nativeReady,true,"the inline renderer is told that the native visual is ready");
    assert.equal(ignored,true,"the setup button exclusively owns input");
    h.ipcMain.emit("bito:hit",{sender:pet.webContents},true);
    assert.equal(ignored,true,"native hover cannot steal the first setup press");
    h.ipcMain.emit("bito:drag-start",other);
    assert.equal(h.phase(),"ready","the visual window cannot start a competing gesture");
    h.hide();
    h.ipcMain.emit("bito:drag-start",event);
    assert.equal(h.phase(),"ready","even a ready phase cannot drag an invisible pet");
    await h.command("onboarding-anchor",{x:200,y:100,width:282,height:282});
    assert.equal(visible,true);
    preparing=false;
    h.ipcMain.emit("bito:drag-start", {sender:{id:99}});
    assert.equal(h.phase(), "ready", "unrelated windows cannot start the gesture");
    h.ipcMain.emit("bito:drag-start", event);
    assert.equal(h.phase(), "dragging");
    h.ipcMain.emit("bito:drag-start", other);
    h.ipcMain.emit("bito:drag-end", other);
    h.ipcMain.emit("bito:hit",{sender:pet.webContents},false);
    assert.equal(h.phase(), "dragging", "another surface cannot steal or end an active gesture");
    assert.deepEqual(bounds, {x:400,y:300,width:282,height:282}, "pressing must not jump");
    h.screen.cursor = {x:-150,y:150};
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.deepEqual(bounds, {x:-200,y:100,width:282,height:282}, "native sampling moves Bito outside setup, including negative display coordinates");
    h.ipcMain.emit("bito:drag-move", event, 9999, 9999);
    assert.equal(bounds.x, -200, "DOM coordinates cannot fight native coordinates");
    h.screen.cursor = {x:-250,y:200};
    h.ipcMain.emit("bito:drag-end", event);
    assert.equal(h.phase(), "departing");
    assert.deepEqual(bounds, {x:-300,y:150,width:282,height:282}, "release flushes the last cursor position before deciding the drop");
    const stoppedMoves = moves;
    h.screen.cursor = {x:800,y:500};
    h.ipcMain.emit("bito:drag-move", event, 100, 100);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(moves, stoppedMoves, "late movement cannot continue after release");
  } finally {
    h?.cleanup();
    await rm(folder, {recursive:true,force:true});
  }
});
