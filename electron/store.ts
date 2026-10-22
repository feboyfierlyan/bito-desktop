import { DatabaseSync } from "node:sqlite";
import { defaultState } from "./core";
import type { AppState } from "../src/shared";
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)",
    );
  }
  load(): AppState {
    const row = this.db
      .prepare("SELECT data FROM app_state WHERE id=1")
      .get() as { data: string } | undefined;
    const base = defaultState();
    if (!row) return base;
    const saved = JSON.parse(row.data);
    return {
      ...base,
      ...saved,
      profile: { ...base.profile, ...saved.profile },
      settings: { ...base.settings, ...saved.settings },
    };
  }
  save(state: AppState) {
    this.db
      .prepare(
        "INSERT INTO app_state(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(JSON.stringify(state));
  }
  close() {
    this.db.close();
  }
}
