import { test } from "node:test";
import assert from "node:assert/strict";
import { preferenceWriter } from "../src/preference-writer";
import { defaultState, profileSchema, settingsSchema } from "../electron/core";

test("rapid preference changes are serialized and preserve unrelated profile and AI settings", async () => {
  const state = defaultState();
  state.profile.name = "Okta";
  state.profile.goal = "Selesaikan proyek";
  const calls: string[] = [];
  let active = 0,
    max = 0;
  const writer = preferenceWriter(async (name, patch) => {
    active++;
    max = Math.max(max, active);
    calls.push(name);
    await new Promise((resolve) => setTimeout(resolve, 4));
    if (name === "profile-patch")
      state.profile = profileSchema.parse({ ...state.profile, ...patch });
    else state.settings = settingsSchema.parse({ ...state.settings, ...patch });
    active--;
    return { ok: true };
  });
  const jobs = [
    writer.write("profile", { name: "Boy" }),
    writer.write("profile", { style: "chill" }),
    writer.write("settings", { size: 240 }),
    writer.write("settings", { dnd: true }),
  ];
  await writer.flush();
  await Promise.all(jobs);
  assert.equal(max, 1);
  assert.deepEqual(calls, [
    "profile-patch",
    "profile-patch",
    "settings-patch",
    "settings-patch",
  ]);
  assert.equal(state.profile.name, "Boy");
  assert.equal(state.profile.style, "chill");
  assert.equal(state.profile.goal, "Selesaikan proyek");
  assert.equal(state.settings.size, 240);
  assert.equal(state.settings.dnd, true);
  assert.equal(state.settings.model, defaultState().settings.model);
  assert.equal(state.settings.baseURL, defaultState().settings.baseURL);
});
test("a failed save does not stall later saves or close-time flush", async () => {
  let count = 0;
  const writer = preferenceWriter(async () => {
    if (++count === 1) throw Error("offline");
    return { ok: true };
  });
  const first = writer.write("profile", { name: "Okta" });
  const second = writer.write("settings", { dnd: true });
  await writer.flush();
  assert.equal((await first).ok, false);
  assert.equal((await second).ok, true);
  assert.equal(count, 2);
});
