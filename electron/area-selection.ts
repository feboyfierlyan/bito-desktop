import {
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  systemPreferences,
  type NativeImage,
  type Display,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ScreenContext } from "./screen-context";
import {
  cropPixels,
  validSelection,
  type AreaFrame,
} from "../src/area-selection";
import type { ScreenRect } from "../src/grounding";
import type { AreaImage } from "./selected-area-context";
import { setTimeout as delay } from "node:timers/promises";
type Session = {
  id: string;
  owner: string;
  display: Display;
  controller: AbortController;
  image?: NativeImage;
  painted: boolean;
  submitting: boolean;
  timer?: ReturnType<typeof setTimeout>;
};
type Options = {
  directory: string;
  dev?: string;
  owner: () => string;
  enabled: () => boolean;
  reducedMotion: () => boolean;
  beforeCapture: () => void;
  submitted: (question: string, image: AreaImage, id: string) => void;
  canSubmit: () => string | undefined;
  failed: (text: string) => void;
};
/** Trusted main-process capture + crop, isolated from both the app command
 * bridge and the selection renderer. Screenshot leaves this process only as
 * frozen display pixels to our own sandboxed view, then as the selected crop. */
export class AreaSelection {
  get active() {
    return !!this.session || !!this.fading;
  }
  private window?: BrowserWindow;
  private ready = false;
  private loading?: Promise<void>;
  private session?: Session;
  private context: ScreenContext;
  private disposeShortcut?: () => void;
  private accelerators: string[] = [];
  private escapeOwned = false;
  private closed = false;
  private fading?: Promise<void>;
  private handlers: { event: string; fn: (...args: any[]) => any }[] = [];
  constructor(private options: Options) {
    this.context = new ScreenContext(join(options.directory, "native"));
  }
  install() {
    const listen = (event: string, fn: (...args: any[]) => void) => {
      ipcMain.on(event, fn);
      this.handlers.push({ event, fn });
    };
    listen("bito:area-ready", (event: IpcMainEvent) => {
      if (this.owns(event)) {
        this.ready = true;
      }
    });
    listen("bito:area-painted", (event: IpcMainEvent, id: unknown) => {
      const s = this.session;
      if (
        !this.owns(event) ||
        typeof id !== "string" ||
        !s ||
        id !== s.id ||
        !this.valid(s) ||
        !s.image ||
        s.painted
      )
        return;
      s.painted = true;
      this.window!.show();
      this.window!.focus();
    });
    listen("bito:area-cancel", (event: IpcMainEvent, id: unknown) => {
      if (this.owns(event) && id === this.session?.id) void this.cancel();
    });
    ipcMain.handle("bito:area-submit", (event, payload) =>
      this.submit(event, payload),
    );
    // Never claim Option/Alt+Space: it commonly belongs to ChatGPT or the OS.
    // macOS Fn + left Control is handled by the native modifier watcher.
    const candidates = ["CommandOrControl+Shift+2"];
    for (const key of candidates) {
      if (globalShortcut.register(key, () => void this.start())) {
        this.accelerators.push(key);
        break;
      }
    }
    if (process.platform === "darwin")
      this.disposeShortcut = this.context.watchAreaShortcut(
        () => void this.start(),
      );
    void this.ensureWindow().catch(() => {}); // Warm the tiny view, never a screenshot.
  }
  get shortcut() {
    return this.accelerators[0];
  }
  private owns(event: IpcMainEvent | IpcMainInvokeEvent) {
    return (
      !this.closed &&
      !!this.window &&
      !this.window.isDestroyed() &&
      event.sender === this.window.webContents &&
      event.senderFrame === event.sender.mainFrame
    );
  }
  private valid(s: Session) {
    return (
      this.session === s &&
      !s.controller.signal.aborted &&
      !this.closed &&
      this.options.enabled() &&
      s.owner === this.options.owner()
    );
  }
  private async ensureWindow() {
    if (this.window && !this.window.isDestroyed() && this.ready) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const win = new BrowserWindow({
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        hasShadow: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        acceptFirstMouse: true,
        enableLargerThanScreen: true,
        webPreferences: {
          preload: join(this.options.directory, "area-preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
          webSecurity: true,
        },
      });
      this.window = win;
      this.ready = false;
      win.setAlwaysOnTop(true, "screen-saver");
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e) => e.preventDefault());
      win.on("blur", () => {
        if (this.session?.painted && !this.session.submitting)
          void this.cancel();
      });
      win.on("closed", () => {
        if (this.window === win) {
          this.window = undefined;
          this.ready = false;
          this.release();
        }
      });
      if (this.options.dev) await win.loadURL(`${this.options.dev}/area.html`);
      else
        await win.loadFile(join(this.options.directory, "../dist/area.html"));
      for (
        let i = 0;
        i < 100 && !this.ready && !win.isDestroyed() && !this.closed;
        i++
      )
        await delay(30);
      if (!this.ready || win.isDestroyed() || this.closed)
        throw Error("area_view_unavailable");
    })().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }
  async start() {
    if (this.closed) return;
    if (this.session) {
      await this.cancel();
      return;
    }
    if (!this.options.enabled()) return;
    const display = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    );
    const s: Session = {
      id: randomUUID(),
      owner: this.options.owner(),
      display,
      controller: new AbortController(),
      painted: false,
      submitting: false,
    };
    this.session = s;
    try {
      this.options.beforeCapture();
      // Escape is global only while selecting. Existing guide owns it until
      // beforeCapture cancels that guide.
      this.escapeOwned = globalShortcut.register(
        "Escape",
        () => void this.cancel(),
      );
      await this.ensureWindow();
      await this.fading;
      if (!this.valid(s)) return;
      s.image = await this.capture(display, s.controller.signal);
      if (!this.valid(s)) return;
      this.window!.setBounds(display.bounds, false);
      const frame: AreaFrame = {
        session: s.id,
        image: s.image.toDataURL(),
        width: display.bounds.width,
        height: display.bounds.height,
        reducedMotion: this.options.reducedMotion(),
      };
      this.window!.webContents.send("bito:area-frame", frame);
      // Never show an unpainted native window (black flash), or wait forever.
      s.timer = setTimeout(() => {
        if (!s.painted) {
          this.options.failed("Pilihan layar belum siap. Coba lagi, ya.");
          void this.cancel();
        }
      }, 6000);
      const paintTimer = s.timer;
      const lifetime = setTimeout(() => void this.cancel(), 5 * 60_000);
      s.controller.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(paintTimer);
          clearTimeout(lifetime);
        },
        { once: true },
      );
    } catch (error) {
      if (this.valid(s))
        this.options.failed(
          error instanceof Error && error.message === "screen_permission"
            ? "Izinkan Perekaman Layar untuk Bito di System Settings → Privacy & Security, lalu buka ulang Bito."
            : "Layar belum bisa diambil. Periksa izin Perekaman Layar, lalu coba lagi.",
        );
      if (this.session === s) await this.cancel();
    }
  }
  private async capture(
    display: Display,
    signal: AbortSignal,
  ): Promise<NativeImage> {
    if (process.platform === "darwin") {
      const permission = systemPreferences.getMediaAccessStatus("screen");
      if (permission === "denied" || permission === "restricted")
        throw Error("screen_permission");
      const result = await this.context.captureSelection(display.id);
      signal.throwIfAborted();
      if (result) {
        if (
          Math.abs(result.bounds.x - display.bounds.x) > 1 ||
          Math.abs(result.bounds.y - display.bounds.y) > 1 ||
          Math.abs(result.bounds.width - display.bounds.width) > 1 ||
          Math.abs(result.bounds.height - display.bounds.height) > 1
        )
          throw Error("display_changed");
        const image = nativeImage.createFromBuffer(
          Buffer.from(result.data, "base64"),
        );
        if (!image.isEmpty()) return image;
      }
    }
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.min(
          3600,
          Math.round(display.bounds.width * display.scaleFactor),
        ),
        height: Math.min(
          3600,
          Math.round(display.bounds.height * display.scaleFactor),
        ),
      },
    });
    signal.throwIfAborted();
    const source = sources.find((v) => v.display_id === String(display.id));
    if (!source || source.thumbnail.isEmpty()) throw Error("capture_failed");
    // JPEG normalizes the NativeImage to a single 1x bitmap representation;
    // Electron 45 crop() uses DIP of that representation.
    return nativeImage.createFromBuffer(source.thumbnail.toJPEG(92));
  }
  private async submit(event: IpcMainInvokeEvent, raw: unknown) {
    const s = this.session;
    if (
      !this.owns(event) ||
      !s ||
      !this.valid(s) ||
      !s.painted ||
      s.submitting ||
      !s.image
    )
      return { ok: false, error: "Pilihan area sudah berakhir." };
    if (!raw || typeof raw !== "object")
      return { ok: false, error: "Pilih area terlebih dahulu." };
    const p = raw as { session?: unknown; rect?: unknown; question?: unknown };
    if (
      p.session !== s.id ||
      !validSelection(p.rect, s.display.bounds) ||
      typeof p.question !== "string" ||
      p.question.length > 4000
    )
      return { ok: false, error: "Pilih area dan tulis pertanyaan." };
    const blocked = this.options.canSubmit();
    if (blocked) return { ok: false, error: blocked };
    s.submitting = true;
    try {
      let image = s.image.crop(
        cropPixels(p.rect, s.display.bounds, s.image.getSize()),
      );
      const size = image.getSize();
      // Bound the upload, preserving aspect ratio. Tiny crops may be upscaled
      // for the vision API minimum; missing detail is never invented.
      const factor = Math.min(
        1800 / Math.max(size.width, size.height),
        Math.max(1, 100 / size.width, 70 / size.height),
      );
      if (factor !== 1)
        image = image.resize({
          width: Math.max(1, Math.round(size.width * factor)),
          height: Math.max(1, Math.round(size.height * factor)),
          quality: "best",
        });
      let bytes = image.toJPEG(88);
      for (const quality of [74, 60, 45]) {
        if (bytes.length <= 1_300_000) break;
        bytes = image.toJPEG(quality);
      }
      if (bytes.length > 1_300_000) throw Error("image_too_large");
      const dimensions = image.getSize();
      if (dimensions.width < 100 || dimensions.height < 70)
        throw Error("selection_too_thin");
      const crop: AreaImage = {
        mimeType: "image/jpeg",
        data: bytes.toString("base64"),
        ...dimensions,
      };
      const question = p.question.trim();
      // Only our crop survives closing. Discard the full display immediately.
      s.image = undefined;
      await this.cancel();
      if (
        this.closed ||
        this.session ||
        s.owner !== this.options.owner() ||
        !this.options.enabled()
      )
        return { ok: false, error: "Sesi sudah berakhir." };
      this.options.submitted(question, crop, s.id);
      return { ok: true };
    } catch {
      if (this.session === s) s.submitting = false;
      return {
        ok: false,
        error:
          "Area ini terlalu tipis atau besar. Pilih ulang area yang lebih jelas.",
      };
    }
  }
  private release() {
    const s = this.session;
    this.session = undefined;
    s?.controller.abort();
    if (s) s.image = undefined;
    if (this.escapeOwned) {
      globalShortcut.unregister("Escape");
      this.escapeOwned = false;
    }
  }
  async cancel() {
    const win = this.window,
      s = this.session;
    if (!s) return;
    this.release();
    if (win && !win.isDestroyed()) {
      win.webContents.send("bito:area-close");
      const fading =
        s.painted && !this.options.reducedMotion()
          ? delay(160)
          : Promise.resolve();
      this.fading = fading;
      await fading;
      if (this.fading === fading) this.fading = undefined;
      if ((!this.session || !this.session.painted) && !win.isDestroyed())
        win.hide();
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.release();
    this.disposeShortcut?.();
    this.context.close();
    for (const key of this.accelerators) globalShortcut.unregister(key);
    for (const { event, fn } of this.handlers)
      ipcMain.removeListener(event, fn);
    ipcMain.removeHandler("bito:area-submit");
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
  }
}
