import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

test("transparent asset changes only the background alpha and restores pupil names", async () => {
  const original = await readFile(
    new URL("../assets/bito-original.riv", import.meta.url),
  );
  let prepared = await readFile(new URL("../public/bito.riv", import.meta.url));
  for (const name of ["Pupil_L", "Pupil_R"]) {
    const property = Buffer.concat([
      Buffer.from([4, name.length]),
      Buffer.from(name),
    ]);
    const index = prepared.indexOf(property);
    assert.ok(index >= 0, `${name} must remain available to gaze tracking`);
    prepared = Buffer.concat([
      prepared.subarray(0, index),
      prepared.subarray(index + property.length),
    ]);
  }
  assert.equal(prepared.length, original.length);
  const changes = [...original.keys()].filter(
    (i) => original[i] !== prepared[i],
  );
  assert.deepEqual(
    changes,
    [4008],
    "artwork, eye whites, animation and bindings must remain byte-identical",
  );
  assert.equal(original[4008], 255);
  assert.equal(prepared[4008], 0);
});

test("prepared Rive still imports with its state machine and both pupil nodes", async () => {
  const { RuntimeLoader } = createRequire(import.meta.url)(
    "@rive-app/canvas",
  ) as typeof import("@rive-app/canvas");
  const wasm = await readFile(new URL("../public/rive.wasm", import.meta.url));
  RuntimeLoader.setWasmBinary(Uint8Array.from(wasm).buffer);
  RuntimeLoader.setWasmFallbackUrl(null);
  const runtime = await RuntimeLoader.awaitInstance();
  const file = await runtime.load(
    new Uint8Array(
      await readFile(new URL("../public/bito.riv", import.meta.url)),
    ),
  );
  const board = file.defaultArtboard();
  try {
    assert.ok(board.node("Pupil_L"));
    assert.ok(board.node("Pupil_R"));
    assert.equal(board.stateMachineCount(), 1);
    assert.ok(board.stateMachineByName("State Machine 1"));
  } finally {
    board.delete();
    (file as typeof file & { delete(): void }).delete();
  }
});
