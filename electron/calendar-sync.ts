import { createHash } from "node:crypto";
import type { SupportedStorage } from "@supabase/supabase-js";
import { z } from "zod";
import {
  automaticCalendarEntries,
  calendarEvent,
  type CalendarConnection,
  type CalendarEntry,
  type CalendarResult,
} from "../src/calendar";
import type { Project } from "../src/projects";

const recordSchema = z.object({
  projectId: z.string(),
  entryId: z.string(),
  incarnation: z.number().int().min(0),
  fingerprint: z.string().nullable(),
  deleted: z.boolean(),
});
const documentSchema = z.object({
  automatic: z.boolean(),
  lastSyncedAt: z.number().optional(),
  records: z.record(z.string(), recordSchema),
});
type Document = z.infer<typeof documentSchema>;
type RecordEntry = z.infer<typeof recordSchema>;
type Item = { projectId: string; entry: CalendarEntry; fingerprint: string };
type Driver = {
  view: CalendarConnection;
  send(
    projectId: string,
    entries: CalendarEntry[],
    current: () => boolean,
  ): Promise<CalendarResult[]>;
  remove(
    projectId: string,
    entryId: string,
    current: () => boolean,
  ): Promise<void>;
};
const key = (projectId: string, entryId: string) =>
  JSON.stringify([projectId, entryId]);
const remoteId = (r: RecordEntry) =>
  r.incarnation ? `${r.entryId}:sync:${r.incarnation}` : r.entryId;
const digest = (entry: CalendarEntry) =>
  createHash("sha256")
    .update(JSON.stringify(calendarEvent(entry)))
    .digest("hex");
const empty = (): Document => ({ automatic: false, records: {} });

/** One serialized, durable outbox per signed-in Bito account. No model calls. */
export class CalendarSync {
  view: Pick<
    CalendarConnection,
    "automatic" | "syncStatus" | "syncError" | "lastSyncedAt"
  > = { automatic: false, syncStatus: "idle" };
  onChange = () => {};
  private owner: string | null = null;
  private document = empty();
  private epoch = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private again = false;
  private signature = "";
  private failures = 0;
  private closed = false;
  private paused = false;
  private loadFailed = false;
  private heartbeat: ReturnType<typeof setInterval>;
  constructor(
    private driver: Driver,
    private storage: SupportedStorage,
    private projects: () => Project[],
    private ready: () => boolean = () => true,
    private debounceMs = 650,
  ) {
    this.heartbeat = setInterval(() => this.request(true), 60000);
    this.heartbeat.unref?.();
  }
  private emit(update: Partial<CalendarSync["view"]>) {
    this.view = { ...this.view, ...update };
    this.onChange();
  }
  private save(owner: string, document: Document) {
    return this.storage.setItem(
      `calendar-sync:${owner}`,
      JSON.stringify(document),
    );
  }
  async setOwner(owner: string | null) {
    this.epoch++;
    clearTimeout(this.timer);
    this.again = false;
    await this.running?.catch(() => {});
    this.owner = owner;
    this.signature = "";
    this.failures = 0;
    this.document = empty();
    this.loadFailed = false;
    this.view = { automatic: false, syncStatus: "idle" };
    if (owner) {
      try {
        const raw = await this.storage.getItem(`calendar-sync:${owner}`);
        if (raw) this.document = documentSchema.parse(JSON.parse(raw));
        this.view.automatic = this.document.automatic;
        this.view.lastSyncedAt = this.document.lastSyncedAt;
      } catch {
        // Never discard an unreadable ownership ledger and risk orphaning events.
        this.loadFailed = true;
        this.view.syncStatus = "error";
        this.view.syncError =
          "Pengaturan Calendar belum bisa dibuka. Coba masuk ulang.";
      }
    }
    this.onChange();
  }
  async setAutomatic(automatic: boolean) {
    const owner = this.owner;
    if (!owner || this.loadFailed)
      throw Error("Masuk ulang untuk mengatur Calendar.");
    if (automatic && this.driver.view.status !== "connected")
      throw Error("Hubungkan Google Calendar terlebih dahulu.");
    const previous = this.document.automatic;
    this.document.automatic = automatic;
    try {
      await this.save(owner, this.document);
    } catch {
      this.document.automatic = previous;
      throw Error("Pengaturan Calendar belum tersimpan. Coba lagi.");
    }
    this.epoch++;
    clearTimeout(this.timer);
    this.emit({
      automatic,
      syncStatus: automatic ? "pending" : "idle",
      syncError: undefined,
    });
    if (automatic) this.request(true);
  }
  private desired() {
    const items = new Map<string, Item>(),
      frozen = new Set<string>();
    for (const project of this.projects()) {
      // Archiving is not deletion: leave historical calendar events in place.
      if (project.status === "archived") {
        frozen.add(project.id);
        continue;
      }
      for (const entry of automaticCalendarEntries(project))
        items.set(key(project.id, entry.id), {
          projectId: project.id,
          entry,
          fingerprint: digest(entry),
        });
    }
    return { items, frozen };
  }
  private allowed() {
    return (
      !this.closed &&
      !this.paused &&
      !this.loadFailed &&
      !!this.owner &&
      this.document.automatic &&
      this.ready()
    );
  }
  request(force = false) {
    if (!this.allowed()) return;
    const { items, frozen } = this.desired();
    const signature = JSON.stringify([
      [...items].map(([k, i]) => [k, i.fingerprint]),
      [...frozen],
    ]);
    const dirty =
      [...items].some(([k, item]) => {
        const r = this.document.records[k];
        return !r || r.deleted || r.fingerprint !== item.fingerprint;
      }) ||
      Object.entries(this.document.records).some(
        ([k, r]) => !r.deleted && !items.has(k) && !frozen.has(r.projectId),
      );
    if (
      force &&
      signature === this.signature &&
      this.view.syncStatus === "synced" &&
      !dirty
    )
      return;
    if (!force && signature === this.signature) return;
    this.signature = signature;
    if (this.driver.view.status !== "connected") {
      this.emit({ syncStatus: "pending", syncError: undefined });
      return;
    }
    if (this.running) {
      this.again = true;
      return;
    }
    clearTimeout(this.timer);
    this.emit({ syncStatus: "pending", syncError: undefined });
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
    this.timer.unref?.();
  }
  /** Also used by focused tests; callers never wait for this in the UI. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) {
      this.again = true;
      await this.running;
      return;
    }
    if (!this.allowed() || this.driver.view.status !== "connected") return;
    const owner = this.owner!,
      document = this.document,
      epoch = this.epoch;
    const current = () =>
      this.allowed() && this.owner === owner && this.epoch === epoch;
    this.emit({ syncStatus: "syncing", syncError: undefined });
    this.running = this.reconcile(owner, document, current)
      .then(() => {
        if (!current()) return;
        this.failures = 0;
        this.emit({
          syncStatus: "synced",
          syncError: undefined,
          lastSyncedAt: document.lastSyncedAt,
        });
      })
      .catch(() => {
        if (!current()) return;
        this.failures++;
        this.emit({
          syncStatus: "error",
          syncError:
            this.driver.view.status === "expired"
              ? "Hubungkan ulang Calendar untuk melanjutkan."
              : "Belum tersinkron. Perubahanmu aman dan akan dicoba lagi.",
        });
        if (this.driver.view.status === "connected") {
          const delay = [5000, 15000, 60000, 300000][
            Math.min(this.failures - 1, 3)
          ];
          this.timer = setTimeout(() => void this.flush(), delay);
          this.timer.unref?.();
        }
      })
      .finally(() => {
        this.running = undefined;
        if (this.again) {
          this.again = false;
          this.request(true);
        }
      });
    await this.running;
  }
  private async reconcile(
    owner: string,
    document: Document,
    current: () => boolean,
  ) {
    const initial = this.desired();
    for (const [k, record] of Object.entries(document.records)) {
      if (!current()) return;
      if (
        record.deleted ||
        initial.items.has(k) ||
        initial.frozen.has(record.projectId)
      )
        continue;
      const stillRemoved = () =>
        current() &&
        !this.desired().items.has(k) &&
        !this.desired().frozen.has(record.projectId);
      if (!stillRemoved()) continue;
      await this.driver.remove(
        record.projectId,
        remoteId(record),
        stillRemoved,
      );
      // Persist even after cancellation: the remote deletion has already happened.
      record.deleted = true;
      record.fingerprint = null;
      await this.save(owner, document);
    }
    for (const [k, item] of initial.items) {
      const stillDesired = () =>
        current() &&
        this.desired().items.get(k)?.fingerprint === item.fingerprint;
      if (!current()) return;
      if (!stillDesired()) {
        this.again = true;
        continue;
      }
      let record = document.records[k];
      if (record && !record.deleted && record.fingerprint === item.fingerprint)
        continue;
      if (!record)
        record = document.records[k] = {
          projectId: item.projectId,
          entryId: item.entry.id,
          incarnation: 0,
          fingerprint: null,
          deleted: false,
        };
      if (record.deleted) {
        // Google retains deleted event IDs. A new incarnation can be created safely.
        record.incarnation++;
        record.deleted = false;
        record.fingerprint = null;
      }
      // Record intent BEFORE HTTP: a lost response must still be recoverable/removable.
      await this.save(owner, document);
      if (!stillDesired()) {
        this.again = true;
        continue;
      }
      const results = await this.driver.send(
        item.projectId,
        [{ ...item.entry, id: remoteId(record) }],
        stillDesired,
      );
      if (results[0]?.recreate) {
        record.deleted = true;
        record.fingerprint = null;
        await this.save(owner, document);
        this.again = true;
        continue;
      }
      if (!results[0]?.ok) throw Error("Calendar write failed");
      record.fingerprint = item.fingerprint;
      await this.save(owner, document);
    }
    if (current()) {
      document.lastSyncedAt = Date.now();
      await this.save(owner, document);
    }
  }
  close() {
    this.closed = true;
    this.epoch++;
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
  }
  async pause() {
    this.paused = true;
    this.epoch++;
    this.again = false;
    clearTimeout(this.timer);
    await this.running;
  }
  resume() {
    this.paused = false;
    this.request(true);
  }
}
