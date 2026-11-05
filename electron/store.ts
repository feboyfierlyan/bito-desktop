import { normalizeBitoStyle } from "../src/bito-voice";
import { DatabaseSync } from "node:sqlite";
import { defaultState } from "./core";
import type { AppState } from "../src/shared";
import type { ToolReceipt } from "./rich-actions";
import type { FileOutput } from "./file-output";
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)",
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS tool_receipts (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT)",
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS file_outputs (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
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
      projects: Array.isArray(saved.projects) ? saved.projects : [],
      activeProjectId:
        Array.isArray(saved.projects) &&
        saved.projects.some(
          (p: { id: string; status: string }) =>
            p.id === saved.activeProjectId && p.status !== "archived",
        )
          ? saved.activeProjectId
          : null,
      profile: {
        ...base.profile,
        ...saved.profile,
        style: normalizeBitoStyle(saved.profile?.style),
      },
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
  get isOpen() {
    return this.db.isOpen;
  }
  close() {
    if (this.db.isOpen) this.db.close();
  }
  beginTool(id: string, fingerprint: string): ToolReceipt | null {
    const old = this.db
      .prepare("SELECT fingerprint, result FROM tool_receipts WHERE id=?")
      .get(id) as { fingerprint: string; result: string | null } | undefined;
    if (old) {
      if (old.fingerprint !== fingerprint)
        throw Error("ID tindakan tidak cocok.");
      return old.result
        ? JSON.parse(old.result)
        : {
            id,
            ok: false,
            result:
              "Tindakan pernah dimulai tetapi hasil akhirnya belum terkonfirmasi. Jangan ulangi otomatis; minta pengguna memeriksa hasilnya.",
          };
    }
    this.db
      .prepare("INSERT INTO tool_receipts(id,fingerprint) VALUES(?,?)")
      .run(id, fingerprint);
    return null;
  }
  finishTool(result: ToolReceipt, state?: AppState) {
    if (state) this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("UPDATE tool_receipts SET result=? WHERE id=?")
        .run(JSON.stringify(result), result.id);
      if (state) {
        this.save(state);
        this.db.exec("COMMIT");
      }
    } catch (error) {
      if (state) this.db.exec("ROLLBACK");
      throw error;
    }
  }
  saveFile(output: FileOutput) {
    this.db
      .prepare("INSERT INTO file_outputs(id,data) VALUES(?,?)")
      .run(output.id, JSON.stringify(output));
  }
  getFile(id: string): FileOutput | undefined {
    const row = this.db
      .prepare("SELECT data FROM file_outputs WHERE id=?")
      .get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
}
