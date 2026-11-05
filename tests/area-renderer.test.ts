import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
test("selection renderer works under isolated CSP in revision mode without inline refresh setup", async () => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    logLevel: "silent",
  });
  try {
    const result = await server.transformRequest("/src/AreaSelect.tsx");
    assert.ok(result?.code);
    assert.ok(!result.code.includes("$RefreshReg$"));
    assert.ok(!result.code.includes("preamble was not loaded"));
    const html = await readFile("area.html", "utf8");
    assert.match(html, /connect-src 'none'/);
    assert.ok(!html.includes("unsafe-eval"));
    assert.match(html, /src="\/src\/AreaSelect.tsx"/);
  } finally {
    await server.close();
  }
});
