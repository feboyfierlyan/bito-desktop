import { build } from "esbuild";
import { loadEnv } from "vite";
await import(`./native.mjs?build=${Date.now()}`);
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
  define: {
    __BITO_PUBLIC_CONFIG__: JSON.stringify(publicConfig),
    __BITO_CALENDAR_CONFIG__: JSON.stringify({ clientId: env.BITO_GOOGLE_CALENDAR_CLIENT_ID || "", clientSecret: env.BITO_GOOGLE_CALENDAR_CLIENT_SECRET || "" }),
  },
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
await build({
  entryPoints: ["electron/spotlight-preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/spotlight-preload.cjs",
  external: ["electron"],
  target: "node24",
});

await build({entryPoints:["electron/area-preload.ts"],bundle:true,platform:"node",format:"cjs",outfile:"dist-electron/area-preload.cjs",external:["electron"],target:"node24"});
