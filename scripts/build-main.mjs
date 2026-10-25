import { build } from "esbuild";
import { loadEnv } from "vite";
const env = {
  ...loadEnv("development", process.cwd(), "BITO_"),
  ...process.env,
};
const publicConfig = {
  url: env.BITO_SUPABASE_URL || "",
  publishableKey: env.BITO_SUPABASE_PUBLISHABLE_KEY || "",
};
await build({
  entryPoints: ["electron/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/main.cjs",
  external: ["electron"],
  target: "node24",
  define: { __BITO_PUBLIC_CONFIG__: JSON.stringify(publicConfig) },
});
await build({
  entryPoints: ["electron/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/preload.cjs",
  external: ["electron"],
  target: "node24",
});
