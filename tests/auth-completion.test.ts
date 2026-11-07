import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AuthCompletionHost,
  readCompletionAssets,
  renderCompletionPage,
} from "../electron/auth-completion";

test("auth completion bundles the application font without a remote font dependency", async () => {
  const assets = await readCompletionAssets("public");
  assert.deepEqual(
    Buffer.from(assets.font!, "base64"),
    await readFile("public/fonts/bito-sans-variable.woff2"),
  );
  for (const status of ["success", "error"] as const) {
    const html = renderCompletionPage(status, assets);
    assert.match(html, /@font-face\{font-family:"Bito Sans"/);
    assert.match(html, /data:font\/woff2;base64,/);
    assert.doesNotMatch(html, /https?:\/\//);
    assert.match(html, /font-weight:500/);
  }
});

test("completion font data cannot escape the inline stylesheet", () => {
  assert.throws(
    () =>
      renderCompletionPage("success", {
        font: "</style><script>alert(1)</script>",
      }),
    /Invalid completion font/,
  );
});

test("completion CSP permits only embedded fonts and keeps return navigation origin-bound", async () => {
  const host = new AuthCompletionHost(await readCompletionAssets("public"));
  let returned = 0;
  try {
    const url = await host.open("success", () => {
      returned++;
    });
    const page = await fetch(url);
    assert.equal(page.status, 200);
    const csp = page.headers.get("content-security-policy")!;
    assert.match(csp, /font-src data:/);
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'nonce-/);
    assert.match(csp, /frame-ancestors 'none'/);
    const refused = await fetch(url + "/return", {
      method: "POST",
      headers: { Origin: "https://example.com" },
    });
    assert.equal(refused.status, 403);
    assert.equal(returned, 0);
    const accepted = await fetch(url + "/return", {
      method: "POST",
      headers: { Origin: new URL(url).origin },
    });
    assert.equal(accepted.status, 204);
    assert.equal(returned, 1);
  } finally {
    host.close();
  }
});
