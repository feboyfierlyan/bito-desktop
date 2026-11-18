import { build } from "esbuild";
import { loadEnv } from "vite";
await import(`./native.mjs?build=${Date.now()}`);
const isDev = process.env.NODE_ENV === "development" || process.env.BITO_DEV_ENV === "1";
const env = {
  ...(isDev ? loadEnv("development", process.cwd(), "BITO_") : {}),
  ...process.env,
};
const publicConfig = {
  url: env.BITO_SUPABASE_URL || "",
  publishableKey: env.BITO_SUPABASE_PUBLISHABLE_KEY || "",
};
// Security invariant (BITO-003): NEVER bake OAuth client secrets into desktop binaries.
const calendarConfig = {
  clientId: env.BITO_GOOGLE_CALENDAR_CLIENT_ID || "",
  clientSecret: "",
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
    __BITO_CALENDAR_CONFIG__: JSON.stringify(calendarConfig),
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
await build({
  entryPoints: ["electron/area-preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/area-preload.cjs",
  external: ["electron"],
  target: "node24",
});
