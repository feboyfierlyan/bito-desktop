import { copyFile, mkdir } from "node:fs/promises";
await import("./prepare-eye-rig.mjs");
await mkdir("public", { recursive: true });
await copyFile("node_modules/@rive-app/canvas/rive.wasm", "public/rive.wasm");
