import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Restore the two pupil names stripped by export and clear the single exported
// artboard background fill. Keep object indices, animation keys and VM bindings.
const original = await readFile(
  new URL("../assets/bito-original.riv", import.meta.url),
);
const expected =
  "37076503371c5b285142e1c3b1b8df412cc992615ff8b75578b4214e0679f8b3";
if (createHash("sha256").update(original).digest("hex") !== expected)
  throw new Error(
    "Bito's Rive source changed. Re-identify the pupil nodes before preparing the eye rig.",
  );
const background = Buffer.from([
  0x12, 0x05, 0xb8, 0x01, 0x25, 0xf7, 0xf7, 0xf8, 0xff, 0x00,
]);
const backgroundOffset = 4000;
if (
  !original
    .subarray(backgroundOffset, backgroundOffset + background.length)
    .equals(background)
)
  throw new Error(
    "Bito's artboard background fill changed; inspect the asset before preparing transparency.",
  );
let prepared = Buffer.from(original);
// SolidColor (type 18), parent 184, color property 37: ARGB #FFF8F7F7.
// Clear alpha in the source fill so antialiasing happens against transparency.
prepared[backgroundOffset + 8] = 0;
for (const [offset, name] of [
  [3007, "Pupil_R"],
  [2916, "Pupil_L"],
]) {
  if (original[offset] !== 0) throw new Error("Invalid pupil object boundary");
  const property = Buffer.concat([
    Buffer.from([4, name.length]),
    Buffer.from(name),
  ]);
  prepared = Buffer.concat([
    prepared.subarray(0, offset),
    property,
    prepared.subarray(offset),
  ]);
}
await writeFile(new URL("../public/bito.riv", import.meta.url), prepared);
