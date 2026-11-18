import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import type { SupportedStorage } from "@supabase/supabase-js";

export type Cipher = {
  encrypt: (value: string) => Promise<Uint8Array>;
  decrypt: (value: Buffer) => Promise<string>;
};

const VERIFIED_USER_KEY = "bito:verified-user";

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
    // Prevent unhandled-rejection noise before a caller awaits getItem/setItem.
    this.loaded.catch(() => {});
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
  async getVerifiedUser(): Promise<{ id: string; email: string } | null> {
    try {
      const raw = await this.getItem(VERIFIED_USER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.id === "string" &&
        /^[0-9a-f-]{36}$/i.test(parsed.id) &&
        typeof parsed.email === "string" &&
        parsed.email.includes("@")
      ) {
        return { id: parsed.id, email: parsed.email };
      }
    } catch {
      /* Invalid or locked cache simply falls back to sign-in. */
    }
    return null;
  }
  async setVerifiedUser(user: { id: string; email: string } | null) {
    if (!user) {
      await this.removeItem(VERIFIED_USER_KEY);
      return;
    }
    await this.setItem(
      VERIFIED_USER_KEY,
      JSON.stringify({ id: user.id, email: user.email }),
    );
  }
  async clear() {
    // BITO-022: Sign-out / clear MUST succeed even if initial keychain decryption
    // rejected at boot, so a user with a changed/locked keychain is never trapped.
    await this.loaded.catch(() => {});
    this.values = {};
    this.loaded = Promise.resolve();
    const next = this.writes
      .catch(() => {})
      .then(async () => {
        await unlink(`${this.path}.tmp`).catch(() => {});
        await unlink(this.path).catch((e) => {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        });
      });
    this.writes = next;
    await next;
  }
  private save() {
    const snapshot = JSON.stringify(this.values);
    const next = this.writes
      .catch(() => {})
      .then(async () => {
        if (snapshot === "{}") {
          await unlink(this.path).catch((e) => {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
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
