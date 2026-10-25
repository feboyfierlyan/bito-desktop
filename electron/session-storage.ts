import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import type { SupportedStorage } from "@supabase/supabase-js";

export type Cipher = {
  encrypt: (value: string) => Promise<Uint8Array>;
  decrypt: (value: Buffer) => Promise<string>;
};
// Supabase's session AND PKCE verifier stay in the main process, encrypted by
// the operating system. Writes are serialized and atomic; no plaintext fallback.
export class EncryptedSessionStorage implements SupportedStorage {
  private values: Record<string, string> = {};
  private writes: Promise<void> = Promise.resolve();
  private loaded: Promise<void>;
  constructor(
    private path: string,
    private cipher: Cipher,
  ) {
    this.loaded = (async () => {
      try {
        this.values = JSON.parse(await cipher.decrypt(await readFile(path)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT")
          throw Error(
            "Sesi tersimpan belum bisa dibuka. Buka keychain lalu coba lagi.",
          );
      }
    })();
  }
  async getItem(key: string) {
    await this.loaded;
    return this.values[key] ?? null;
  }
  async setItem(key: string, value: string) {
    await this.loaded;
    this.values[key] = value;
    await this.save();
  }
  async removeItem(key: string) {
    await this.loaded;
    delete this.values[key];
    await this.save();
  }
  async clear() {
    await this.loaded;
    this.values = {};
    await this.save();
  }
  private save() {
    const snapshot = JSON.stringify(this.values);
    const next = this.writes
      .catch(() => {})
      .then(async () => {
        if (snapshot === "{}") {
          await unlink(this.path).catch((e) => {
            if (e.code !== "ENOENT") throw e;
          });
          return;
        }
        const encrypted = await this.cipher.encrypt(snapshot);
        await writeFile(`${this.path}.tmp`, encrypted, { mode: 0o600 });
        await rename(`${this.path}.tmp`, this.path);
      });
    this.writes = next;
    return next;
  }
}
