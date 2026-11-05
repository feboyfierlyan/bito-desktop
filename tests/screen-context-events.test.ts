import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

test("native notifications never consume RPCs, and stale subscription events cannot wake another guide", async () => {
  const folder = await mkdtemp(join(tmpdir(), "bito-context-events-"));
  try {
    const out = join(folder, "context.cjs");
    await build({
      stdin: {
        contents: `export {ScreenContext} from './electron/screen-context'; export {host} from 'node:child_process';`,
        resolveDir: process.cwd(),
        loader: "ts",
      },
      outfile: out,
      bundle: true,
      platform: "node",
      format: "cjs",
      define: { "process.platform": '"darwin"' },
      plugins: [
        {
          name: "native-host",
          setup(b) {
            b.onResolve({ filter: /^node:child_process$/ }, () => ({
              path: "host",
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents: `
          const {EventEmitter}=require('node:events');
          const {PassThrough,Writable}=require('node:stream');
          export const host={commands:[],child:null};
          export function spawn(){
            const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),
              stdin:new Writable({write(data,_encoding,done){host.commands.push(String(data).trim());done();}}),
              kill(){this.killed=true;}});
            host.child=child;return child;
          }
        `,
            }));
          },
        },
      ],
    });
    const { ScreenContext, host } = createRequire(import.meta.url)(out);
    const context = new ScreenContext(folder);
    const reply = (v: unknown) =>
      host.child.stdout.write(JSON.stringify(v) + "\n");
    const waitCommand = async (command: string, count = 1) => {
      for (
        let i = 0;
        i < 20 &&
        host.commands.filter((v: string) => v === command).length < count;
        i++
      )
        await new Promise<void>((r) => setImmediate(r));
      assert.ok(
        host.commands.filter((v: string) => v === command).length >= count,
        command,
      );
    };
    let first = 0,
      second = 0;
    const stopFirst = context.subscribe(7, () => first++);
    await waitCommand("watch:7:1");
    reply(true);
    const read = context.read();
    await waitCommand("read");
    reply({ event: "interface-changed", pid: 7, token: 1 });
    reply({ event: "interface-changed", pid: 8, token: 1 });
    reply({ event: "future-event", pid: 7, token: 1 });
    const window = {
      id: "5",
      pid: 7,
      app: "Fixture",
      title: "",
      bounds: { x: 0, y: 0, width: 1000, height: 800 },
    };
    reply(window);
    assert.deepEqual(await read, window);
    assert.equal(first, 1);
    stopFirst();
    await waitCommand("unwatch:1");
    reply(true);
    const stopSecond = context.subscribe(7, () => second++);
    await waitCommand("watch:7:2");
    reply(true);
    reply({ event: "interface-changed", pid: 7, token: 1 });
    reply({ event: "interface-changed", pid: 7, token: 2 });
    assert.equal(first, 1);
    assert.equal(second, 1);
    const observation = context.observe(7);
    await waitCommand("observe:7");
    reply({ event: "interface-changed", pid: 7, token: 2 });
    reply({
      frontPid: 7,
      activity: "2",
      accessible: true,
      elements: [
        {
          id: "menu",
          role: "AXMenuItem",
          name: "Open",
          enabled: true,
          hitVerified: true,
          bounds: { x: 10, y: 10, width: 50, height: 20 },
        },
      ],
    });
    assert.equal((await observation)?.elements[0].hitVerified, true);
    stopSecond();
    await waitCommand("unwatch:2");
    reply(true);
    reply({ event: "interface-changed", pid: 7, token: 2 });
    assert.equal(second, 2);
    let shortcut = 0;
    const stopShortcut = context.watchAreaShortcut(() => shortcut++);
    await waitCommand("area-shortcut:3");
    reply(true);
    const pending = context.read();
    await waitCommand("read", 2);
    reply({ event: "area-shortcut", token: 2 });
    reply({ event: "area-shortcut", token: 3 });
    reply(window);
    assert.deepEqual(await pending, window);
    assert.equal(shortcut, 1);
    // A failed capture/helper crash must not permanently disable the shortcut.
    const lostHelper = host.child;
    lostHelper.emit("exit", 1);
    await new Promise((r) => setTimeout(r, 1100));
    await waitCommand("area-shortcut:3", 2);
    reply(true);
    lostHelper.stdout.write(
      JSON.stringify({ event: "area-shortcut", token: 3 }) + "\n",
    );
    reply({ event: "area-shortcut", token: 3 });
    assert.equal(shortcut, 2);
    stopShortcut();
    await waitCommand("stop-area-shortcut:3");
    reply(true);
    reply({ event: "area-shortcut", token: 3 });
    assert.equal(shortcut, 2);
    // Shutdown must invalidate queued RPCs instead of spawning a helper again.
    const one = context.read(),
      two = context.observe(7);
    context.close();
    await one;
    await two;
    assert.equal(host.child.killed, true);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
