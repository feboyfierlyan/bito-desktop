import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { z } from "zod";
import type { ScreenRect, ScreenElement } from "../src/grounding";

export type ExternalWindow = {
  id: string;
  pid: number;
  app: string;
  title: string;
  bounds: ScreenRect;
};
const schema = z.object({
  id: z.string().regex(/^\d+$/),
  pid: z.number().int().positive(),
  app: z.string().max(200),
  title: z.string().max(4000),
  bounds: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().min(100).max(20000),
    height: z.number().min(70).max(20000),
  }),
});
export type InterfaceObservation = {
  frontPid: number;
  activity: string;
  accessible: boolean;
  elements: ScreenElement[];
};
/** Serial, read-only helper. AX/UIA is inspected only during a guide; editable
 * values, password fields and screenshots are never persisted. */
export class ScreenContext {
  private child?: ChildProcessWithoutNullStreams;
  private subscription?: { pid: number; token: number; changed: () => void };
  private nextToken = 0;
  private generation = 0;
  private shortcut?: { token: number; pressed: () => void };
  private shortcutRetry?: ReturnType<typeof setTimeout>;
  watchAreaShortcut(pressed: () => void): () => void {
    const token = ++this.nextToken;
    this.shortcut = { token, pressed };
    clearTimeout(this.shortcutRetry);
    this.shortcutRetry = undefined;
    this.armShortcut(token);
    return () => {
      if (this.shortcut?.token === token) {
        this.shortcut = undefined;
        clearTimeout(this.shortcutRetry);
        this.shortcutRetry = undefined;
      }
      void this.request(`stop-area-shortcut:${token}`).catch(() => {});
    };
  }
  private armShortcut(token: number) {
    if (this.shortcut?.token !== token) return;
    void this.request(`area-shortcut:${token}`)
      .then((result) => {
        if (this.shortcut?.token === token && result !== true)
          this.retryShortcut(token);
      })
      .catch(() => this.retryShortcut(token));
  }
  private retryShortcut(token: number) {
    if (this.shortcut?.token !== token || this.shortcutRetry) return;
    this.shortcutRetry = setTimeout(() => {
      this.shortcutRetry = undefined;
      this.armShortcut(token);
    }, 1000);
    this.shortcutRetry.unref();
  }
  async captureSelection(displayId: number) {
    if (process.platform !== "darwin" || !Number.isSafeInteger(displayId))
      return null;
    const raw = await this.request(`capture-selection:${displayId}`);
    const parsed = z
      .object({
        data: z
          .string()
          .max(20000000)
          .regex(/^\/9j\/[A-Za-z0-9+/]*={0,2}$/),
        width: z.number().int().min(100).max(3600),
        height: z.number().int().min(70).max(3600),
        bounds: schema.shape.bounds,
      })
      .safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
  /** Notifications carry no UI text or pixels. Older/platform helpers safely
   * return null and the controller retains its polling fallback. */
  subscribe(pid: number, changed: () => void): () => void {
    const token = ++this.nextToken;
    this.subscription = { pid, token, changed };
    void this.request(`watch:${pid}:${token}`).catch(() => {});
    return () => {
      if (this.subscription?.token === token) this.subscription = undefined;
      void this.request(`unwatch:${token}`).catch(() => {});
    };
  }
  private pending?: {
    resolve: (v: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  private queue: Promise<unknown> = Promise.resolve();
  private reading?: Promise<ExternalWindow | null>;
  constructor(private directory: string) {}
  read(): Promise<ExternalWindow | null> {
    if (this.reading) return this.reading;
    this.reading = this.request("read")
      .then((raw) => {
        const parsed = schema.safeParse(raw);
        return parsed.success ? parsed.data : null;
      })
      .finally(() => {
        this.reading = undefined;
      });
    return this.reading;
  }
  async capture(displayId: number) {
    if (process.platform !== "darwin" || !Number.isSafeInteger(displayId))
      return null;
    const raw = await this.request(`capture:${displayId}`);
    const parsed = z
      .object({
        data: z
          .string()
          .max(5000000)
          .regex(/^\/9j\/[A-Za-z0-9+/]*={0,2}$/),
        width: z.number().int().min(100).max(2000),
        height: z.number().int().min(70).max(2000),
        bounds: schema.shape.bounds,
      })
      .safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
  async observe(pid: number): Promise<InterfaceObservation | null> {
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid)
      return null;
    const raw = await this.request(`observe:${pid}`);
    const result = z
      .object({
        frontPid: z.number().int().nonnegative(),
        activity: z.string().max(100),
        accessible: z.boolean(),
        elements: z
          .array(
            z.object({
              id: z.string().max(80),
              role: z.string().max(100),
              name: z.string().max(250),
              enabled: z.boolean(),
              hitVerified: z.boolean().optional(),
              bounds: z.object({
                x: z.number().finite(),
                y: z.number().finite(),
                width: z.number().positive().max(20000),
                height: z.number().positive().max(20000),
              }),
            }),
          )
          .max(180),
      })
      .safeParse(raw);
    return result.success ? result.data : null;
  }
  async activate(pid: number): Promise<boolean> {
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid)
      return false;
    return (await this.request(`activate:${pid}`)) === true;
  }
  async accessibility(prompt = false): Promise<boolean> {
    if (process.platform !== "darwin") return true;
    return (
      (await this.request(
        prompt ? "request-accessibility" : "accessibility",
      )) === true
    );
  }
  private request(command: string): Promise<unknown> {
    const generation = this.generation;
    const next = this.queue.then(() =>
      generation === this.generation ? this.readOne(command) : null,
    );
    this.queue = next.catch(() => null);
    return next;
  }
  private readOne(command: string): Promise<unknown> {
    if (!["darwin", "win32"].includes(process.platform))
      return Promise.resolve(null);
    if (!this.child) {
      this.child =
        process.platform === "darwin"
          ? spawn(
              join(this.directory, "screen-context"),
              [String(process.pid)],
              { stdio: "pipe" },
            )
          : spawn(
              "powershell.exe",
              [
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                join(this.directory, "screen-context.ps1"),
                String(process.pid),
              ],
              { windowsHide: true, stdio: "pipe" },
            );
      const child = this.child;
      createInterface({ input: child.stdout }).on("line", (line) => {
        if (this.child !== child) return;
        let value: unknown;
        try {
          value = JSON.parse(line);
        } catch {
          value = null;
        }
        if (value && typeof value === "object" && "event" in value) {
          const event = value as {
            event: string;
            pid?: number;
            token?: number;
          };
          if (
            event.event === "area-shortcut" &&
            event.token === this.shortcut?.token
          )
            this.shortcut?.pressed();
          const sub = this.subscription;
          if (
            event.event === "interface-changed" &&
            sub &&
            event.pid === sub.pid &&
            event.token === sub.token
          )
            sub.changed();
          return; // Unsolicited events never consume a pending RPC response.
        }
        if (!this.pending) return;
        const { resolve, timer } = this.pending;
        this.pending = undefined;
        clearTimeout(timer);
        resolve(value);
      });
      child.stderr.resume(); // No window titles, pixels or helper details in logs.
      child.stdin.on("error", () => {
        if (this.child === child) this.disconnect();
      });
      child.on("error", () => {
        if (this.child === child) this.disconnect();
      });
      child.on("exit", () => {
        if (this.child === child) this.disconnect();
      });
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.disconnect();
        resolve(null);
      }, 9000);
      this.pending = { resolve, timer };
      this.child!.stdin.write(command + "\n");
    });
  }
  close() {
    this.shortcut = undefined;
    clearTimeout(this.shortcutRetry);
    this.shortcutRetry = undefined;
    this.disconnect();
  }
  private disconnect() {
    this.generation++;
    this.subscription = undefined;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve(null);
      this.pending = undefined;
    }
    const child = this.child;
    this.child = undefined;
    child?.kill();
    if (this.shortcut) this.retryShortcut(this.shortcut.token);
  }
}
