import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
} from "@supabase/supabase-js";
import { createServer, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  sseData,
  type ChatEvent,
  type ToolCall,
  type ToolResult,
} from "../supabase/functions/_shared/protocol";
import type { AuthView, Profile } from "../src/shared";
import {
  AuthCompletionHost,
  renderCompletionPage,
  type CompletionAssets,
  type CompletionStatus,
} from "./auth-completion";

export type CloudConfig = { url: string; publishableKey: string };
export function validateCloudConfig(raw: CloudConfig): CloudConfig | null {
  if (!raw.url && !raw.publishableKey) return null;
  let url: URL;
  try {
    url = new URL(raw.url);
  } catch {
    throw Error("Alamat proyek Supabase belum valid.");
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw Error("Gunakan URL proyek Supabase resmi (https://…supabase.co).");
  if (!raw.publishableKey || raw.publishableKey.startsWith("sb_secret_"))
    throw Error(
      "Konfigurasi aplikasi harus memakai publishable key, bukan secret key.",
    );
  if (!raw.publishableKey.startsWith("sb_publishable_")) {
    try {
      const claims = JSON.parse(
        Buffer.from(raw.publishableKey.split(".")[1], "base64url").toString(),
      );
      if (claims.role !== "anon") throw Error();
    } catch {
      throw Error(
        "Gunakan publishable key atau anon key publik dari Supabase.",
      );
    }
  }
  return { url: url.origin, publishableKey: raw.publishableKey };
}
export class CloudError extends Error {
  constructor(public code: string) {
    super(cloudErrorText(code));
  }
}
export function cloudErrorText(code: string): string {
  const messages: Record<string, string> = {
    access_denied:
      "Akun ini belum mendapat akses demo Bito. Hubungi pemilik demo.",
    sign_in_required: "Sesi masuk berakhir. Silakan masuk lagi.",
    daily_limit: "Jatah demo hari ini sudah habis. Coba lagi besok.",
    rate_limit: "Bito sedang menerima beberapa permintaan. Coba sebentar lagi.",
    provider_limit:
      "Kuota layanan AI sedang tercapai. Coba lagi sebentar lagi.",
    busy: "Ada permintaan yang masih berjalan. Coba sebentar lagi.",
    demo_paused: "Demo sedang dijeda oleh pemiliknya.",
    server_config: "Layanan Bito belum selesai disiapkan oleh pemilik demo.",
    invalid_job:
      "Tindakan ini sudah selesai atau kedaluwarsa. Kirim permintaan baru.",
    request_exists: "Permintaan ini sudah diterima. Tindakan tidak diulang.",
    context_too_large:
      "Pesan atau dokumen terlalu panjang. Coba bagian yang lebih pendek.",
    response_limit:
      "Jawaban mencapai batas demo. Minta Bito melanjutkan bagian yang diperlukan.",
    blocked:
      "Bito belum bisa menjawab permintaan ini. Coba susun ulang pesannya.",
    interrupted: "Jawaban dihentikan.",
    oauth_timeout: "Waktu masuk habis. Silakan coba lagi.",
    oauth_port:
      "Jendela masuk masih dipakai aplikasi lain. Tutup lalu coba lagi.",
    oauth_failed: "Belum berhasil masuk dengan Google. Coba lagi.",
  };
  return (
    messages[code] ||
    "Bito belum bisa terhubung. Periksa internet, lalu coba lagi."
  );
}

export class BitoCloud {
  readonly client: SupabaseClient;
  view: AuthView = { configured: true, status: "signed-out" };
  private server?: Server;
  private loginTimer?: ReturnType<typeof setTimeout>;
  private loginGeneration = 0;
  private completingLogin = false;
  private signedOut = false;
  private refreshing?: Promise<{ id: string; email: string }>;
  private completionHost: AuthCompletionHost;
  onChange: () => void = () => {};
  onReturn: () => void = () => {};
  onLogin: (user: { id: string; email: string }) => Promise<void> =
    async () => {};
  constructor(
    readonly config: CloudConfig,
    private storage: SupportedStorage & { clear?: () => Promise<void> | void },
    private fetcher: typeof fetch = fetch,
    private completionAssets: CompletionAssets = {},
  ) {
    this.completionHost = new AuthCompletionHost(completionAssets);
    this.client = createClient(config.url, config.publishableKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage,
      },
      global: {
        fetch: (input, init) =>
          this.fetcher(input, {
            ...init,
            signal: init?.signal || AbortSignal.timeout(20000),
          }),
      },
    });
  }
  private async finishLoginPage(
    response: ServerResponse,
    status: CompletionStatus,
  ) {
    // Presentation failure must never invalidate an already verified session.
    const url = await this.completionHost
      .open(status, () => this.onReturn())
      .catch(() => null);
    response.writeHead(url ? 303 : status === "success" ? 200 : 400, {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...(url
        ? { Location: url }
        : {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy":
              "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
          }),
    });
    response.end(
      url ? undefined : renderCompletionPage(status, this.completionAssets),
    );
  }
  private set(view: Partial<AuthView>) {
    this.view = { ...this.view, error: undefined, ...view };
    this.onChange();
  }
  async initialize() {
    const { data, error } = await this.client.auth.getSession();
    if (error || !data.session) return;
    try {
      return await this.check();
    } catch {
      return;
    }
  }
  private async token() {
    if (this.signedOut) throw new CloudError("sign_in_required");
    const { data, error } = await this.client.auth.getSession();
    if (error || !data.session) {
      this.set({ status: "signed-out" });
      throw new CloudError("sign_in_required");
    }
    return data.session.access_token;
  }
  async request(body: unknown, signal?: AbortSignal): Promise<Response> {
    const token = await this.token();
    const response = await this.fetcher(
      `${this.config.url}/functions/v1/bito-api`,
      {
        method: "POST",
        headers: {
          apikey: this.config.publishableKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(100000)])
          : AbortSignal.timeout(20000),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const code =
        response.status === 401
          ? "sign_in_required"
          : body.code || "server_error";
      if (response.status === 401 || response.status === 403)
        this.set({
          status: response.status === 403 ? "denied" : "signed-out",
          error: cloudErrorText(code),
        });
      throw new CloudError(code);
    }
    return response;
  }
  async check(): Promise<{ id: string; email: string }> {
    if (this.refreshing) return this.refreshing;
    const generation = this.loginGeneration;
    this.refreshing = (async () => {
      try {
        const response = await this.request({ action: "session" });
        const { user } = await response.json();
        if (!user?.id || !user.email) throw new CloudError("server_error");
        if (this.signedOut || generation !== this.loginGeneration)
          throw new CloudError("sign_in_required");
        this.set({ status: "ready", userId: user.id, email: user.email });
        return user;
      } catch (e) {
        if (!(
          e instanceof CloudError &&
          ["access_denied", "sign_in_required"].includes(e.code)
        ))
          this.set({
            status: "offline",
            error:
              e instanceof CloudError ? e.message : cloudErrorText("offline"),
          });
        throw e;
      } finally {
        this.refreshing = undefined;
      }
    })();
    return this.refreshing;
  }
  async signIn(openBrowser: (url: string) => Promise<void>) {
    if (this.completingLogin) throw new CloudError("busy");
    this.cancelLogin();
    const generation = this.loginGeneration;
    const nonce = randomUUID(),
      path = `/auth/callback/${nonce}`;
    let flowId: string | undefined;
    this.set({ status: "signing-in" });
    const server = createServer((request, response) => {
      const callback = new URL(request.url || "/", "http://127.0.0.1:43821");
      if (
        request.method !== "GET" ||
        request.headers.host !== "127.0.0.1:43821" ||
        callback.pathname !== path ||
        generation !== this.loginGeneration
      ) {
        response.writeHead(404);
        response.end();
        return;
      }
      const code = callback.searchParams.get("code");
      if (!code || code.length > 2000) {
        response.writeHead(400);
        response.end("Login belum berhasil. Kembali ke Bito dan coba lagi.");
        return;
      }
      // Consume the callback once; PKCE proves that this app initiated login.
      this.cancelLogin();
      const completionGeneration = this.loginGeneration;
      this.completingLogin = true;
      this.set({ status: "checking" });
      void (async () => {
        try {
          const { error } = await this.client.auth.exchangeCodeForSession(
            code,
            flowId ? { flowId } : undefined,
          );
          if (error) throw new CloudError("oauth_failed");
          if (completionGeneration !== this.loginGeneration) {
            await this.signOut();
            throw new CloudError("oauth_failed");
          }
          this.signedOut = false;
          const user = await this.check();
          if (completionGeneration !== this.loginGeneration || this.signedOut)
            throw new CloudError("oauth_failed");
          await this.onLogin(user);
          await this.finishLoginPage(response, "success");
        } catch (e) {
          if (completionGeneration !== this.loginGeneration)
            await this.signOut().catch(() => {});
          if (this.view.status !== "denied")
            this.set({
              status: "signed-out",
              error:
                e instanceof CloudError
                  ? e.message
                  : cloudErrorText("oauth_failed"),
            });
          await this.finishLoginPage(response, "error");
        } finally {
          this.completingLogin = false;
        }
      })();
    });
    this.server = server;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(43821, "127.0.0.1", resolve);
      });
      this.loginTimer = setTimeout(() => {
        this.cancelLogin();
        this.set({
          status: "signed-out",
          error: cloudErrorText("oauth_timeout"),
        });
        // First-time Google consent can take longer than a routine sign-in.
        // Keep the one-time, nonce-bound PKCE callback available while the user
        // reviews permissions; cancelLogin still closes it immediately.
      }, 10 * 60000);
      const { data, error } = await this.client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `http://127.0.0.1:43821${path}`,
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error || !data.url) throw new CloudError("oauth_failed");
      flowId = data.flowId || undefined;
      await openBrowser(data.url);
    } catch (e) {
      this.cancelLogin();
      this.set({
        status: "signed-out",
        error: cloudErrorText(
          (e as NodeJS.ErrnoException).code === "EADDRINUSE"
            ? "oauth_port"
            : "oauth_failed",
        ),
      });
      throw new Error(this.view.error);
    }
  }
  cancelLogin() {
    this.loginGeneration++;
    clearTimeout(this.loginTimer);
    this.server?.close();
    this.server = undefined;
    this.completionHost.close();
  }
  async signOut() {
    this.cancelLogin();
    this.signedOut = true;
    // Clear locally even if the network is offline. Tokens are never returned to UI.
    await this.client.auth.signOut({ scope: "local" }).catch(() => {});
    await this.storage.clear?.();
    this.set({ status: "signed-out", email: undefined, userId: undefined });
  }
  async reply(options: {
    requestId: string;
    deviceId: string;
    profile: Profile;
    memories: string[];
    history: { role: string; content: string }[];
    signal: AbortSignal;
    onDelta: (text: string) => void;
    execute: (call: ToolCall, signal: AbortSignal) => Promise<ToolResult>;
  }): Promise<string> {
    const history = options.history.slice(-32).map((m) => ({
      ...m,
      content:
        m.content.length > 16000
          ? `${m.content.slice(0, 15900)}\n[Konten dipotong untuk batas konteks demo.]`
          : m.content,
    }));
    while (
      history.length > 1 &&
      history.reduce((n, m) => n + m.content.length, 0) > 24000
    )
      history.shift();
    let body: Record<string, unknown> = {
      action: "start",
      requestId: options.requestId,
      deviceId: options.deviceId,
      profile: options.profile,
      memories: options.memories.slice(-12).map((m) => m.slice(0, 500)),
      messages: history,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    let text = "";
    try {
      for (let round = 0; round < 4; round++) {
        options.signal.throwIfAborted();
        const response = await this.request(body, options.signal);
        if (!response.body) throw new CloudError("incomplete_response");
        let tools: Extract<ChatEvent, { type: "tools" }> | undefined,
          done = false;
        for await (const data of sseData(response.body)) {
          options.signal.throwIfAborted();
          const event = JSON.parse(data) as ChatEvent;
          if (event.type === "delta") {
            text += event.text;
            options.onDelta(event.text);
          } else if (event.type === "error") {
            if (["access_denied", "sign_in_required"].includes(event.code))
              this.set({
                status:
                  event.code === "access_denied" ? "denied" : "signed-out",
                error: cloudErrorText(event.code),
              });
            throw new CloudError(event.code);
          } else if (event.type === "done") done = true;
          else if (event.type === "tools") tools = event;
        }
        if (done) return text;
        if (
          !tools ||
          tools.jobId !== options.requestId ||
          tools.round !== round + 1 ||
          tools.calls.length > 3
        )
          throw new CloudError("incomplete_response");
        await this.check(); // Recheck membership before local side effects, too.
        const results: ToolResult[] = [];
        const toolSignal = AbortSignal.any([
          options.signal,
          AbortSignal.timeout(9 * 60000),
        ]);
        for (const call of tools.calls) {
          toolSignal.throwIfAborted();
          results.push(await options.execute(call, toolSignal));
        }
        body = {
          action: "resume",
          requestId: options.requestId,
          deviceId: options.deviceId,
          round: tools.round,
          results,
        };
      }
      throw new CloudError("response_limit");
    } catch (e) {
      const cancel = this.request(
        {
          action: "cancel",
          requestId: options.requestId,
          deviceId: options.deviceId,
        },
        AbortSignal.timeout(4000),
      ).catch(() => {});
      if (!options.signal.aborted) await cancel;
      throw e;
    }
  }
}
