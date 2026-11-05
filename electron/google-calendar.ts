import { createServer, type Server } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import type { SupportedStorage } from "@supabase/supabase-js";
import type {
  CalendarConnection,
  CalendarEntry,
  CalendarResult,
} from "../src/calendar";
import { calendarEvent } from "../src/calendar";

const scope = "https://www.googleapis.com/auth/calendar.events.owned";
type Config = { clientId: string; clientSecret: string };
type Grant = {
  access: string;
  refresh: string;
  expires: number;
  email: string;
  clientId: string;
};
type Owner = { id: string; email: string };
const accountKey = (id: string) => `google-calendar:${id}`;
const genericError = "Calendar belum bisa dihubungkan. Coba lagi.";
class ReconnectRequired extends Error {}
export const calendarEventId = (
  account: string,
  project: string,
  milestone: string,
) =>
  createHash("sha256")
    .update(JSON.stringify([account, project, milestone]))
    .digest("hex");

/** Desktop OAuth uses PKCE + a one-use loopback callback. Grants never reach a renderer. */
export class GoogleCalendar {
  view: CalendarConnection;
  onChange = () => {};
  private server?: Server;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private owner: Owner | null = null;
  private grant: Grant | null = null;
  private exporting = false;
  private refresh?: Promise<string>;
  private abort?: AbortController;
  constructor(
    private config: Config,
    private storage: SupportedStorage,
    private fetcher: typeof fetch = fetch,
  ) {
    this.view = {
      configured: !!config.clientId && !!config.clientSecret,
      status: "disconnected",
    };
  }
  async loadConfig() {
    const raw = await this.storage.getItem("calendar-client");
    if (raw) this.configure(JSON.parse(raw));
  }
  configure(value: unknown) {
    const input = value as {
      installed?: { client_id?: string; client_secret?: string };
    };
    const c = input?.installed;
    if (
      !c ||
      typeof c.client_id !== "string" ||
      !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(c.client_id) ||
      typeof c.client_secret !== "string" ||
      !c.client_secret ||
      c.client_secret.length > 512
    )
      throw Error(
        "Pilih berkas OAuth Google berjenis Desktop app, bukan Web application.",
      );
    this.cancel();
    this.config = { clientId: c.client_id, clientSecret: c.client_secret };
    this.grant = null;
    this.emit({
      configured: true,
      status: "disconnected",
      email: undefined,
      error: undefined,
    });
  }
  async importConfig(value: unknown) {
    if (this.exporting) throw Error("Tunggu pengiriman jadwal selesai dahulu.");
    this.configure(value);
    // Old refresh tokens belong to the old client and must not be reused.
    if (this.owner) await this.storage.removeItem(accountKey(this.owner.id));
    await this.storage.setItem(
      "calendar-client",
      JSON.stringify({
        installed: {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        },
      }),
    );
  }
  private emit(next: Partial<CalendarConnection>) {
    this.view = { ...this.view, ...next };
    this.onChange();
  }
  private closeListener() {
    clearTimeout(this.timer);
    this.server?.close();
    this.server = undefined;
  }
  cancel() {
    this.generation++;
    this.abort?.abort();
    this.closeListener();
    if (this.view.status === "connecting")
      this.emit({
        status: this.grant ? "connected" : "disconnected",
        error: undefined,
      });
  }
  async setOwner(owner: Owner | null) {
    this.cancel();
    const generation = this.generation;
    this.owner = owner;
    this.grant = null;
    this.refresh = undefined;
    this.emit({ status: "disconnected", email: undefined, error: undefined });
    if (!owner) return;
    try {
      const raw = await this.storage.getItem(accountKey(owner.id));
      if (generation !== this.generation) return;
      const grant = raw ? (JSON.parse(raw) as Grant) : null;
      if (
        grant &&
        grant.clientId === this.config.clientId &&
        typeof grant.refresh === "string" &&
        typeof grant.access === "string" &&
        Number.isFinite(grant.expires) &&
        grant.email === owner.email.toLowerCase()
      ) {
        this.grant = grant;
        this.emit({
          status:
            grant.refresh || grant.expires > Date.now()
              ? "connected"
              : "expired",
          email: grant.email,
        });
      }
    } catch {
      if (generation === this.generation)
        this.emit({ error: "Koneksi Calendar tersimpan belum bisa dibuka." });
    }
  }
  private async tokenRequest(
    fields: Record<string, string>,
    signal?: AbortSignal,
  ) {
    const response = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...fields,
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401)
        throw new ReconnectRequired(
          "Hubungkan ulang Calendar dari pengaturan.",
        );
      throw Error(genericError);
    }
    const value = await response.json();
    if (
      typeof value.access_token !== "string" ||
      !Number.isFinite(value.expires_in)
    )
      throw Error(genericError);
    return value;
  }
  async connect(open: (url: string) => Promise<unknown>) {
    if (!this.view.configured)
      throw Error("Sambungan Google Calendar untuk aplikasi belum disiapkan.");
    if (!this.owner) throw Error("Masuk ke Bito terlebih dahulu.");
    if (this.exporting || this.view.status === "connecting")
      throw Error("Tunggu proses Calendar selesai dahulu.");
    this.cancel();
    const generation = this.generation,
      owner = this.owner;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    this.emit({ status: "connecting", error: undefined });
    let consumed = false;
    const server = createServer(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      );
      let url: URL;
      try {
        url = new URL(req.url || "/", "http://127.0.0.1");
      } catch {
        res.writeHead(400);
        res.end("Permintaan tidak valid.");
        return;
      }
      if (
        req.method !== "GET" ||
        req.headers.host !== `127.0.0.1:${port}` ||
        url.pathname !== "/calendar/callback" ||
        url.searchParams.get("state") !== state ||
        consumed ||
        generation !== this.generation
      ) {
        res.writeHead(400);
        res.end("Permintaan tidak valid.");
        return;
      }
      consumed = true;
      this.closeListener();
      let message =
        "Calendar belum terhubung. Kamu bisa kembali ke Bito dan mencoba lagi.";
      try {
        const code = url.searchParams.get("code");
        if (url.searchParams.has("error") || !code || code.length > 4096)
          throw Error("Izin Calendar belum diberikan.");
        const tokens = await this.tokenRequest(
          {
            code,
            code_verifier: verifier,
            redirect_uri: redirect,
            grant_type: "authorization_code",
          },
          signal,
        );
        if (!(tokens.scope || "").split(" ").includes(scope))
          throw Error("Izin Calendar belum diberikan.");
        const response = await this.fetcher(
          "https://openidconnect.googleapis.com/v1/userinfo",
          {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
            signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
          },
        );
        if (!response.ok) throw Error(genericError);
        const user = await response.json();
        if (
          user.email_verified !== true ||
          typeof user.email !== "string" ||
          user.email.toLowerCase() !== owner.email.toLowerCase()
        )
          throw Error("Pilih akun Google yang sama dengan akun Bito.");
        if (generation !== this.generation)
          throw Error("Sesi Calendar dibatalkan.");
        const grant: Grant = {
          clientId: this.config.clientId,
          access: tokens.access_token,
          refresh: tokens.refresh_token || this.grant?.refresh || "",
          expires: Date.now() + tokens.expires_in * 1000,
          email: user.email.toLowerCase(),
        };
        await this.storage.setItem(accountKey(owner.id), JSON.stringify(grant));
        if (generation !== this.generation)
          throw Error("Sesi Calendar dibatalkan.");
        this.grant = grant;
        this.emit({
          status: "connected",
          email: grant.email,
          error: undefined,
        });
        message =
          "Calendar sudah terhubung. Kembali ke Bito untuk mengaktifkan sinkronisasi otomatis.";
      } catch (error) {
        if (generation === this.generation)
          this.emit({
            status: this.grant ? "connected" : "disconnected",
            error: error instanceof Error ? error.message : genericError,
          });
      } finally {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<!doctype html><html lang="id"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bito · Calendar</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f8f3;color:#202124;font:17px system-ui}main{background:white;padding:48px;border-radius:28px;max-width:360px;margin:24px}h1{font-size:28px}p{line-height:1.6}</style><main><h1>🌱 Bito</h1><p>${message}</p></main></html>`,
        );
      }
    });
    this.server = server;
    let port = 0,
      redirect = "";
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve());
      });
      if (generation !== this.generation) {
        server.close();
        return;
      }
      port = (server.address() as { port: number }).port;
      redirect = `http://127.0.0.1:${port}/calendar/callback`;
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        redirect_uri: redirect,
        response_type: "code",
        scope: `openid email ${scope}`,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
        login_hint: owner.email,
      });
      this.timer = setTimeout(() => {
        this.cancel();
        this.emit({ error: "Waktu menghubungkan habis. Coba lagi." });
      }, 300000);
      await open(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    } catch {
      if (generation !== this.generation) {
        server.close();
        return;
      }
      this.cancel();
      this.emit({ error: genericError });
      throw Error(genericError);
    }
  }
  private async accessToken(generation: number) {
    if (!this.grant || !this.owner)
      throw Error("Hubungkan Calendar terlebih dahulu.");
    if (this.grant.expires > Date.now() + 60000) return this.grant.access;
    if (this.refresh) return this.refresh;
    const grant = this.grant,
      owner = this.owner;
    const refreshing = (async () => {
      try {
        if (!grant.refresh)
          throw new ReconnectRequired(
            "Hubungkan ulang Calendar dari pengaturan.",
          );
        const tokens = await this.tokenRequest(
          { grant_type: "refresh_token", refresh_token: grant.refresh },
          this.abort?.signal,
        );
        if (generation !== this.generation)
          throw Error("Sesi Calendar sudah berubah.");
        const next = {
          ...grant,
          access: tokens.access_token,
          expires: Date.now() + tokens.expires_in * 1000,
        };
        await this.storage.setItem(accountKey(owner.id), JSON.stringify(next));
        if (generation !== this.generation)
          throw Error("Sesi Calendar sudah berubah.");
        this.grant = next;
        return next.access;
      } catch (error) {
        if (
          generation === this.generation &&
          error instanceof ReconnectRequired
        )
          this.emit({
            status: "expired",
            error: "Hubungkan ulang Calendar dari pengaturan.",
          });
        throw error;
      }
    })();
    this.refresh = refreshing;
    try {
      return await refreshing;
    } finally {
      if (this.refresh === refreshing) this.refresh = undefined;
    }
  }
  async send(
    projectId: string,
    entries: CalendarEntry[],
    isCurrent = () => true,
  ): Promise<CalendarResult[]> {
    if (this.exporting) throw Error("Jadwal sedang dikirim. Tunggu sebentar.");
    if (!this.owner || !this.grant || this.view.status !== "connected")
      throw Error("Hubungkan Calendar terlebih dahulu.");
    const generation = this.generation,
      owner = this.owner;
    this.abort = new AbortController();
    this.exporting = true;
    const results: CalendarResult[] = [];
    try {
      const token = await this.accessToken(generation);
      for (const entry of entries) {
        const id = calendarEventId(owner.id, projectId, entry.id);
        const endpoint =
          "https://www.googleapis.com/calendar/v3/calendars/primary/events";
        const init = {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          signal: this.abort?.signal
            ? AbortSignal.any([this.abort.signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        };
        try {
          if (generation !== this.generation || !isCurrent())
            throw Error("Rencana atau akun sudah berubah. Tinjau jadwal lagi.");
          if (this.view.status !== "connected")
            throw Error("Hubungkan ulang Calendar.");
          let response = await this.fetcher(`${endpoint}?sendUpdates=none`, {
            ...init,
            method: "POST",
            body: JSON.stringify({ id, ...calendarEvent(entry) }),
          });
          // A deterministic ID makes a retry safe even when the first response was lost.
          if (response.status === 409) {
            if (generation !== this.generation || !isCurrent())
              throw Error(
                "Rencana atau akun sudah berubah. Tinjau jadwal lagi.",
              );
            response = await this.fetcher(
              `${endpoint}/${id}?sendUpdates=none`,
              {
                ...init,
                method: "PATCH",
                body: JSON.stringify(calendarEvent(entry)),
              },
            );
            // A deleted Google event keeps its ID reserved. Let the durable
            // sync ledger allocate a fresh ID rather than retry forever.
            if (response.status === 404 || response.status === 410) {
              results.push({ id: entry.id, ok: false, recreate: true });
              continue;
            }
          }
          if (!response.ok) {
            if (response.status === 401) {
              if (generation === this.generation)
                this.emit({ status: "expired" });
              throw Error("Hubungkan ulang Calendar.");
            }
            throw Error(
              response.status === 403
                ? "Akses Calendar belum tersedia. Periksa izin dan aktivasi Calendar API."
                : "Jadwal belum terkirim. Coba lagi.",
            );
          }
          const event = await response.json();
          results.push({
            id: entry.id,
            ok: true,
            url:
              typeof event.htmlLink === "string" &&
              event.htmlLink.startsWith("https://calendar.google.com/")
                ? event.htmlLink
                : undefined,
          });
        } catch (error) {
          results.push({
            id: entry.id,
            ok: false,
            error:
              error instanceof Error &&
              !/fetch|abort|timeout/i.test(error.message)
                ? error.message
                : "Koneksi terputus. Coba kirim lagi.",
          });
        }
      }
      return results;
    } finally {
      this.exporting = false;
    }
  }
  async remove(projectId: string, entryId: string, isCurrent = () => true) {
    if (this.exporting) throw Error("Calendar sedang disinkronkan.");
    if (!this.owner || !this.grant || this.view.status !== "connected")
      throw Error("Hubungkan ulang Calendar.");
    const generation = this.generation,
      owner = this.owner;
    this.exporting = true;
    this.abort = new AbortController();
    try {
      const token = await this.accessToken(generation);
      if (generation !== this.generation || !isCurrent())
        throw Error("Akun atau rencana sudah berubah.");
      const response = await this.fetcher(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId(owner.id, projectId, entryId)}?sendUpdates=none`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.any([
            this.abort.signal,
            AbortSignal.timeout(15000),
          ]),
        },
      );
      if (response.status === 401 && generation === this.generation)
        this.emit({ status: "expired" });
      if (!response.ok && ![404, 410].includes(response.status))
        throw Error(
          response.status === 401
            ? "Hubungkan ulang Calendar."
            : "Perubahan jadwal belum tersinkron. Akan dicoba lagi.",
        );
    } finally {
      this.exporting = false;
    }
  }
  async disconnect() {
    if (this.exporting) throw Error("Tunggu pengiriman jadwal selesai dahulu.");
    const owner = this.owner;
    this.cancel();
    if (owner) await this.storage.removeItem(accountKey(owner.id));
    this.grant = null;
    this.emit({ status: "disconnected", email: undefined, error: undefined });
  }
}
