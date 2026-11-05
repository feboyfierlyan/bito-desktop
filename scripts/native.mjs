import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdtempSync,
  renameSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const directory = resolve("dist-electron/native");
mkdirSync(directory, { recursive: true });
copyFileSync(
  "electron/native/screen-context.ps1",
  `${directory}/screen-context.ps1`,
);
if (process.platform === "darwin") {
  const source = "electron/native/screen-context.swift";
  const hash = createHash("sha256").update(readFileSync(source)).digest("hex");
  const stamp = `${directory}/source.sha256`;
  if (
    !existsSync(`${directory}/screen-context`) ||
    !existsSync(stamp) ||
    readFileSync(stamp, "utf8") !== hash
  ) {
    // The revision watcher and an explicit check can build concurrently. Each
    // compiler gets private files; publish the complete universal helper atomically.
    const temporary = mkdtempSync(`${directory}/build-`);
    try {
      for (const arch of ["arm64", "x86_64"]) {
        execFileSync(
          "/usr/bin/swiftc",
          [
            source,
            "-parse-as-library",
            "-O",
            "-target",
            `${arch}-apple-macosx12.0`,
            "-module-cache-path",
            `${temporary}/module-cache`,
            "-o",
            `${temporary}/screen-context-${arch}`,
          ],
          { stdio: "inherit" },
        );
      }
      execFileSync(
        "/usr/bin/lipo",
        [
          "-create",
          `${temporary}/screen-context-arm64`,
          `${temporary}/screen-context-x86_64`,
          "-output",
          `${temporary}/screen-context`,
        ],
        { stdio: "inherit" },
      );
      renameSync(`${temporary}/screen-context`, `${directory}/screen-context`);
      writeFileSync(stamp, hash);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
}
