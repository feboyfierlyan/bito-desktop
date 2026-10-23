import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const directory = process.argv[2] || `release/${version}`;
const expected = [
  `Bito-${version}-macOS-arm64.dmg`,
  `Bito-${version}-macOS-arm64.zip`,
  `Bito-${version}-macOS-x64.dmg`,
  `Bito-${version}-macOS-x64.zip`,
  `Bito-${version}-Windows-x64-Setup.exe`,
].sort();
const actual = (await readdir(directory))
  .filter((name) => /\.(dmg|zip|exe)$/.test(name))
  .sort();
if (JSON.stringify(actual) !== JSON.stringify(expected))
  throw new Error(
    `Release requires exactly these five installers: ${expected.join(", ")}. Found: ${actual.join(", ")}`,
  );
const lines = [];
for (const name of expected) {
  const path = join(directory, name);
  if ((await stat(path)).size < 1_000_000)
    throw new Error(`Incomplete installer: ${name}`);
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  lines.push(`${hash.digest("hex")}  ${name}`);
}
await writeFile(join(directory, "SHA256SUMS.txt"), lines.join("\n") + "\n");
const commit =
  process.env.GITHUB_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
await writeFile(
  join(directory, "BUILD-INFO.txt"),
  [
    `Bito ${version}`,
    `Source commit: ${commit}`,
    `Source: https://github.com/feboyfierlyan/bito-desktop/tree/${commit}`,
    process.env.GITHUB_RUN_ID
      ? `Build: https://github.com/feboyfierlyan/bito-desktop/actions/runs/${process.env.GITHUB_RUN_ID}`
      : "Build: local",
    "Platforms: macOS Apple Silicon (arm64), macOS Intel (x64), Windows x64",
    "Unsigned university prototype; macOS notarization and Windows Authenticode are not configured.",
    "CI validates tests and packaging. Native Windows/Intel Mac visual and gesture testing remains manual.",
    "",
  ].join("\n"),
);
console.log(`Verified ${expected.length} release files for Bito ${version}`);
