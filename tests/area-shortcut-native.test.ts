import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Compile the real Swift chord reducer with synthetic flags only. No keyboard
// monitoring, actual key presses, screenshot or app interaction in this test.
test(
  "native Fn + left Control fires once, in either order, with no extra modifiers",
  { skip: process.platform !== "darwin" },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "bito-modifiers-"));
    try {
      const source = await readFile(
        "electron/native/screen-context.swift",
        "utf8",
      );
      const reducer = source
        .split("// BEGIN AREA SHORTCUT CHORD\n")[1]
        .split("// END AREA SHORTCUT CHORD")[0];
      const harness = `import CoreGraphics\n${reducer}\n
 let fn: CGEventFlags = .maskSecondaryFn
 let ctrl: CGEventFlags = .maskControl
 let both: CGEventFlags = [fn,ctrl]
 var c=AreaShortcutChord()
 precondition(!c.update(fn,leftControl:false))
 precondition(c.update(both,leftControl:true))
 for _ in 0..<20 { precondition(!c.update(both,leftControl:true)) }
 precondition(!c.update(ctrl,leftControl:true))
 precondition(c.update(both,leftControl:true))
 precondition(!c.update([],leftControl:false))
 precondition(!c.update(both,leftControl:false)) // Right Control cannot trigger.
 precondition(!c.update([],leftControl:false))
 precondition(!c.update([fn,ctrl,.maskAlternate],leftControl:true))
 precondition(!c.update(both,leftControl:true)) // Releasing extra modifier is not a new press.
 precondition(!c.update([],leftControl:false))
 precondition(!c.update(ctrl,leftControl:true))
 precondition(c.update(both,leftControl:true)) // Control first also works.
 c.reset(both,leftControl:true)
 precondition(!c.update(both,leftControl:true)) // Reconnecting while held cannot toggle.
 precondition(!c.update([],leftControl:false))
 precondition(c.update(both,leftControl:true))
 print("passed")
 `;
      const file = join(folder, "main.swift"),
        binary = join(folder, "chord");
      await writeFile(file, harness);
      execFileSync(
        "/usr/bin/swiftc",
        [file, "-module-cache-path", join(folder, "cache"), "-o", binary],
        { timeout: 30000, stdio: "pipe" },
      );
      assert.equal(execFileSync(binary, { encoding: "utf8" }).trim(), "passed");
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);
