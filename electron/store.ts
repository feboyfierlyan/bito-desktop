import { chmodSync, copyFileSync, existsSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { normalizeBitoStyle } from "../src/bito-voice";
import { defaultState } from "./core";
import type { AppState, Memory, Message } from "../src/shared";
import type { ToolReceipt } from "./rich-actions";
import type { FileOutput } from "./file-output";

function normalizeMemories(raw: unknown): Memory[] {
  if (!Array.isArray(raw)) return [];
  const result: Memory[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const text = item.trim().slice(0, 500);
      if (text) result.push({ id: randomUUID(), text });
    } else if (
      item &&
      typeof item === "object" &&
      typeof (item as { text?: unknown }).text === "string"
    ) {
      const text = (item as { text: string }).text.trim().slice(0, 500);
      if (!text) continue;
      const id =
        typeof (item as { id?: unknown }).id === "string" &&
        (item as { id: string }).id
          ? (item as { id: string }).id
          : randomUUID();
      result.push({ id, text });
    }
  }
  return result;
}

function normalizeMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        !!item &&
        typeof item === "object" &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.text === "string",
    )
    .map((item) => {
      const createdAt =
        typeof item.createdAt === "number" && Number.isFinite(item.createdAt)
          ? item.createdAt
          : typeof item.at === "number" && Number.isFinite(item.at)
            ? item.at
            : Date.now();
      const id =
        typeof item.id === "string" && item.id ? item.id : randomUUID();
      const { at: _legacyAt, ...rest } = item;
      return {
        ...(rest as unknown as Message),
        id,
        createdAt,
      };
    });
}

function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS tool_receipts (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT);",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS file_outputs (id TEXT PRIMARY KEY, data TEXT NOT NULL);",
  );
  try {
    chmodSync(path, 0o600);
  } catch {
    /* Windows ACLs ignore POSIX mode bits. */
  }
  return db;
}

export class Store {
  private db: DatabaseSync;
  public recoveredFromCorruption = false;
  constructor(private path: string) {
    try {
      this.db = openDatabase(path);
    } catch {
      // BITO-017: Quarantine corrupted SQLite file into a .corrupt.bak copy rather than crashing at launch.
      if (existsSync(path)) {
        const backup = `${path}.corrupt-${Date.now()}.bak`;
        try {
          renameSync(path, backup);
        } catch {
          /* Best-effort quarantine */
        }
      }
      this.recoveredFromCorruption = true;
      this.db = openDatabase(path);
    }
  }
  load(): AppState {
    const base = defaultState();
    let row: { data: string } | undefined;
    try {
      row = this.db
        .prepare("SELECT data FROM app_state WHERE id=1")
        .get() as { data: string } | undefined;
    } catch {
      this.recoveredFromCorruption = true;
      return base;
    }
    if (!row) return base;
    let saved: Record<string, any>;
    try {
      saved = JSON.parse(row.data);
      if (!saved || typeof saved !== "object" || Array.isArray(saved))
        throw Error("Malformed app_state payload");
    } catch {
      if (existsSync(this.path)) {
        try {
          copyFileSync(this.path, `${this.path}.corrupt-${Date.now()}.bak`);
        } catch {
          /* Best-effort backup */
        }
      }
      this.recoveredFromCorruption = true;
      return base;
    }
    const memories = normalizeMemories(saved.memories);
    const messages = normalizeMessages(saved.messages);
    return {
      ...base,
      ...saved,
      memories,
      messages,
      reminders: Array.isArray(saved.reminders) ? saved.reminders : [],
      tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
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
        ...(saved.profile && typeof saved.profile === "object"
          ? saved.profile
          : {}),
        style: normalizeBitoStyle(saved.profile?.style),
      },
      settings: {
        ...base.settings,
        ...(saved.settings && typeof saved.settings === "object"
          ? saved.settings
          : {}),
      },
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
