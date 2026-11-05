import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { defaultState } from "../electron/core";
import { saveAppState } from "../electron/state-persistence";

test("SQLITE_FULL retains the previous saved state and lets the pending state be retried without throwing", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE state (id INTEGER PRIMARY KEY, data TEXT); PRAGMA max_page_count=2");
    const store = { save(state: ReturnType<typeof defaultState>) {
      db.prepare("INSERT INTO state(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(JSON.stringify(state));
    }};
    const state = defaultState();
    assert.equal(saveAppState(store, state), undefined);
    state.profile.name = "x".repeat(20000);
    const error = saveAppState(store, state);
    assert.match(error!, /Penyimpanan penuh/);
    const saved = JSON.parse((db.prepare("SELECT data FROM state WHERE id=1").get() as {data:string}).data);
    assert.notEqual(saved.profile.name, state.profile.name, "failed save must not corrupt previous data");
    db.exec("PRAGMA max_page_count=100");
    assert.equal(saveAppState(store, state), undefined);
    const recovered = JSON.parse((db.prepare("SELECT data FROM state WHERE id=1").get() as {data:string}).data);
    assert.equal(recovered.profile.name, state.profile.name, "retry saves the latest in-memory changes");
  } finally { db.close(); }
});
