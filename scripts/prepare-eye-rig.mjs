import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// This export stripped scene names. Restore only the two existing pupil names;
// no object indices, artwork, animation keys or state machines are changed.
const original = await readFile(
  new URL("../assets/bito-original.riv", import.meta.url),
);
const expected =
  "37076503371c5b285142e1c3b1b8df412cc992615ff8b75578b4214e0679f8b3";
if (createHash("sha256").update(original).digest("hex") !== expected)
  throw new Error(
    "Bito's Rive source changed. Re-identify the pupil nodes before preparing the eye rig.",
  );
let prepared = original;
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
