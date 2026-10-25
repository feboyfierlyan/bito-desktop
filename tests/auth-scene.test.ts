import { test } from "node:test";
import assert from "node:assert/strict";
import { loginStage, pendingLogin } from "../src/auth-scene";

test("login distinguishes browser handoff, verification, access denial and transport failure", () => {
  assert.equal(
    loginStage({ configured: false, status: "unconfigured" }, null),
    "idle",
  );
  assert.equal(
    loginStage({ configured: true, status: "signing-in" }, "google"),
    "opening",
  );
  assert.equal(
    loginStage({ configured: true, status: "signing-in" }, null),
    "waiting",
  );
  assert.equal(
    loginStage({ configured: true, status: "checking" }, null),
    "checking",
  );
  assert.equal(
    loginStage({ configured: true, status: "ready" }, "google"),
    "success",
  );
  assert.equal(
    loginStage(
      { configured: true, status: "denied", error: "Not invited" },
      null,
    ),
    "denied",
  );
  assert.equal(
    loginStage({ configured: true, status: "offline" }, null),
    "offline",
  );
  assert.equal(
    loginStage({ configured: true, status: "offline" }, "retry"),
    "checking",
  );
  assert.equal(
    loginStage(
      { configured: true, status: "signed-out", error: "Cancelled" },
      null,
    ),
    "error",
  );
});
test("pending stages prevent a second sign-in while recovery states remain actionable", () => {
  for (const stage of ["opening", "waiting", "checking", "success"] as const)
    assert.equal(pendingLogin(stage), true);
  for (const stage of ["idle", "denied", "offline", "error"] as const)
    assert.equal(pendingLogin(stage), false);
  const auth = { configured: false, status: "unconfigured" as const };
  assert.equal(loginStage(auth, null, "success"), "success");
  assert.equal(auth.status, "unconfigured"); // UI preview never grants a session.
});
