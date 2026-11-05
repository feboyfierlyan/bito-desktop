import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { Store } from "../electron/store";

// Exercise the real main-process shutdown handler and late renderer IPC using
// an in-memory Electron host. Does not launch Bito or touch the user's desktop.
test("shutdown saves once, ignores late drag/display events and keeps the database readable on restart", async () => {
  const folder = await mkdtemp(join(tmpdir(), "bito-shutdown-"));
  try {
    const out = join(folder, "main.cjs");
    await build({
      entryPoints: [resolve("electron/main.ts")],
      outfile: out,
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node24",
      define: { __BITO_PUBLIC_CONFIG__: '{"url":"","publishableKey":""}' },
      plugins: [
        {
          name: "shutdown-host",
          setup(build) {
            build.onResolve({ filter: /^electron$/ }, () => ({
              path: "electron",
              namespace: "test",
            }));
            build.onLoad({ filter: /.*/, namespace: "test" }, () => ({
              contents: `
          const {EventEmitter}=require('node:events');
          export const app=Object.assign(new EventEmitter(),{setName(){},setPath(){},requestSingleInstanceLock:()=>true,
            whenReady:()=>new Promise(()=>{}),quit(){}});
          export const ipcMain=Object.assign(new EventEmitter(),{handle(){},removeHandler(){}});
          export const screen={getDisplayMatching:()=>({workArea:{x:0,y:25,width:1440,height:975}})};
          export const BrowserWindow=class {};
          export const Menu={},MenuItem=class {},Tray=class {},nativeImage={},dialog={},Notification=class {},safeStorage={},shell={},powerMonitor={},desktopCapturer={},systemPreferences={},globalShortcut={};
        `,
            }));
            build.onLoad(
              { filter: /electron[\\/]main\.ts$/ },
              async ({ path }) => ({
                contents:
                  (await readFile(path, "utf8")) +
                  `
          export const lifecycleTest = {
            app, ipcMain, persist, endDrag, recoverPosition,
            fixture(s, p) {store=s; state=defaultState(); state.onboarded=true; pet=p;
              dragging=true; dragOrigin={x:0,y:0}; quitting=false; registerIPC(); return state;}
          };
        `,
                loader: "ts",
              }),
            );
          },
        },
      ],
    });
    const { lifecycleTest: h } = createRequire(import.meta.url)(out);
    const file = join(folder, "state.sqlite"),
      store = new Store(file);
    let moves = 0,
      published = 0;
    const pet = {
      webContents: {
        id: 11,
        send() {
          published++;
        },
      },
      isDestroyed: () => false,
      getBounds: () => ({ x: 321, y: 456, width: 220, height: 220 }),
      setPosition() {
        moves++;
      },
    };
    const state = h.fixture(store, pet);
    state.profile.name = "Regression test";
    h.app.emit("before-quit", {
      preventDefault() {
        throw Error("unexpected active request");
      },
    });
    assert.equal(store.isOpen, false);
    const afterSavePublished = published;
    assert.doesNotThrow(() => {
      h.ipcMain.emit("bito:drag-end", { sender: pet.webContents });
      h.ipcMain.emit("bito:drag-start", { sender: pet.webContents });
      h.endDrag();
      h.recoverPosition();
      h.persist();
      h.app.emit("before-quit", {}); // Duplicate native shutdown notification.
      store.close();
    });
    assert.equal(moves, 0);
    assert.equal(published, afterSavePublished);
    const reopened = new Store(file);
    try {
      assert.deepEqual(reopened.load().position, { x: 321, y: 456 });
      assert.equal(reopened.load().profile.name, "Regression test");
    } finally {
      reopened.close();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
