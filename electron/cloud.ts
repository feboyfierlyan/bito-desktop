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
import { readWebSearch, type WebSearch } from "../src/web-search";
import type { AuthView, Profile } from "../src/shared";
import { parseGroundingResult } from "../src/grounding";
import { parseMaterialAnalysis } from "../src/task-material";
import type { GroundingInput } from "../supabase/functions/_shared/grounding";
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
      "Akun ini belum terdaftar di gelombang akses awal Bito. Gunakan akun lain yang sudah terdaftar.",
    sign_in_required: "Sesi masuk berakhir. Silakan masuk lagi.",
    daily_limit:
      "Kuota chat AI harianmu sudah penuh. Tugas & pengingat lokal tetap aktif—kuota terisi lagi besok.",
    rate_limit:
      "Terlalu banyak permintaan dalam waktu singkat. Tunggu sekitar 30 detik lalu coba lagi.",
    search_unavailable:
      "Pencarian web sedang tidak merespons. Coba lagi sebentar atau lanjutkan tanpa pencarian web.",
    provider_limit:
      "Layanan AI sedang padat sementara. Tunggu sebentar lalu coba lagi.",
    provider_error:
      "Server AI sedang mengalami gangguan sementara (koneksi internetmu aman). Coba kirim ulang sebentar lagi.",
    server_error:
      "Layanan cloud Bito sedang mengalami kendala sementara. Coba lagi beberapa saat.",
    busy: "Masih ada permintaan yang sedang berjalan. Tunggu selesai atau klik Hentikan.",
    demo_paused: "Layanan AI cloud sedang dalam pemeliharaan sementara.",
    server_config: "Layanan cloud Bito belum selesai dikonfigurasi.",
    invalid_job:
      "Permintaan ini sudah selesai atau kedaluwarsa. Kirim pesan baru.",
    request_exists: "Permintaan ini sudah diterima. Tindakan tidak diulang.",
    invalid_request: "Format permintaan belum sesuai. Coba kirim ulang.",
    method_not_allowed: "Metode permintaan tidak didukung.",
    request_too_large:
      "Pesan atau lampiran terlalu besar untuk satu kiriman. Kurangi ukuran file lalu coba lagi.",
    context_too_large:
      "Pesan atau dokumen terlalu panjang. Coba bagian yang lebih pendek.",
    response_limit:
      "Jawaban berhenti karena mencapai batas panjang pesan. Ketik 'Lanjutkan' untuk meneruskan bagian berikutnya.",
    response_too_large:
      "Balasan terlalu panjang untuk satu putaran. Minta Bito memecahnya menjadi bagian lebih kecil.",
    incomplete_response:
      "Balasan AI terhenti sebelum selesai dari sisi server. Klik Coba lagi untuk mengulang.",
    empty_response:
      "AI belum menghasilkan jawaban untuk pesan ini. Klik Coba lagi atau perjelas pertanyaanmu.",
    invalid_stream:
      "Aliran balasan AI terputus dari server. Klik Coba lagi untuk mengulang.",
    invalid_tool:
      "Tindakan otomatis gagal diproses. Ulangi permintaan dengan kalimat yang lebih spesifik.",
    invalid_tool_result:
      "Hasil tindakan lokal belum terbaca oleh AI. Coba kirim ulang permintaanmu.",
    blocked:
      "Maaf, Bito belum bisa memproses pesan tersebut karena batasan keamanan topik. Jika kamu sedang mengalami situasi berat atau darurat, hubungi Kemenkes Healing119 di 119 ext. 8 (healing119.id) atau darurat 112.",
    interrupted: "Jawaban dihentikan.",
    screen_unavailable:
      "Panduan layar sedang tidak merespons. Coba lagi sebentar.",
    invalid_material:
      "Lampiran belum terbaca. Gunakan PDF, DOCX, XLSX, gambar (maks. 6 MB), atau teks (maks. 192 KB).",
    material_read_failed:
      "Lampiran belum berhasil dibaca. Coba file yang tidak terkunci sandi atau bagian halamannya.",
    invalid_grounding:
      "Bagian layar belum berhasil dikenali. Coba pilih area yang lebih spesifik.",
    oauth_timeout: "Waktu masuk habis. Silakan coba lagi.",
    oauth_port:
      "Jendela masuk masih dipakai proses lain. Tutup lalu coba lagi.",
    oauth_cancelled: "Proses masuk dengan Google dibatalkan.",
    oauth_failed: "Belum berhasil masuk dengan Google. Coba lagi.",
    offline:
      "Koneksi internet terputus. Proyek & tugas lokalmu tetap bisa dibuka.",
  };
  return (
    messages[code] ||
    "Bito belum bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi."
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
    private storage: SupportedStorage & {
      clear?: () => Promise<void> | void;
      getVerifiedUser?: () => Promise<{ id: string; email: string } | null>;
      setVerifiedUser?: (
        user: { id: string; email: string } | null,
      ) => Promise<void>;
    },
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
    } catch (e) {
      if (
        e instanceof CloudError &&
        ["access_denied", "sign_in_required"].includes(e.code)
      )
        return;
      // BITO-007: Unlock verified local vault when cold-booting offline.
      const cached = await this.storage.getVerifiedUser?.().catch(() => null);
      if (cached && (!data.session.user?.id || cached.id === data.session.user.id)) {
        this.set({
          status: "offline",
          userId: cached.id,
          email: cached.email,
          error: cloudErrorText("offline"),
        });
        return cached;
      }
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
        await this.storage.setVerifiedUser?.(user).catch(() => {});
        this.set({ status: "ready", userId: user.id, email: user.email });
        return user;
      } catch (e) {
        if (
          e instanceof CloudError &&
          ["access_denied", "sign_in_required"].includes(e.code)
        ) {
          await this.storage.setVerifiedUser?.(null).catch(() => {});
          if (e.code === "access_denied") {
            const session = await this.client.auth
              .getSession()
              .catch(() => ({ data: { session: null } }));
            const rejectedEmail = session.data.session?.user?.email;
            if (rejectedEmail)
              this.set({ status: "denied", email: rejectedEmail, error: e.message });
          }
        } else {
          this.set({
            status: "offline",
            error:
              e instanceof CloudError ? e.message : cloudErrorText("offline"),
          });
        }
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
      if (callback.searchParams.get("error")) {
        this.cancelLogin();
        this.set({
          status: "signed-out",
          error: cloudErrorText("oauth_cancelled"),
        });
        void this.finishLoginPage(response, "error");
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
    // Attempt server token revocation with short timeout, then always wipe local storage.
    await Promise.race([
      this.client.auth.signOut().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    await this.client.auth.signOut({ scope: "local" }).catch(() => {});
    await this.storage.clear?.();
    this.set({ status: "signed-out", email: undefined, userId: undefined });
  }
  async deleteAccount() {
    await this.request({ action: "delete_account" });
    await this.signOut();
  }
  async analyzeMaterial(options: {
    requestId: string;
    deviceId: string;
    name: string;
    mimeType: string;
    data: string;
    signal: AbortSignal;
  }) {
    try {
      const response = await this.request(
        {
          action: "material",
          requestId: options.requestId,
          deviceId: options.deviceId,
          name: options.name,
          mimeType: options.mimeType,
          data: options.data,
        },
        options.signal,
      );
      return parseMaterialAnalysis(await response.json());
    } catch (error) {
      void this.request(
        {
          action: "cancel",
          requestId: options.requestId,
          deviceId: options.deviceId,
        },
        AbortSignal.timeout(4000),
      ).catch(() => {});
      throw error;
    }
  }
  async ground(options: {
    requestId: string;
    deviceId: string;
    input: GroundingInput;
    signal: AbortSignal;
    toolCallId?: string;
    round?: number;
  }) {
    try {
      const response = await this.request(
        {
          action: "ground",
          requestId: options.requestId,
          deviceId: options.deviceId,
          question: options.input.question,
          app: options.input.app,
          title: options.input.title,
          scope: options.input.scope,
          history: options.input.history,
          guide: options.input.guide,
          elements: options.input.elements,
          image: options.input.image,
          profile: { style: options.input.style },
          toolCallId: options.toolCallId,
          round: options.round,
        },
        options.signal,
      );
      return parseGroundingResult(await response.json());
    } catch (error) {
      void this.request(
        {
          action: "cancel",
          requestId: options.requestId,
          deviceId: options.deviceId,
        },
        AbortSignal.timeout(4000),
      ).catch(() => {});
      throw error;
    }
  }
  async reply(options: {
    requestId: string;
    deviceId: string;
    profile: Profile;
    projectContext?: string;
    screenGuidance?: boolean;
    screenContext?: { app: string; title: string };
    memories: string[];
    history: { role: string; content: string }[];
    signal: AbortSignal;
    onDelta: (text: string) => void;
    onActivity?: (phase: "searching" | "thinking") => void;
    onSources?: (search: WebSearch) => void;
    execute: (
      call: ToolCall,
      signal: AbortSignal,
      context: { round: number },
    ) => Promise<ToolResult>;
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
      capabilities: {
        screenGuide: options.screenGuidance === true,
        projects: options.projectContext !== undefined,
      },
      projectContext: options.projectContext,
      screenContext: options.screenContext,
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
          } else if (event.type === "activity") {
            if (event.phase === "searching" || event.phase === "thinking")
              options.onActivity?.(event.phase);
          } else if (event.type === "sources") {
            const search = readWebSearch(event.search);
            if (search) options.onSources?.(search);
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
          if (call.name === "inspect_screen" && options.screenGuidance !== true) {
            results.push({ id: call.id, ok: false, result: "Screen access was not authorized for this turn. Ask the user to request screen help explicitly." });
            continue;
          }
          const result = await options.execute(call, toolSignal, {
            round: tools.round,
          });
          results.push(result);
          if (call.name === "inspect_screen") {
            let guide: {
              guiding?: boolean;
              handled?: boolean;
              answer?: unknown;
            } = {};
            try {
              guide = JSON.parse(result.result);
            } catch {
              /* ordinary tool error */
            }
            if (
              (guide.handled === true ||
                (result.ok && guide.guiding === true)) &&
              typeof guide.answer === "string"
            ) {
              // The local guide owns the remaining flow. Release this waiting
              // chat lease before it can submit the next verification request;
              // no redundant model reply or unrelated tool execution follows.
              await this.request(
                {
                  action: "cancel",
                  requestId: options.requestId,
                  deviceId: options.deviceId,
                },
                options.signal,
              );
              options.onDelta(guide.answer);
              return text + guide.answer;
            }
          }
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
