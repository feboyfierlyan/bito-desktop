import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSelectedFile, parseFilePickerRequest } from "../electron/selected-files";

test("generic attachment picker rejects renderer-supplied filesystem paths", () => {
  assert.throws(() => parseFilePickerRequest({ paths: ["/private/secret.json"] }));
  assert.deepEqual(parseFilePickerRequest({ slots: 2 }), { slots: 2 });
});
test("selected attachment reader rejects devices, directories and oversized files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bito-file-test-"));
  try {
    const path = join(dir, "fixture.txt");
    await writeFile(path, "synthetic fixture");
    assert.equal((await readSelectedFile(path)).toString(), "synthetic fixture");
    await assert.rejects(readSelectedFile(path, 4), /terlalu besar/);
    await assert.rejects(readSelectedFile(dir));
    if (process.platform !== "win32") await assert.rejects(readSelectedFile("/dev/zero"), /dokumen biasa/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
