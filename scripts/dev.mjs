import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
await import("./build-main.mjs");
const server = await createServer({
  server: { port: 5183, strictPort: false },
});
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, "");
const { default: electron } = await import("electron");
const env = {
  ...process.env,
  BITO_DEV_URL: url,
  BITO_DATA_DIR: process.env.BITO_DATA_DIR || resolve(".bito-dev-data"),
  BITO_DEV_ONBOARDING: process.env.BITO_DEV_ONBOARDING || "1",
};
delete env.ELECTRON_RUN_AS_NODE;
let child,
  restarting = false,
  closing = false,
  timer;
function launch() {
  child = spawn(electron, ["."], { stdio: "inherit", env });
  child.on("exit", async (code) => {
    if (!restarting && !closing) {
      await server.close();
      process.exit(code ?? 0);
    }
  });
}
async function restart() {
  if (restarting || closing) return;
  restarting = true;
  if (child && child.exitCode === null) {
    await new Promise((done) => {
      child.once("exit", done);
      child.kill();
    });
  }
  try {
    await import(`./build-main.mjs?revision=${Date.now()}`);
    launch();
  } catch (error) {
    console.error(error);
  }
  restarting = false;
}
const watcher = watch("electron", { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(restart, 180);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    closing = true;
    watcher.close();
    clearTimeout(timer);
    child?.kill();
    await server.close();
    process.exit(0);
  });
console.log(
  `Bito revision mode: ${url} — UI updates live; desktop changes restart automatically.`,
);
launch();
