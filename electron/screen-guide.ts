import {
  BrowserWindow,
  desktopCapturer,
  nativeImage,
  screen,
  systemPreferences,
  globalShortcut,
  shell,
  dialog,
  ipcMain,
  type NativeImage,
} from "electron";
import { join } from "node:path";
import { release } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import {
  ScreenContext,
  type ExternalWindow,
  type InterfaceObservation,
} from "./screen-context";
import {
  GuideObservationGate,
  guideImageChanged,
  interfaceSignature,
} from "./guide-observation";
import {
  besideTarget,
  containsScreenRect,
  imageChanged,
  sameScreenRect,
  targetInDesktop,
  resolveGroundingTarget,
  placeGuideBubble,
  type GuideContext,
  type ScreenElement,
  type GroundingResult,
  type ScreenRect,
} from "../src/grounding";
import type { GroundingInput } from "../supabase/functions/_shared/grounding";
import type { BitoStyle } from "../src/bito-voice";
import { screenFailureText } from "./screen-assistance";

import {
  GuideResultCache,
  GuideTimings,
  menuContinuation,
  resolveMenuContinuation,
  type MenuContinuation,
} from "./guide-fast-path";
class ScreenHelpError extends Error {}
type Capture = {
  image: NativeImage;
  bounds: ScreenRect;
  kind: "native-display" | "electron-display" | "electron-window";
};
type Session = {
  controller: AbortController;
  window?: ExternalWindow;
  origin?: ScreenRect;
  timer?: ReturnType<typeof setTimeout>;
  reason?: string;
  returning?: boolean;
  target?: ScreenRect;
  petFocus?: { window: BrowserWindow; focusable: boolean };
  unsubscribe?: () => void;
  watching?: boolean;
  wakeRequested?: boolean;
  guide?: {
    context: GuideContext;
    generate: (
      input: GroundingInput,
      signal: AbortSignal,
    ) => Promise<GroundingResult>;
    style: BitoStyle;
    gate?: GuideObservationGate;
    captureKind?: Capture["kind"];
    at: number;
    checks: number;
    paused: boolean;
    text: string;
    phase: "thinking" | "talking" | "waiting";
    activity?: string;
    followUpLeft?: number;
    recoveryLeft: number;
    receiptReady: boolean;
    cache: GuideResultCache;
    nextMenu?: MenuContinuation;
    lastAnswer?: string;
    onProgress?: (text: string) => void;
    explanation?: {
      stops: { text: string; label: string; target: ScreenRect }[];
      index: number;
      frame: ScreenRect;
      fingerprint: Buffer;
      moving: boolean;
    };
  };
};
export class ScreenGuide {
  private context: ScreenContext;
  private timings = new GuideTimings();
  get diagnostics() {
    return this.timings.snapshot();
  }
  private overlay?: BrowserWindow;
  private overlayLoaded?: Promise<void>;
  private active?: Session;
  private motion?: ReturnType<typeof setInterval>;
  private finishMotion?: () => void;
  private watch?: ReturnType<typeof setTimeout>;
  private escapeRegistered = false;
  private permissionRequested = false;
  private accessibilityRequested = false;
  private protectedWindows = new Map<BrowserWindow, boolean>();
  private conversation?: {
    window: ExternalWindow;
    at: number;
    turns: { role: "user" | "assistant"; content: string }[];
  };
  get hasRecentContext() {
    return !!this.conversation && Date.now() - this.conversation.at < 180000;
  }
  forgetConversation() {
    this.conversation = undefined;
  }
  constructor(
    private options: {
      directory: string;
      dev?: string;
      pet: () => BrowserWindow | null;
      chat: () => BrowserWindow | null;
      enabled: () => boolean;
      reducedMotion: () => boolean;
      restoreLevel: () => void;
      onMove: () => void;
      accompanying?: (position: ScreenRect) => ScreenRect[];
      beginGuide?: (signal: AbortSignal) => Promise<void>;
      guideState?: (
        phase: "thinking" | "talking" | "waiting" | undefined,
      ) => void;
      watchInterval?: number;
    },
  ) {
    this.context = new ScreenContext(
      join(
        options.directory.replace(/app\.asar(?=[/\\])/, "app.asar.unpacked"),
        "native",
      ),
    );
  }
  get available() {
    return (
      ["darwin", "win32"].includes(process.platform) && this.options.enabled()
    );
  }
  get guiding() {
    return !!this.active?.guide && !this.active.returning;
  }
  get explaining() {
    return this.guiding && !!this.active?.guide?.explanation;
  }
  async nextExplanation() {
    const session = this.active,
      tour = session?.guide?.explanation;
    if (!session || !tour || tour.moving) return;
    tour.moving = true;
    clearTimeout(session.timer);
    try {
      this.assertSession(session);
      if (tour.index + 1 >= tour.stops.length) {
        await this.finishGuide(
          session,
          "Itu bagian-bagian yang terlihat sekarang. Kalau mau bahas salah satunya, klik aku dan tanya, ya.",
        );
        return;
      }
      this.guidePhase(session, "thinking");
      this.guideBubble(session);
      const window = await this.current();
      if (!this.matches(session.window!, window))
        throw new ScreenHelpError(
          "Jendelanya berubah. Minta aku jelaskan tampilan yang baru, ya.",
        );
      const display = screen.getDisplayMatching(window!.bounds);
      const fresh = await this.capture(
        window!,
        display,
        session.controller.signal,
        session.guide!.captureKind,
      );
      this.assertSession(session);
      if (
        !sameScreenRect(tour.frame, fresh.bounds) ||
        guideImageChanged(tour.fingerprint, this.fingerprint(fresh.image))
      )
        throw new ScreenHelpError(
          "Isi layarnya berubah. Aku hentikan sorotan lama; tanya lagi untuk menjelaskan tampilan yang baru, ya.",
        );
      tour.index++;
      await this.showExplanation(session);
    } catch (error) {
      if (this.active === session && !session.controller.signal.aborted)
        await this.finishGuide(
          session,
          error instanceof ScreenHelpError
            ? error.message
            : screenFailureText(error),
        );
    } finally {
      tour.moving = false;
    }
  }
  private claimEscape() {
    if (this.escapeRegistered) return;
    this.escapeRegistered = globalShortcut.register("Escape", () =>
      this.cancel("Bantuan layar dihentikan."),
    );
  }
  private releaseEscape() {
    if (!this.escapeRegistered) return;
    globalShortcut.unregister("Escape");
    this.escapeRegistered = false;
  }
  private async showExplanation(session: Session) {
    // A passive tour advertises "Esc keluar"; the user is reading, not typing.
    this.claimEscape();
    const tour = session.guide!.explanation!,
      stop = tour.stops[tour.index];
    const display = screen.getDisplayMatching(session.window!.bounds);
    session.guide!.text = stop.text;
    this.guidePhase(session, "thinking");
    await this.show(
      session,
      stop.target,
      stop.label,
      display.bounds,
      display.workArea,
    );
    this.assertSession(session);
    this.guidePhase(session, "talking");
    this.guideBubble(session);
    this.recordGuideAnswer(session, stop.text);
    const index = tour.index;
    setTimeout(
      () => {
        if (
          this.active === session &&
          !session.controller.signal.aborted &&
          session.guide?.explanation === tour &&
          tour.index === index &&
          !tour.moving
        )
          this.guidePhase(session, "waiting");
      },
      Math.min(14000, Math.max(1000, stop.text.length * 55)),
    ).unref();
    this.endAfter(session, 120000);
  }
  async modelContext() {
    if (!this.available) return undefined;
    const window = await this.current();
    return window
      ? { app: window.app.slice(0, 200), title: window.title.slice(0, 500) }
      : undefined;
  }
  get originalPosition() {
    return this.active?.origin;
  }

  private async current(): Promise<ExternalWindow | null> {
    const window = await this.timings.measure("metadata", () =>
      this.context.read(),
    );
    if (window && process.platform === "win32")
      window.bounds = screen.screenToDipRect(null, window.bounds);
    return window;
  }
  private async observe(window: ExternalWindow) {
    const view = await this.timings.measure("accessibility", () =>
      this.context.observe(window.pid),
    );
    if (view && process.platform === "win32")
      for (const element of view.elements)
        element.bounds = screen.screenToDipRect(null, element.bounds);
    return view;
  }
  private async waitingBubble(session: Session) {
    await this.ensureOverlay();
    this.assertSession(session);
    const display = screen.getDisplayMatching(
      this.options.pet()?.getBounds() || session.window!.bounds,
    );
    this.overlay!.setBounds(display.bounds);
    this.overlay!.webContents.send("bito:spotlight", {
      visible: false,
      target: undefined,
      reducedMotion: this.options.reducedMotion(),
    });
    this.guideBubble(session);
    this.overlay!.showInactive();
  }
  private guidePhase(
    session: Session,
    phase: "thinking" | "talking" | "waiting",
  ) {
    this.assertSession(session);
    session.guide!.phase = phase;
    this.options.guideState?.(phase);
  }
  private recordGuideAnswer(session: Session, text: string) {
    this.assertSession(session);
    const guide = session.guide!;
    if (guide.lastAnswer === text) return;
    guide.lastAnswer = text;
    if (
      this.conversation &&
      this.conversation.window.pid === session.window?.pid
    ) {
      this.conversation.at = Date.now();
      this.conversation.window = session.window!;
      if (this.conversation.turns.at(-1)?.content !== text.slice(0, 1200))
        this.conversation.turns = [
          ...this.conversation.turns,
          { role: "assistant" as const, content: text.slice(0, 1200) },
        ].slice(-6);
    }
    if (guide.receiptReady) guide.onProgress?.(text);
  }
  private endAfter(session: Session, ms: number) {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      if (this.active === session) this.cancel();
    }, ms);
    session.timer.unref();
  }
  private pauseGuide(session: Session) {
    this.assertSession(session);
    session.guide!.paused = true;
    this.releaseEscape(); // The user is working in another app.
    this.overlay?.webContents.send("bito:spotlight", { visible: false });
    session.guide!.text = "Aku tunggu kamu kembali ke aplikasinya, ya.";
    clearTimeout(session.timer);
    this.guidePhase(session, "waiting");
    this.guideBubble(session);
  }
  private async waitForApplication(session: Session, window: ExternalWindow) {
    // Native activation is asynchronous. A focus mismatch is a waiting state,
    // not a failed guide. Clicking the target app resumes this same request.
    const deadline = Date.now() + 30000;
    let announced = false;
    while (Date.now() < deadline) {
      this.assertSession(session);
      const view = await this.observe(window);
      this.assertSession(session);
      if (view?.frontPid === window.pid) {
        this.guidePhase(session, "thinking");
        session.guide!.text = "Sebentar, aku cek dulu…";
        this.guideBubble(session);
        return;
      }
      if (!announced) {
        announced = true;
        session.guide!.text = "Klik aplikasinya dulu. Aku tunggu di sini, ya.";
        this.guidePhase(session, "waiting");
        await this.waitingBubble(session);
      }
      await delay(120, undefined, { signal: session.controller.signal });
    }
    throw new ScreenHelpError(
      "Aplikasinya belum aktif, jadi panduannya belum dimulai. Klik aplikasinya, lalu minta aku bantu lagi, ya.",
    );
  }
  private guideInput(
    session: Session,
    window: ExternalWindow,
    captured: Capture,
    view: InterfaceObservation | null,
  ): GroundingInput {
    const size = captured.image.getSize();
    let bytes = captured.image.toJPEG(86);
    if (bytes.length > 1300000) bytes = captured.image.toJPEG(65);
    if (bytes.length > 1300000)
      throw new ScreenHelpError(
        "Tampilan ini terlalu besar untuk kubaca. Coba perkecil jendelanya, ya.",
      );
    return {
      question: session.guide!.context.goal,
      style: session.guide!.style,
      app: window.app.slice(0, 200),
      title: window.title.slice(0, 500),
      scope: captured.kind !== "electron-window" ? "display" : "window",
      history: [],
      guide: { ...session.guide!.context },
      elements: (view?.elements || [])
        .filter((e) => containsScreenRect(captured.bounds, e.bounds))
        .map((e) => ({
          ...e,
          bounds: {
            x:
              ((e.bounds.x - captured.bounds.x) / captured.bounds.width) * 1000,
            y:
              ((e.bounds.y - captured.bounds.y) / captured.bounds.height) *
              1000,
            width: (e.bounds.width / captured.bounds.width) * 1000,
            height: (e.bounds.height / captured.bounds.height) * 1000,
          },
        })),
      image: {
        mimeType: "image/jpeg",
        data: bytes.toString("base64"),
        ...size,
      },
    };
  }
  private matches(a: ExternalWindow, b: ExternalWindow | null) {
    return (
      !!b &&
      a.id === b.id &&
      a.pid === b.pid &&
      a.title === b.title &&
      sameScreenRect(a.bounds, b.bounds)
    );
  }
  private async allowed() {
    if (!["darwin", "win32"].includes(process.platform))
      throw new ScreenHelpError(
        "Bantuan layar versi ini tersedia di macOS dan Windows dulu, ya.",
      );
    if (process.platform !== "darwin") return;
    const permission = systemPreferences.getMediaAccessStatus("screen");
    if (permission === "granted") {
      if (
        !(await this.context.accessibility()) &&
        !this.accessibilityRequested
      ) {
        this.accessibilityRequested = true;
        if (await this.context.accessibility(true)) return;
        throw new ScreenHelpError(
          `Aku baru meminta izin Aksesibilitas ke macOS. Aktifkan ${this.options.dev ? "Electron (Bito mode revisi)" : "Bito"} di Pengaturan Sistem → Privasi & Keamanan → Aksesibilitas, lalu tanyakan lagi, ya. Izin ini membantu membaca letak tombol; Bito tetap tidak mengekliknya.`,
        );
      }
      return;
    }
    if (!this.permissionRequested) {
      this.permissionRequested = true;
      // This is the OS permission request, not a captured image sent to AI.
      // Do not await: some macOS versions leave enumeration pending until restart.
      void desktopCapturer
        .getSources({
          types: ["screen"],
          thumbnailSize: { width: 1, height: 1 },
        })
        .catch(() => {});
      throw new ScreenHelpError(
        "Untuk bantuan layar, izinkan Perekaman Layar untuk Bito di macOS. Gambar layar yang sedang kamu tanyakan akan dikirim ke AI. Buka ulang kalau diminta, lalu kirim pertanyaanmu lagi, ya.",
      );
    }
    const response = await dialog.showMessageBox({
      type: "info",
      title: "Izinkan Bito membaca layar",
      message:
        "Bito perlu izin Perekaman Layar untuk membantu menunjukkan bagian aplikasi.",
      detail:
        "Gambar layar aktif dikirim ke AI hanya saat kamu bertanya tentang layar, dengan Bito dikecualikan bila didukung sistem. Tidak disimpan di riwayat Bito. Setelah mengizinkan, macOS mungkin meminta Bito dibuka ulang.",
      buttons: ["Buka Pengaturan", "Nanti"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response.response === 0)
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      );
    throw new ScreenHelpError(
      "Izinkan Perekaman Layar untuk Bito di Pengaturan Sistem dulu, ya. Kalau macOS minta, tutup lalu buka Bito lagi.",
    );
  }
  private capture(
    window: ExternalWindow,
    display: Electron.Display,
    signal: AbortSignal,
    kind?: Capture["kind"],
  ) {
    return this.timings.measure("capture", () =>
      this.captureImage(window, display, signal, kind),
    );
  }
  private async captureImage(
    window: ExternalWindow,
    display: Electron.Display,
    signal: AbortSignal,
    kind?: Capture["kind"],
  ): Promise<Capture> {
    if (
      process.platform === "win32" &&
      Number(release().split(".")[2]) >= 19041 &&
      kind !== "electron-window"
    ) {
      // Modern Windows removes protected Bito windows from display capture,
      // retaining the external app's separate menus/popovers. Protection takes
      // effect on a later compositor frame; never hide/re-show the character.
      let changed = false;
      for (const win of [
        this.options.pet(),
        this.options.chat(),
        this.overlay,
      ]) {
        if (!win || win.isDestroyed() || this.protectedWindows.has(win))
          continue;
        this.protectedWindows.set(win, win.isContentProtected());
        win.setContentProtection(true);
        changed = true;
      }
      if (changed)
        await this.withDeadline(
          new Promise((resolve) => setTimeout(resolve, 100)),
          signal,
        );
      const sources = await this.withDeadline(
        desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 1800, height: 1800 },
        }),
        signal,
      );
      const image = sources.find(
        (s) => s.display_id === String(display.id),
      )?.thumbnail;
      if (image && !image.isEmpty()) {
        const size = image.getSize();
        if (
          size.width >= 100 &&
          size.height >= 70 &&
          Math.abs(
            size.width /
              size.height /
              (display.bounds.width / display.bounds.height) -
              1,
          ) < 0.035
        )
          return { image, bounds: display.bounds, kind: "electron-display" };
      }
      if (kind === "electron-display")
        throw new ScreenHelpError(
          "Tangkapan layarnya terputus. Coba lagi sebentar, ya.",
        );
    }
    // ScreenCaptureKit keeps menus/popovers and removes Bito without hiding or
    // flashing its windows. Older systems retain the Electron window path.
    if (process.platform === "darwin" && kind !== "electron-window") {
      const captured = await this.withDeadline(
        this.context.capture(display.id),
        signal,
      );
      if (captured && sameScreenRect(captured.bounds, display.bounds)) {
        const image = nativeImage.createFromBuffer(
          Buffer.from(captured.data, "base64"),
        );
        const size = image.getSize();
        if (
          !image.isEmpty() &&
          size.width === captured.width &&
          size.height === captured.height
        )
          return { image, bounds: captured.bounds, kind: "native-display" };
      }
      if (kind === "native-display")
        throw new ScreenHelpError(
          "Tangkapan layarnya terputus. Cek izin Perekaman Layar untuk Bito, lalu coba lagi, ya.",
        );
    }
    if (!containsScreenRect(display.bounds, window.bounds))
      throw new ScreenHelpError(
        "Tangkapan layar belum tersedia untuk jendela yang melintasi dua monitor. Taruh di satu layar dulu, ya.",
      );
    let sources;
    try {
      sources = await this.withDeadline(
        desktopCapturer.getSources({
          types: ["window"],
          thumbnailSize: { width: 1800, height: 1800 },
          fetchWindowIcons: false,
        }),
        signal,
      );
    } catch {
      throw new ScreenHelpError(
        "Tangkapan jendelanya belum tersedia. Cek izin Perekaman Layar untuk Bito, lalu buka ulang Bito kalau macOS meminta.",
      );
    }
    const source = sources.find((s) => s.id.split(":")[1] === window.id);
    if (!source || source.thumbnail.isEmpty())
      throw new ScreenHelpError(
        "Aku belum mendapat gambar jendelanya dari sistem. Cek izin Perekaman Layar untuk Bito, lalu buka ulang Bito kalau macOS meminta.",
      );
    const size = source.thumbnail.getSize();
    const expected = window.bounds.width / window.bounds.height;
    if (
      size.width < 100 ||
      size.height < 70 ||
      Math.abs(size.width / size.height / expected - 1) > 0.035
    )
      throw new ScreenHelpError(
        "Ukuran jendelanya sedang berubah. Coba lagi setelah jendelanya diam, ya.",
      );
    return {
      image: source.thumbnail,
      bounds: window.bounds,
      kind: "electron-window",
    };
  }
  private withDeadline<T>(
    pending: Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const finish = (error: unknown, value?: T) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
        error ? reject(error) : resolve(value!);
      };
      const stop = () =>
        finish(new ScreenHelpError("Bantuan layar dihentikan."));
      const timer = setTimeout(
        () =>
          finish(
            new ScreenHelpError(
              "Jendelanya belum bisa dibaca. Periksa izin Perekaman Layar lalu coba lagi, ya.",
            ),
          ),
        12000,
      );
      signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) stop();
      pending.then(
        (value) => finish(null, value),
        (error) => finish(error),
      );
    });
  }
  private fingerprint(image: NativeImage) {
    return image
      .resize({ width: 160, height: 100, quality: "good" })
      .toBitmap();
  }
  private assertSession(session: Session) {
    if (
      session.controller.signal.aborted ||
      this.active !== session ||
      !this.options.enabled()
    )
      throw new ScreenHelpError(session.reason || "Bantuan layar dihentikan.");
  }
  private scheduleWatch(session: Session) {
    clearTimeout(this.watch);
    this.watch = setTimeout(async () => {
      if (this.active !== session || session.controller.signal.aborted) return;
      try {
        const current = await this.current();
        if (this.active !== session || session.controller.signal.aborted)
          return;
        if (
          !this.options.enabled() ||
          (session.window && !this.matches(session.window, current))
        ) {
          this.cancel(
            "Jendelanya sudah berubah. Tanyakan lagi di tampilan yang baru, ya.",
          );
          return;
        }
        this.scheduleWatch(session);
      } catch {
        if (this.active === session)
          this.cancel("Pembacaan jendelanya terputus. Coba lagi, ya.");
      }
    }, 500);
    this.watch.unref();
  }
  async answer(options: {
    question: string;
    history?: GroundingInput["history"];
    style: BitoStyle;
    signal: AbortSignal;
    generate: (
      input: GroundingInput,
      signal: AbortSignal,
    ) => Promise<GroundingResult>;
    onAnswer: (text: string) => void;
    onProgress?: (text: string) => void;
    continueWith?: (
      input: GroundingInput,
      signal: AbortSignal,
    ) => Promise<GroundingResult>;
  }) {
    const origin = this.active?.origin;
    this.cancel(undefined, false);
    const session: Session = { controller: new AbortController() };
    session.origin = origin;
    this.active = session;
    const stop = () => {
      if (this.active === session) this.cancel("Bantuan layar dihentikan.");
    };
    options.signal.addEventListener("abort", stop, { once: true });
    if (options.signal.aborted) stop();
    try {
      this.assertSession(session);
      await this.allowed();
      this.assertSession(session);
      let window = await this.current();
      this.assertSession(session);
      if (!window)
        throw new ScreenHelpError(
          "Buka dulu jendela aplikasi yang ingin kamu tanyakan, ya.",
        );
      session.window = window;
      // Escape stops Bito while it works. It is handed back to the target app
      // whenever a step waits for the user to act there (see acceptGuideResult).
      this.claimEscape();
      if (options.continueWith) {
        session.guide = {
          context: { goal: options.question, step: 0 },
          generate: options.continueWith,
          style: options.style,
          at: Date.now(),
          checks: 0,
          paused: false,
          text: "Sebentar, aku cek dulu…",
          phase: "thinking",
          recoveryLeft: 1,
          receiptReady: false,
          cache: new GuideResultCache(),
          onProgress: options.onProgress,
        };
        const pet = this.options.pet();
        if (pet && !pet.isDestroyed()) {
          session.petFocus = { window: pet, focusable: pet.isFocusable() };
          pet.setFocusable(false);
        }
        // Hide the focused composer, then restore the exact external app once.
        // No window activation is performed during subsequent observations.
        this.guidePhase(session, "thinking");
        await this.waitingBubble(session);
        await this.options.beginGuide?.(session.controller.signal);
        this.assertSession(session);
        await this.context.activate(window.pid);
        this.assertSession(session);
        await this.waitForApplication(session, window);
        const focused = await this.current();
        this.assertSession(session);
        if (focused?.pid === window.pid) window = focused;
        session.window = window;
      }
      const display = screen.getDisplayMatching(window.bounds);
      if (!session.guide) this.scheduleWatch(session);
      const view = session.guide ? await this.observe(window) : null;
      this.assertSession(session);
      if (session.guide && view && view.frontPid !== window.pid)
        throw new ScreenHelpError(
          "Buka aplikasi yang ingin kamu tanyakan di depan dulu, ya.",
        );
      let capture = await this.capture(
        window,
        display,
        session.controller.signal,
      );
      let image = capture.image;
      this.assertSession(session);
      const fingerprint = this.fingerprint(image),
        size = image.getSize();
      let bytes = image.toJPEG(86);
      if (bytes.length > 1300000) bytes = image.toJPEG(65);
      if (bytes.length > 1300000)
        throw new ScreenHelpError(
          "Tampilannya terlalu besar untuk kubaca sekaligus. Coba perkecil jendelanya sedikit, ya.",
        );
      const input: GroundingInput = {
        question: options.question,
        style: options.style,
        app: window.app.slice(0, 200),
        title: window.title.slice(0, 500),
        scope: capture.kind !== "electron-window" ? "display" : "window",
        history:
          this.hasRecentContext &&
          this.conversation?.window.id === window.id &&
          this.conversation.window.pid === window.pid
            ? this.conversation.turns.slice(-6)
            : (options.history || []).slice(-6).map((turn) => ({
                role: turn.role,
                content: turn.content.slice(0, 1200),
              })),
        image: {
          mimeType: "image/jpeg",
          data: bytes.toString("base64"),
          ...size,
        },
        elements: [],
      };
      if (session.guide) {
        const history = input.history;
        Object.assign(input, this.guideInput(session, window, capture, view), {
          history,
        });
      }
      // Images and buffers stay in this request scope, never AppState/SQLite.
      let result: GroundingResult;
      try {
        result = await this.timings.measure("model", () =>
          options.generate(
            input,
            AbortSignal.any([
              options.signal,
              session.controller.signal,
              AbortSignal.timeout(45000),
            ]),
          ),
        );
      } finally {
        input.image.data = "";
      }
      this.assertSession(session);
      const current = await this.current();
      this.assertSession(session);
      if (!this.matches(window, current))
        throw new ScreenHelpError(
          "Jendelanya sudah berubah. Tanyakan lagi di tampilan yang baru, ya.",
        );
      const fresh = await this.capture(
        window,
        display,
        session.controller.signal,
        capture.kind,
      );
      image = fresh.image;
      if (!sameScreenRect(capture.bounds, fresh.bounds))
        throw new ScreenHelpError(
          "Ukuran layarnya sudah berubah. Tanyakan lagi, ya.",
        );
      this.assertSession(session);
      const freshView = session.guide ? await this.observe(window) : null;
      this.assertSession(session);
      if (
        (session.guide ? guideImageChanged : imageChanged)(
          fingerprint,
          this.fingerprint(image),
        ) ||
        (session.guide &&
          (!freshView ||
            freshView.frontPid !== window.pid ||
            freshView.activity !== view?.activity ||
            interfaceSignature(freshView) !== interfaceSignature(view)))
      )
        throw new ScreenHelpError(
          "Isi layarnya sudah berubah sejak aku membacanya. Coba tanyakan lagi, ya.",
        );
      if (session.guide && result.explanation?.length) {
        const stops = result.explanation
          .map((region) => ({
            text: region.answer,
            label: region.label,
            target: targetInDesktop(
              { ...region, status: "found" },
              capture.bounds,
            ),
          }))
          .filter(
            (
              stop,
            ): stop is { text: string; label: string; target: ScreenRect } =>
              !!stop.target && containsScreenRect(display.bounds, stop.target),
          );
        if (!stops.length)
          throw new ScreenHelpError(
            "Aku belum yakin area yang aman ditunjukkan. Sebut bagian yang ingin kamu bahas, ya.",
          );
        session.guide.captureKind = capture.kind;
        session.guide.explanation = {
          stops,
          index: 0,
          frame: capture.bounds,
          fingerprint,
          moving: true,
        };
        await this.showExplanation(session);
        this.assertSession(session);
        session.guide.explanation.moving = false;
        this.conversation = {
          window,
          at: Date.now(),
          turns: [
            ...(input.history || []),
            { role: "user" as const, content: options.question.slice(0, 1200) },
            {
              role: "assistant" as const,
              content: stops[0].text.slice(0, 1200),
            },
          ].slice(-6),
        };
        const answer = stops[0].text;
        options.onAnswer(answer);
        return {
          status: result.status,
          answer,
          label: stops[0].label,
          highlighted: true,
          guiding: true,
          handled: true,
        };
      }
      let target = session.guide
        ? resolveGroundingTarget(result, capture.bounds, view?.elements || [])
        : targetInDesktop(result, capture.bounds);
      if (target && !containsScreenRect(display.bounds, target)) target = null;
      result = this.validateTarget(result, target);
      if (session.guide) session.guide.text = result.answer;
      let highlighted = false;
      if (target && containsScreenRect(display.bounds, target)) {
        await this.show(
          session,
          target,
          result.label,
          display.bounds,
          display.workArea,
        );
        this.assertSession(session);
        highlighted = true;
      }
      this.conversation = {
        window,
        at: Date.now(),
        turns: [
          ...(input.history || []),
          { role: "user" as const, content: options.question.slice(0, 1200) },
          { role: "assistant" as const, content: result.answer.slice(0, 1200) },
        ].slice(-6),
      };
      options.onAnswer(result.answer);
      if (session.guide) {
        await this.acceptGuideResult(
          session,
          result,
          fresh,
          freshView,
          highlighted,
        );
      } else if (!highlighted) this.cancel();
      // Dimming lifetime includes the beginning of the spoken answer.
      else this.endAfter(session, 6200);
      return {
        status: result.status,
        answer: result.answer,
        label: result.label,
        highlighted,
        ...(session.guide ? { guiding: true, handled: true } : {}),
      };
    } catch (e) {
      if (options.signal.aborted) throw e;
      if (
        session.guide &&
        this.active === session &&
        !session.controller.signal.aborted
      ) {
        const answer =
          e instanceof ScreenHelpError ? e.message : screenFailureText(e);
        await this.finishGuide(session, answer);
        options.onAnswer(answer);
        return {
          status: "unavailable" as const,
          answer,
          label: "",
          highlighted: false,
          handled: true,
        };
      }
      if (e instanceof ScreenHelpError || session.controller.signal.aborted) {
        // A superseded request may finish after the next one has started.
        // Its pixels, errors and chat callback must never reach that new turn.
        if (this.active && this.active !== session && !session.reason)
          throw new ScreenHelpError(
            "Bantuan layar digantikan permintaan baru.",
          );
        options.onAnswer(
          session.reason ||
            (e instanceof Error ? e.message : "Bantuan layar dihentikan."),
        );
        if (this.active === session) this.cancel();
        return {
          status: "unavailable" as const,
          answer:
            session.reason ||
            (e instanceof Error ? e.message : "Bantuan layar dihentikan."),
          label: "",
          highlighted: false,
          ...(options.continueWith ? { handled: true } : {}),
        };
      } else {
        if (this.active === session) this.cancel();
        throw e;
      }
    } finally {
      options.signal.removeEventListener("abort", stop);
      if (this.active === session && session.guide)
        session.guide.receiptReady = true;
    }
  }
  private async acceptGuideResult(
    session: Session,
    result: GroundingResult,
    captured: Capture,
    view: InterfaceObservation | null,
    highlighted: boolean,
  ) {
    this.assertSession(session);
    const guide = session.guide!;
    const decision = result.guide;
    if (
      !decision ||
      decision.progress === "blocked" ||
      decision.progress === "done" ||
      !highlighted
    ) {
      await this.finishGuide(session, result.answer);
      return;
    }
    if (decision.progress !== "waiting") {
      guide.context = {
        ...guide.context,
        step: guide.context.step + 1,
        previous: {
          label: result.label,
          instruction: result.answer,
          expected: decision.expected,
        },
      };
    }
    guide.nextMenu = menuContinuation(result, session.window!, view);
    guide.text = result.answer;
    guide.captureKind = captured.kind;
    guide.gate = new GuideObservationGate(
      view,
      this.fingerprint(captured.image),
      captured.bounds,
    );
    // A delayed menu/load can settle after the first verification said waiting.
    // Permit one further changed-state check from that same interaction only.
    if (decision.progress === "waiting" && (guide.followUpLeft || 0) > 0) {
      guide.followUpLeft!--;
      guide.gate.continueTransition(Date.now());
    }
    guide.activity = view?.activity;
    // The user now acts in the target app: its menus and dialogs must receive
    // Escape. Clicking Bito (or moving it) still stops the guide.
    this.releaseEscape();
    this.guidePhase(session, "talking");
    clearTimeout(session.timer);
    session.timer = setTimeout(
      () => {
        if (this.active === session && !session.controller.signal.aborted)
          this.guidePhase(session, "waiting");
      },
      Math.min(5000, Math.max(1000, result.answer.length * 32)),
    );
    this.guideBubble(session);
    this.recordGuideAnswer(session, result.answer);
    if (!session.unsubscribe)
      session.unsubscribe = this.context.subscribe(session.window!.pid, () => {
        if (
          this.active !== session ||
          session.controller.signal.aborted ||
          !session.guide?.gate
        )
          return;
        session.guide.gate.continueTransition(Date.now());
        if (session.watching) session.wakeRequested = true;
        else this.scheduleGuide(session, true);
      });
    this.scheduleGuide(session);
  }
  private validateTarget(
    result: GroundingResult,
    target: ScreenRect | null,
  ): GroundingResult {
    if (result.status !== "found" || target) return result;
    return {
      ...result,
      status: "ambiguous",
      label: "",
      box: [],
      answer:
        "Aku belum bisa memastikan letak bagian itu di tampilan ini. Sebut nama atau cirinya sedikit lagi, ya.",
      ...(result.guide
        ? {
            guide: {
              progress: "blocked",
              expected: "",
              evidence: "",
              elementId: "",
            } as const,
          }
        : {}),
    };
  }
  private guideBubble(session: Session) {
    const overlay = this.overlay,
      pet = this.options.pet();
    if (
      !overlay ||
      overlay.isDestroyed() ||
      !pet ||
      pet.isDestroyed() ||
      !session.guide
    )
      return;
    const frame = overlay.getBounds(),
      anchor = pet.getBounds();
    overlay.webContents.send("bito:spotlight", {
      guide: {
        text: session.guide.text,
        phase: session.guide.phase,
        hint:
          session.guide.explanation && session.guide.phase !== "thinking"
            ? `${session.guide.explanation.index + 1}/${session.guide.explanation.stops.length} · Klik Bito untuk ${session.guide.explanation.index + 1 === session.guide.explanation.stops.length ? "selesai" : "lanjut"} · Esc keluar`
            : undefined,
        anchor: { ...anchor, x: anchor.x - frame.x, y: anchor.y - frame.y },
      },
    });
  }
  private async finishGuide(session: Session, text: string) {
    this.assertSession(session);
    clearTimeout(this.watch);
    clearTimeout(session.timer);
    session.guide!.gate = undefined;
    session.unsubscribe?.();
    session.unsubscribe = undefined;
    session.guide!.explanation = undefined;
    session.guide!.text = text;
    // Escape dismisses the final bubble.
    this.claimEscape();
    await this.ensureOverlay();
    this.assertSession(session);
    const display = screen.getDisplayMatching(
      this.options.pet()?.getBounds() || session.window!.bounds,
    );
    this.overlay!.setBounds(display.bounds);
    this.overlay!.webContents.send("bito:spotlight", {
      visible: false,
      reducedMotion: this.options.reducedMotion(),
    });
    this.guidePhase(session, "talking");
    this.guideBubble(session);
    this.recordGuideAnswer(session, text);
    this.overlay!.showInactive();
    this.endAfter(session, Math.max(6500, Math.min(14000, text.length * 55)));
  }
  private scheduleGuide(session: Session, immediate = false) {
    clearTimeout(this.watch);
    this.watch = setTimeout(
      () => {
        void this.watchGuide(session)
          .catch(async (error) => {
            if (this.active === session && !session.controller.signal.aborted)
              await this.finishGuide(
                session,
                error instanceof ScreenHelpError
                  ? error.message
                  : screenFailureText(error),
              );
          })
          .catch(() => {
            if (this.active === session)
              this.cancel("Sorotan belum siap. Coba lagi, ya.");
          });
      },
      this.options.watchInterval ??
        (immediate ? 45 : session.guide?.gate?.settling ? 120 : 650),
    );
    this.watch.unref();
  }
  private async watchGuide(session: Session) {
    if (this.active !== session || session.controller.signal.aborted) return;
    if (!this.options.enabled()) {
      this.cancel();
      return;
    }
    const guide = session.guide!;
    if (!guide.gate || session.watching) return;
    if (
      Date.now() - guide.at > 15 * 60 * 1000 ||
      guide.context.step >= 40 ||
      guide.checks >= 80
    ) {
      await this.finishGuide(
        session,
        "Kita jeda dulu di sini. Klik aku kalau mau melanjutkan.",
      );
      return;
    }
    session.watching = true;
    try {
      const window = await this.current();
      this.assertSession(session);
      const view =
        window?.pid === session.window!.pid ? await this.observe(window) : null;
      this.assertSession(session);
      if (
        !window ||
        window.pid !== session.window!.pid ||
        (view && view.frontPid !== window.pid)
      ) {
        if (!guide.paused) {
          this.pauseGuide(session);
        }
        return;
      }
      const display = screen.getDisplayMatching(window.bounds);
      if (!view) {
        await this.finishGuide(
          session,
          "Aku belum bisa mengikuti perubahan aplikasi ini. Klik aku untuk lanjut ngobrol, ya.",
        );
        return;
      }
      if (view.activity !== guide.activity) {
        guide.activity = view.activity;
        guide.followUpLeft = 1;
        guide.recoveryLeft = 1;
      }
      if (!this.matches(session.window!, window))
        this.overlay?.webContents.send("bito:spotlight", { visible: false });
      if (!guide.gate.needsCapture(view, Date.now()) && !guide.paused) return;
      // Remove the old target immediately on interaction, before menus move.
      this.overlay?.webContents.send("bito:spotlight", { visible: false });
      const captured = await this.capture(
        window,
        display,
        session.controller.signal,
        guide.captureKind,
      );
      this.assertSession(session);
      const pixels = this.fingerprint(captured.image);
      if (guide.paused) {
        // Preserve the pre-switch baseline: returning may also be the click
        // that opened a menu. Verify that change instead of discarding it.
        guide.paused = false;
        session.window = window;
        guide.text =
          guide.context.previous?.instruction || "Lanjutkan langkah tadi, ya.";
        this.guidePhase(session, "waiting");
        if (
          guide.gate.unchanged(view, pixels, captured.bounds) &&
          session.target
        ) {
          await this.show(
            session,
            session.target,
            guide.context.previous?.label || "",
            display.bounds,
            display.workArea,
          );
        }
        this.guideBubble(session);
        guide.gate.continueTransition(Date.now());
        return;
      }
      if (!guide.gate.sample(view, pixels, Date.now(), captured.bounds)) return;
      clearTimeout(session.timer);
      this.claimEscape();
      this.guidePhase(session, "thinking");
      guide.text = "Sebentar, aku cek…";
      this.guideBubble(session);
      const started = performance.now();
      const observation = {
        window,
        view,
        frame: captured.bounds,
        pixels,
        context: structuredClone(guide.context),
        style: guide.style,
      };
      let result =
        resolveMenuContinuation(
          guide.nextMenu,
          window,
          view,
          captured.bounds,
        ) || guide.cache.get(observation);
      const source = result ? "local" : "model";
      if (!result) {
        const input = this.guideInput(session, window, captured, view);
        try {
          guide.checks++;
          result = await this.timings.measure("model", () =>
            guide.generate(
              input,
              AbortSignal.any([
                session.controller.signal,
                AbortSignal.timeout(45000),
              ]),
            ),
          );
        } finally {
          input.image.data = "";
        }
      }
      this.timings.record("decision", started, source);
      this.assertSession(session);
      const current = await this.current();
      this.assertSession(session);
      if (!this.matches(window, current)) {
        this.pauseGuide(session);
        // Retain the input baseline for verification when focus returns.
        guide.gate = new GuideObservationGate(view, pixels, captured.bounds);
        return;
      }
      const freshView = await this.observe(window);
      const fresh = await this.capture(
        window,
        display,
        session.controller.signal,
        captured.kind,
      );
      this.assertSession(session);
      if (!freshView || freshView.frontPid !== window.pid) {
        this.pauseGuide(session);
        guide.gate = new GuideObservationGate(view, pixels, captured.bounds);
        return;
      }
      if (
        freshView.activity !== view.activity ||
        interfaceSignature(view) !== interfaceSignature(freshView) ||
        !sameScreenRect(captured.bounds, fresh.bounds) ||
        guideImageChanged(pixels, this.fingerprint(fresh.image))
      ) {
        // Discard stale coordinates, then allow one settled re-observation.
        // A menu finishing its animation must not require another click.
        guide.gate = new GuideObservationGate(view, pixels, captured.bounds);
        if (guide.recoveryLeft > 0) {
          guide.recoveryLeft--;
          guide.gate.continueTransition(Date.now());
        }
        guide.text =
          guide.recoveryLeft > 0
            ? "Tampilannya berubah. Aku cek setelah berhenti bergerak, ya."
            : "Tampilannya berubah. Aku tunggu tampilan stabil atau klik berikutnya, ya.";
        this.guidePhase(session, "waiting");
        this.guideBubble(session);
        return;
      }
      if (source === "model") guide.cache.put(observation, result);
      const decision = result.guide;
      if (
        !decision ||
        !["waiting", "advanced", "done", "blocked"].includes(
          decision.progress,
        ) ||
        (["advanced", "done"].includes(decision.progress) &&
          (!decision.evidence.trim() || result.confidence < 0.9))
      ) {
        await this.finishGuide(
          session,
          "Aku belum yakin langkah tadi sudah selesai. Klik aku untuk memperjelas, ya.",
        );
        return;
      }
      if (decision.progress === "waiting" && guide.context.previous)
        result.answer = guide.context.previous.instruction;
      let target = resolveGroundingTarget(
        result,
        captured.bounds,
        view.elements,
      );
      if (target && !containsScreenRect(display.bounds, target)) target = null;
      result = this.validateTarget(result, target);
      let highlighted = false;
      guide.text = result.answer;
      session.window = window;
      if (target && containsScreenRect(display.bounds, target)) {
        await this.show(
          session,
          target,
          result.label,
          display.bounds,
          display.workArea,
        );
        highlighted = true;
      }
      await this.acceptGuideResult(
        session,
        result,
        fresh,
        freshView,
        highlighted,
      );
    } finally {
      session.watching = false;
      const wake = !!session.wakeRequested;
      session.wakeRequested = false;
      if (
        this.active === session &&
        !session.controller.signal.aborted &&
        guide.gate
      )
        this.scheduleGuide(session, wake);
    }
  }
  private async ensureOverlay() {
    if (this.overlay && !this.overlay.isDestroyed()) return this.overlayLoaded;
    const win = (this.overlay = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      transparent: true,
      backgroundColor: "#00000000",
      frame: false,
      hasShadow: false,
      resizable: false,
      focusable: false,
      skipTaskbar: true,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: join(this.options.directory, "spotlight-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // The first target is painted before showing this window. Hidden
        // renderer rAF must run so the paint acknowledgement cannot deadlock.
        backgroundThrottling: false,
      },
    }));
    win.setIgnoreMouseEvents(true, { forward: true });
    if (process.platform === "win32") {
      this.protectedWindows.set(win, false);
      win.setContentProtection(true);
    }
    win.setAlwaysOnTop(true, "floating");
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event) => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_w, _p, callback) =>
      callback(false),
    );
    const ready = this.overlaySignal(win, "bito:spotlight-ready");
    const loaded = this.options.dev
      ? win.loadURL(`${this.options.dev}/spotlight.html`)
      : win.loadFile(join(this.options.directory, "../dist/spotlight.html"));
    this.overlayLoaded = Promise.all([loaded, ready])
      .then(() => {})
      .catch((error) => {
        if (this.overlay === win) {
          this.overlay = undefined;
          this.overlayLoaded = undefined;
          if (!win.isDestroyed()) win.destroy();
        }
        throw error;
      });
    await this.overlayLoaded;
  }
  private overlaySignal(win: BrowserWindow, channel: string) {
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        ipcMain.removeListener(channel, listener);
        error ? reject(error) : resolve();
      };
      const listener = (event: Electron.IpcMainEvent) => {
        if (
          event.sender.id === win.webContents.id &&
          event.senderFrame === event.sender.mainFrame
        )
          finish();
      };
      const timer = setTimeout(
        () =>
          finish(
            new ScreenHelpError("Sorotan belum siap. Coba lagi sebentar, ya."),
          ),
        5000,
      );
      ipcMain.on(channel, listener);
    });
  }
  private async show(
    session: Session,
    target: ScreenRect,
    label: string,
    bounds: ScreenRect,
    workArea: ScreenRect,
  ) {
    const paintStart = performance.now();
    await this.ensureOverlay();
    this.assertSession(session);
    const overlay = this.overlay!;
    session.target = target;
    overlay.setBounds(bounds);
    const painted = this.overlaySignal(overlay, "bito:spotlight-painted");
    overlay.webContents.send("bito:spotlight", {
      target: { ...target, x: target.x - bounds.x, y: target.y - bounds.y },
      label,
      visible: false,
      reducedMotion: this.options.reducedMotion(),
    });
    await painted;
    this.assertSession(session);
    overlay.showInactive();
    overlay.webContents.send("bito:spotlight", { visible: true });
    this.timings.record("highlight", paintStart);
    const pet = this.options.pet();
    if (!pet || pet.isDestroyed()) return;
    session.origin ||= pet.getBounds();
    pet.setAlwaysOnTop(true, "floating", 1);
    this.options.chat()?.setAlwaysOnTop(true, "floating", 1);
    pet.moveTop();
    this.options.chat()?.moveTop();
    void this.move(
      pet.getBounds(),
      besideTarget(
        target,
        pet.getBounds(),
        workArea,
        session.guide
          ? (position) => [placeGuideBubble(position, workArea, target)]
          : this.options.accompanying,
      ),
      session,
    );
  }
  private move(
    from: ScreenRect,
    to: ScreenRect,
    session: Session,
  ): Promise<void> {
    this.finishMotion?.();
    if (sameScreenRect(from, to, 0)) return Promise.resolve();
    const started = performance.now(),
      duration = this.options.reducedMotion() ? 0 : 620;
    return new Promise((resolve) => {
      const done = () => {
        clearInterval(this.motion);
        this.motion = undefined;
        this.finishMotion = undefined;
        resolve();
      };
      this.finishMotion = done;
      const frame = () => {
        const pet = this.options.pet();
        if (!pet || pet.isDestroyed() || this.active !== session) {
          done();
          return;
        }
        const t = duration
          ? Math.min(1, (performance.now() - started) / duration)
          : 1;
        const ease = t * t * t * (t * (6 * t - 15) + 10);
        pet.setPosition(
          Math.round(from.x + (to.x - from.x) * ease),
          Math.round(from.y + (to.y - from.y) * ease),
        );
        if (
          session.guide &&
          !session.returning &&
          !session.controller.signal.aborted
        )
          this.guideBubble(session);
        this.options.onMove();
        if (t >= 1) done();
      };
      this.motion = setInterval(frame, 1000 / 60);
      frame();
    });
  }
  cancel(reason?: string, returnPet = true) {
    const session = this.active;
    if (!session || (session.returning && returnPet)) return;
    this.finishMotion?.();
    session.reason = reason;
    session.unsubscribe?.();
    session.unsubscribe = undefined;
    session.controller.abort();
    if (session.petFocus && !session.petFocus.window.isDestroyed())
      session.petFocus.window.setFocusable(session.petFocus.focusable);
    this.options.guideState?.(undefined);
    for (const [win, previous] of this.protectedWindows) {
      if (!win.isDestroyed()) win.setContentProtection(previous);
    }
    this.protectedWindows.clear();
    clearTimeout(session.timer);
    clearTimeout(this.watch);
    this.releaseEscape();
    this.overlay?.webContents.send("bito:spotlight", {
      visible: false,
      guide: null,
    });
    const overlay = this.overlay;
    setTimeout(() => {
      if (
        (this.active === session || !this.active) &&
        overlay &&
        !overlay.isDestroyed()
      )
        overlay.hide();
    }, 230);
    const pet = this.options.pet();
    if (returnPet && session.origin && pet && !pet.isDestroyed()) {
      session.returning = true;
      void this.move(pet.getBounds(), session.origin, session).then(() => {
        if (this.active !== session) return;
        this.active = undefined;
        this.options.restoreLevel();
      });
    } else {
      this.active = undefined;
      this.options.restoreLevel();
    }
  }
  close() {
    this.cancel(undefined, false);
    clearTimeout(this.watch);
    clearInterval(this.motion);
    this.context.close();
    this.overlay?.destroy();
    this.overlay = undefined;
  }
}
