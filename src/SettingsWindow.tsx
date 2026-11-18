import {
  BitoSegmentedControl as SegmentedControl,
  BitoSegmentedItem as SegmentedControlItem,
  BitoSwitch as AstryxSwitch,
  BitoCard as Card,
  BitoSlider as Slider,
} from "./ui/primitives";
import {
  BitoInput,
  BitoButton,
  BitoTextArea,
  BitoSelect,
} from "./ui/controls";
import { BitoMascot } from "./ui/BitoMascot";
import { version } from "../package.json";
import { bitoStyles } from "./bito-voice";
// @refresh reset
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  UserRound,
  Sprout,
  SlidersHorizontal,
  ChevronRight,
  ArrowLeft,
  Plus,
  X,
  Check,
  Download,
  Upload,
  Trash2,
  LoaderCircle,
  Bell,
  Pencil,
  Clock3,
  LifeBuoy,
  ExternalLink,
} from "lucide-react";
import { api } from "./bridge";
import { calendarSyncLabel } from "./calendar";
import { preferenceWriter } from "./preference-writer";
import { usePreferenceDraft } from "./use-preference-draft";
import type { Profile, Snapshot } from "./shared";
import "./SettingsWindow.css";

type Page = "you" | "bito" | "app" | "data" | "reminders";
const pages = [
  { id: "you", label: "Kamu", icon: UserRound },
  { id: "bito", label: "Bito", icon: Sprout },
  { id: "app", label: "Aplikasi", icon: SlidersHorizontal },
] as const;

const pageFor = (route: string): Page =>
  route === "reminders"
    ? "reminders"
    : route === "memory"
      ? "data"
      : ["personality", "desktop"].includes(route)
        ? "bito"
        : route === "ai"
          ? "app"
          : ["you", "bito", "app"].includes(
                localStorage.getItem("bito-settings-page") || "",
              )
            ? (localStorage.getItem("bito-settings-page") as Page)
            : "you";

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="pref-group">
      {title && <h2>{title}</h2>}
      <Card className="pref-group-body" padding={0}>
        {children}
      </Card>
    </section>
  );
}

function Switch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <AstryxSwitch
      className="bito-preference-switch"
      label={label}
      description={hint}
      value={checked}
      isDisabled={disabled}
      onChange={onChange}
      labelPosition="start"
      labelSpacing="spread"
    />
  );
}

export function SettingsWindow({
  state,
  initial,
}: {
  state: Snapshot;
  initial: string;
}) {
  const [page, setPage] = useState<Page>(() => pageFor(initial));
  const [memory, setMemory] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [reminder, setReminder] = useState(""),
    [due, setDue] = useState("");
  const [closing, setClosing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const writer = useMemo(() => preferenceWriter(api.command), []);
  const profile = usePreferenceDraft("profile", state.profile, writer);
  const settings = usePreferenceDraft("settings", state.settings, writer);
  const drafts = useRef({ profile, settings, state });
  drafts.current = { profile, settings, state };

  const scroll = useRef<HTMLDivElement>(null),
    nav = useRef<HTMLElement>(null);
  const previewFrame = useRef(0),
    previewSize = useRef(state.settings.size);
  const reduced = !!useReducedMotion() || settings.draft.reducedMotion;
  const errors = { ...profile.errors, ...settings.errors };
  const hasError = Object.keys(errors).length > 0;
  const status = hasError
    ? "error"
    : profile.status === "saving" || settings.status === "saving"
      ? "saving"
      : profile.status === "saved" || settings.status === "saved"
        ? "saved"
        : "idle";

  const selected = page === "data" || page === "reminders" ? "app" : page;

  // Non-trapping dirty recovery: if name was cleared, restore last saved name on navigation/close.
  const flushSafely = async () => {
    if (!drafts.current.profile.draft.name.trim()) {
      const fallback = drafts.current.state.profile.name.trim() || "Teman";
      drafts.current.profile.edit("name", fallback, 0);
    }
    const saved = await Promise.all([
      drafts.current.profile.flush(),
      drafts.current.settings.flush(),
    ]);
    return saved.every(Boolean);
  };

  const go = async (next: Page) => {
    const ok = await flushSafely();
    if (!ok) {
      setNoticeError(true);
      setNotice("Perubahan belum tersimpan. Periksa kembali isianmu.");
      return;
    }
    setPage(next);
    if (["you", "bito", "app"].includes(next))
      localStorage.setItem("bito-settings-page", next);
    scroll.current?.scrollTo({ top: 0 });
    setNotice("");
  };

  useEffect(() => {
    setPage(pageFor(initial));
  }, [initial]);

  useEffect(
    () =>
      api.onSettingsClose?.(() => {
        setClosing(true);
        void flushSafely().then((ok) => {
          setClosing(false);
          if (ok) void api.command("settings-close-ready");
          else {
            setNoticeError(true);
            setNotice("Selesaikan perubahan yang belum tersimpan.");
          }
        });
      }),
    [],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(previewFrame.current);
      void flushSafely();
    },
    [],
  );

  const run = async (name: string, payload?: unknown) => {
    setNotice("");
    setActionBusy(true);
    try {
      const result = await api.command(name, payload);
      setNoticeError(!result.ok);
      if (!result.ok) setNotice(result.error || "Belum berhasil. Coba lagi.");
      return result;
    } catch {
      setNoticeError(true);
      setNotice("Belum berhasil. Coba lagi.");
      return { ok: false };
    } finally {
      setActionBusy(false);
    }
  };

  const addMemory = async () => {
    if (!memory.trim() || memoryBusy) return;
    setMemoryBusy(true);
    try {
      if ((await run("memory-add", memory.trim())).ok) setMemory("");
    } finally {
      setMemoryBusy(false);
    }
  };

  const saveEditedMemory = async (id: string) => {
    const trimmed = editingMemoryText.trim();
    if (!trimmed || memoryBusy) return;
    setMemoryBusy(true);
    try {
      if ((await run("memory-update", { id, text: trimmed })).ok) {
        setEditingMemoryId(null);
        setEditingMemoryText("");
      }
    } finally {
      setMemoryBusy(false);
    }
  };

  const errorFor = (field: string) =>
    errors[field] ? (
      <p className="pref-field-error" role="alert">
        {errors[field]}
      </p>
    ) : null;

  const title =
    page === "data"
      ? "Data & penyimpanan"
      : page === "reminders"
        ? "Pengingat"
        : pages.find((p) => p.id === page)!.label;

  const activeMemoryStart = Math.max(0, state.memories.length - 12);

  return (
    <main
      className="preferences"
      inert={closing}
      data-platform={/Mac/.test(navigator.platform) ? "mac" : "other"}
    >
      <aside className="pref-sidebar">
        <div className="pref-window-title">
          <BitoMascot />
          <span>bito.</span>
        </div>
        <p className="pref-sidebar-caption">Dibuat nyaman untukmu.</p>
        <nav
          aria-label="Bagian pengaturan"
          ref={nav}
          onKeyDown={(e) => {
            if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key))
              return;
            e.preventDefault();
            const buttons = Array.from(
              nav.current!.querySelectorAll<HTMLButtonElement>("button"),
            );
            const at = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? buttons.length - 1
                  : (at + (e.key === "ArrowUp" ? -1 : 1) + buttons.length) %
                    buttons.length;
            buttons[next].focus();
            void go(pages[next].id);
          }}
        >
          {pages.map(({ id, label, icon: Icon }) => (
            <BitoButton
              key={id}
              type="button"
              className={`pref-nav-item ${selected === id ? "selected" : ""}`}
              aria-current={selected === id ? "page" : undefined}
              onClick={() => void go(id)}
            >
              {selected === id && (
                <motion.span
                  className="pref-nav-selection"
                  layoutId="settings-selection"
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 520, damping: 40 }
                  }
                />
              )}
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </BitoButton>
          ))}
        </nav>
        <small className="pref-version">Bito · v{version}</small>
      </aside>
      <section className="pref-main">
        <header className="pref-header">
          <div>
            {["data", "reminders"].includes(page) && (
              <BitoButton
                type="button"
                className="pref-back"
                onClick={() => void go("app")}
                aria-label="Kembali ke Aplikasi"
              >
                <ArrowLeft size={17} />
              </BitoButton>
            )}
            <div className="pref-title-copy">
              <h1>{title}</h1>
              <p>
                {
                  {
                    you: "Sedikit tentangmu, supaya Bito lebih mengerti.",
                    bito: "Atur kepribadian, tema warna, dan cara Bito menemani harimu.",
                    app: "Akun, kalender, pengingat, privasi data, dan bantuan.",
                    data: "Kelola data lokal, cadangan, dan hak privasi akunmu.",
                    reminders: "Pengingat terjadwal yang dikelola Bito.",
                  }[page]
                }
              </p>
            </div>
          </div>
          <div
            className={`pref-save-status ${status}`}
            role="status"
            aria-live="polite"
          >
            {closing || status === "saving" ? (
              <>
                <LoaderCircle size={12} className="pref-spinner" />
                Menyimpan…
              </>
            ) : status === "saved" ? (
              <>
                <Check size={13} />
                Tersimpan
              </>
            ) : status === "error" ? (
              <BitoButton
                type="button"
                onClick={() => {
                  void profile.retry();
                  void settings.retry();
                }}
              >
                Coba simpan lagi
              </BitoButton>
            ) : (
              "Disimpan otomatis"
            )}
          </div>
        </header>
        <div className="pref-scroll" ref={scroll}>
          <motion.div
            key={page}
            className="pref-page"
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduced ? 0 : 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {page === "you" && (
              <>
                <Group>
                  <div className="pref-field bito-form-field">
                    <span>Nama panggilan</span>
                    <BitoInput
                      label="Nama panggilan"
                      value={profile.draft.name}
                      maxLength={40}
                      autoComplete="off"
                      aria-invalid={!!errors.name}
                      onChange={(e) =>
                        profile.edit(
                          "name",
                          e.target.value,
                          500,
                          e.target.value.trim()
                            ? undefined
                            : "Masukkan nama panggilan.",
                        )
                      }
                      onBlur={() => {
                        if (!profile.draft.name.trim()) {
                          profile.edit(
                            "name",
                            state.profile.name.trim() || "Teman",
                            0,
                          );
                        }
                        void profile.flush();
                      }}
                    />
                    {errorFor("name")}
                  </div>
                  <div className="pref-field bito-form-field">
                    <span>Fokus atau proyek utama saat ini</span>
                    <BitoTextArea
                      label="Fokus atau proyek utama saat ini"
                      rows={3}
                      value={profile.draft.project}
                      maxLength={200}
                      aria-invalid={!!errors.project}
                      onChange={(e) =>
                        profile.edit("project", e.target.value, 500)
                      }
                      onBlur={() => void profile.flush()}
                    />
                    {errorFor("project")}
                  </div>
                </Group>
                <Group>
                  <BitoButton
                    type="button"
                    className="pref-link-row"
                    disabled={actionBusy || state.busy}
                    onClick={async () => {
                      if (await flushSafely())
                        await run("show-settings", "welcome");
                    }}
                  >
                    <span>Ulangi perkenalan</span>
                    <ChevronRight size={16} />
                  </BitoButton>
                </Group>
                <Group title="Yang Bito ingat">
                  <div className="pref-setting-row">
                    <span className="pref-secondary">
                      Bito menyertakan maksimal 12 ingatan terbaru ke dalam
                      percakapan aktif ({Math.min(12, state.memories.length)}/12
                      aktif).
                    </span>
                  </div>
                  <form
                    className="pref-memory-input"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void addMemory();
                    }}
                  >
                    <BitoInput
                      aria-label="Hal yang ingin Bito ingat"
                      placeholder="Tambahkan sesuatu tentangmu…"
                      value={memory}
                      maxLength={500}
                      onChange={(e) => setMemory(e.target.value)}
                    />
                    <BitoButton
                      type="submit"
                      aria-label="Tambah ingatan"
                      disabled={!memory.trim() || memoryBusy}
                    >
                      <Plus size={18} />
                    </BitoButton>
                  </form>
                  {state.memories.map((m, idx) => {
                    const isEditing = editingMemoryId === m.id;
                    const isActiveInPrompt = idx >= activeMemoryStart;
                    return (
                      <div className="pref-memory-row" key={m.id}>
                        {isEditing ? (
                          <form
                            className="pref-memory-edit-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void saveEditedMemory(m.id);
                            }}
                          >
                            <BitoInput
                              label="Ubah ingatan"
                              value={editingMemoryText}
                              maxLength={500}
                              autoFocus
                              onChange={(e) =>
                                setEditingMemoryText(e.target.value)
                              }
                            />
                            <BitoButton
                              type="submit"
                              variant="primary"
                              disabled={!editingMemoryText.trim() || memoryBusy}
                            >
                              Simpan
                            </BitoButton>
                            <BitoButton
                              type="button"
                              onClick={() => setEditingMemoryId(null)}
                            >
                              Batal
                            </BitoButton>
                          </form>
                        ) : (
                          <>
                            <span className="pref-memory-text">
                              {m.text}
                              {!isActiveInPrompt && (
                                <small className="pref-memory-inactive">
                                  Arsip lokal (di luar 12 terbaru)
                                </small>
                              )}
                            </span>
                            <div className="pref-memory-actions">
                              <BitoButton
                                type="button"
                                aria-label={`Ubah ingatan: ${m.text}`}
                                disabled={actionBusy}
                                onClick={() => {
                                  setEditingMemoryId(m.id);
                                  setEditingMemoryText(m.text);
                                }}
                              >
                                <Pencil size={14} />
                              </BitoButton>
                              <BitoButton
                                type="button"
                                aria-label={`Hapus ingatan: ${m.text}`}
                                disabled={actionBusy}
                                onClick={() => void run("memory-delete", m.id)}
                              >
                                <X size={15} />
                              </BitoButton>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </Group>
              </>
            )}
            {page === "bito" && (
              <>
                <div className="pref-companion-preview">
                  <BitoMascot />
                  <div>
                    <strong>Bito, dengan caramu.</strong>
                    <p>
                      Gaya bicara{" "}
                      {bitoStyles
                        .find((item) => item.value === profile.draft.style)
                        ?.title.toLocaleLowerCase()}{" "}
                      · kamu bisa mengubahnya kapan saja.
                    </p>
                  </div>
                </div>
                <Group title="Kepribadian">
                  <div className="pref-field">
                    <span>Gaya bicara</span>
                    <SegmentedControl
                      className="bito-personality-control"
                      label="Gaya bicara"
                      value={profile.draft.style}
                      layout="fill"
                      onChange={(value) =>
                        profile.edit("style", value as Profile["style"])
                      }
                    >
                      {bitoStyles.map((item) => (
                        <SegmentedControlItem
                          key={item.value}
                          value={item.value}
                          label={item.title}
                        />
                      ))}
                    </SegmentedControl>
                    {errorFor("style")}
                  </div>
                  <div className="pref-setting-row">
                    <span>Sapaan di luar tugas</span>
                    <BitoSelect
                      label="Sapaan di luar tugas"
                      className="bito-preference-selector"
                      value={profile.draft.proactive}
                      onValueChange={(value) =>
                        profile.edit("proactive", value as Profile["proactive"])
                      }
                    >
                      <option value="on-demand">Saat dipanggil</option>
                      <option value="sometimes">Sesekali</option>
                      <option value="quiet">Semua sapaan otomatis mati</option>
                    </BitoSelect>
                  </div>
                  {errorFor("proactive")}
                </Group>
                <Group title="Teman nugas">
                  <Switch
                    label="Bito boleh menawarkan bantuan"
                    hint="Saran dari progres dan tenggat proyekmu, tanpa perlu chat dulu."
                    checked={settings.draft.projectNudges ?? true}
                    onChange={(v) => settings.edit("projectNudges", v)}
                  />
                  {errorFor("projectNudges")}
                  {settings.draft.projectNudges !== false && (
                    <>
                      <div className="pref-setting-row">
                        <span>Frekuensi</span>
                        <BitoSelect
                          label="Frekuensi bantuan tugas"
                          className="bito-preference-selector"
                          value={settings.draft.nudgeCadence || "gentle"}
                          onValueChange={(value) =>
                            settings.edit(
                              "nudgeCadence",
                              value as "gentle" | "balanced",
                            )
                          }
                        >
                          <option value="gentle">
                            Pelan · maksimal 2 kali sehari
                          </option>
                          <option value="balanced">
                            Seimbang · maksimal 3 kali sehari
                          </option>
                        </BitoSelect>
                      </div>
                      {errorFor("nudgeCadence")}
                      <div className="pref-setting-row">
                        <span>Mulai menyapa</span>
                        <BitoSelect
                          label="Jam mulai bantuan tugas"
                          className="bito-preference-selector"
                          value={String(settings.draft.nudgeStartHour ?? 9)}
                          onValueChange={(value) =>
                            settings.edit("nudgeStartHour", Number(value))
                          }
                        >
                          {Array.from({ length: 24 }, (_, hour) => (
                            <option key={hour} value={String(hour)}>
                              {`${String(hour).padStart(2, "0")}.00`}
                            </option>
                          ))}
                        </BitoSelect>
                      </div>
                      <div className="pref-setting-row">
                        <span>Berhenti menyapa</span>
                        <BitoSelect
                          label="Jam selesai bantuan tugas"
                          className="bito-preference-selector"
                          value={String(settings.draft.nudgeEndHour ?? 21)}
                          onValueChange={(value) =>
                            settings.edit("nudgeEndHour", Number(value))
                          }
                        >
                          {Array.from({ length: 24 }, (_, hour) => (
                            <option key={hour} value={String(hour)}>
                              {`${String(hour).padStart(2, "0")}.00`}
                            </option>
                          ))}
                        </BitoSelect>
                      </div>
                      {errorFor("nudgeStartHour")}
                      {errorFor("nudgeEndHour")}
                      <div className="pref-setting-row">
                        <span className="pref-secondary">
                          {profile.draft.proactive === "quiet"
                            ? "Mode tenang sedang mematikan semua sapaan otomatis."
                            : "Jam lokal perangkat. Pilihan Nanti menunda saran selama 1 jam."}
                        </span>
                      </div>
                    </>
                  )}
                </Group>
                <Group title="Tampilan & Desktop">
                  <div className="pref-field">
                    <span>Tema warna</span>
                    <SegmentedControl
                      label="Tema warna"
                      value={settings.draft.theme || "system"}
                      layout="fill"
                      onChange={(value) =>
                        settings.edit(
                          "theme",
                          value as "system" | "light" | "dark",
                        )
                      }
                    >
                      <SegmentedControlItem
                        value="system"
                        label="Ikuti sistem"
                      />
                      <SegmentedControlItem value="light" label="Terang" />
                      <SegmentedControlItem value="dark" label="Gelap" />
                    </SegmentedControl>
                  </div>
                  <div className="pref-field pref-size">
                    <span>
                      Ukuran Bito <output>{settings.draft.size}px</output>
                    </span>
                    <Slider
                      label="Ukuran Bito"
                      isLabelHidden
                      valueDisplay="none"
                      min={130}
                      max={260}
                      value={settings.draft.size}
                      onChange={(size: number) => {
                        settings.edit("size", size, "commit");
                        previewSize.current = size;
                        if (!previewFrame.current)
                          previewFrame.current = requestAnimationFrame(() => {
                            previewFrame.current = 0;
                            void api.command(
                              "settings-preview-size",
                              previewSize.current,
                            );
                          });
                      }}
                      onChangeEnd={() => void settings.flush()}
                      onBlur={() => void settings.flush()}
                    />
                    {errorFor("size")}
                  </div>
                  <Switch
                    label="Selalu di atas jendela lain"
                    checked={settings.draft.alwaysOnTop}
                    onChange={(v) => settings.edit("alwaysOnTop", v)}
                  />
                  {errorFor("alwaysOnTop")}
                </Group>
              </>
            )}
            {page === "app" && (
              <>
                {state.auth?.configured && (
                  <Group title="Akun">
                    <div className="pref-setting-row">
                      <span>Masuk sebagai</span>
                      <span className="pref-secondary">
                        {state.auth.email || "Mode lokal"}
                      </span>
                    </div>
                    <BitoButton
                      type="button"
                      className="pref-link-row"
                      disabled={actionBusy || state.busy}
                      onClick={async () => {
                        if (await flushSafely()) await run("auth-signout");
                      }}
                    >
                      <span>Keluar dari akun</span>
                      <ChevronRight size={16} />
                    </BitoButton>
                  </Group>
                )}
                <Group title="Kalender & Jadwal">
                  <BitoButton
                    type="button"
                    className="pref-link-row"
                    disabled={actionBusy}
                    onClick={() => void run("calendar-export-ics")}
                  >
                    <span>Ekspor jadwal (.ics) ke Apple / Google / Outlook</span>
                    <Download size={16} />
                  </BitoButton>
                  <div className="pref-setting-row">
                    <span>
                      {state.calendar?.status === "connected"
                        ? "Google Calendar terhubung"
                        : state.calendar?.status === "connecting"
                          ? "Menunggu izin di browser…"
                          : "Sinkronisasi langsung Google Calendar"}
                    </span>
                    <span className="pref-secondary">
                      {state.calendar?.email}
                    </span>
                  </div>
                  <Switch
                    label="Sinkronisasi otomatis"
                    hint="Rencana proyek dan perubahan tanggal otomatis mengikuti Bito."
                    checked={!!state.calendar?.automatic}
                    disabled={
                      actionBusy ||
                      (state.calendar?.status !== "connected" &&
                        !state.calendar?.automatic)
                    }
                    onChange={(enabled) =>
                      void run("calendar-auto", { enabled })
                    }
                  />
                  <p className="pref-secondary" role="status">
                    {calendarSyncLabel(state.calendar)}
                  </p>
                  {state.calendar?.syncStatus === "error" &&
                    state.calendar.status === "connected" && (
                      <BitoButton
                        type="button"
                        className="pref-link-row"
                        disabled={actionBusy}
                        onClick={() => void run("calendar-retry")}
                      >
                        <span>Coba sinkronkan lagi</span>
                        <ChevronRight size={16} />
                      </BitoButton>
                    )}
                  {state.calendar?.error && (
                    <p role="status" className="board-error">
                      {state.calendar.error}
                    </p>
                  )}
                  {!state.calendar?.configured ? (
                    state.revisionMode ? (
                      <BitoButton
                        type="button"
                        className="pref-link-row"
                        disabled={actionBusy}
                        onClick={() => void run("calendar-import")}
                      >
                        <span>Siapkan koneksi Calendar</span>
                        <ChevronRight size={16} />
                      </BitoButton>
                    ) : (
                      <p className="pref-secondary">
                        Gunakan tombol Ekspor jadwal (.ics) di atas untuk semua
                        aplikasi kalender.
                      </p>
                    )
                  ) : state.calendar.status === "connected" ? (
                    <BitoButton
                      type="button"
                      className="pref-link-row"
                      disabled={actionBusy}
                      onClick={() => void run("calendar-disconnect")}
                    >
                      <span>Putuskan koneksi di perangkat ini</span>
                      <ChevronRight size={16} />
                    </BitoButton>
                  ) : state.calendar.status === "connecting" ? (
                    <BitoButton
                      type="button"
                      className="pref-link-row"
                      disabled={actionBusy}
                      onClick={() => void run("calendar-cancel")}
                    >
                      <span>Batalkan</span>
                      <ChevronRight size={16} />
                    </BitoButton>
                  ) : (
                    <BitoButton
                      type="button"
                      className="pref-link-row"
                      disabled={actionBusy}
                      onClick={() => void run("calendar-connect")}
                    >
                      <span>
                        {state.calendar.status === "expired"
                          ? "Hubungkan ulang"
                          : "Hubungkan Google Calendar"}
                      </span>
                      <ChevronRight size={16} />
                    </BitoButton>
                  )}
                </Group>
                <Group>
                  <Switch
                    label="Buka saat komputer dinyalakan"
                    checked={settings.draft.launchAtLogin}
                    onChange={(v) => settings.edit("launchAtLogin", v)}
                  />
                  {errorFor("launchAtLogin")}
                  <Switch
                    label="Jangan ganggu"
                    hint="Tunda sapaan dan notifikasi."
                    checked={settings.draft.dnd}
                    onChange={(v) => settings.edit("dnd", v)}
                  />
                  {errorFor("dnd")}
                </Group>
                <Group title="Aksesibilitas">
                  <Switch
                    label="Kurangi gerakan"
                    checked={settings.draft.reducedMotion}
                    onChange={(v) => settings.edit("reducedMotion", v)}
                  />
                  {errorFor("reducedMotion")}
                  <Switch
                    label="Kurangi transparansi"
                    checked={settings.draft.reducedTransparency}
                    onChange={(v) => settings.edit("reducedTransparency", v)}
                  />
                  {errorFor("reducedTransparency")}
                </Group>
                <Group>
                  <BitoButton
                    type="button"
                    className="pref-link-row"
                    onClick={() => void go("reminders")}
                  >
                    <span>Pengingat</span>
                    <ChevronRight size={16} />
                  </BitoButton>
                  <BitoButton
                    type="button"
                    className="pref-link-row"
                    onClick={() => void go("data")}
                  >
                    <span>Data, privasi &amp; penyimpanan</span>
                    <ChevronRight size={16} />
                  </BitoButton>
                </Group>
                <Group title="Bantuan & Dukungan">
                  <BitoButton
                    type="button"
                    className="pref-link-row"
                    onClick={() =>
                      void run("open-link", "https://bito.app/help")
                    }
                  >
                    <span>
                      <LifeBuoy size={15} /> Panduan &amp; Tanya Jawab Bito
                    </span>
                    <ExternalLink size={15} />
                  </BitoButton>
                  <BitoButton
                    type="button"
                    className="pref-link-row"
                    onClick={() =>
                      void run(
                        "open-link",
                        "https://github.com/feboyfierlyan/bito-desktop/issues",
                      )
                    }
                  >
                    <span>Laporkan masalah atau kirim masukan</span>
                    <ExternalLink size={15} />
                  </BitoButton>
                </Group>
              </>
            )}
            {page === "data" && (
              <>
                <Group title="Ringkasan data lokal">
                  <div className="pref-setting-row">
                    <span>Percakapan</span>
                    <span className="pref-secondary">
                      {state.messages.length} pesan
                    </span>
                  </div>
                  <div className="pref-setting-row">
                    <span>Proyek &amp; tugas singkat</span>
                    <span className="pref-secondary">
                      {state.projects.length} proyek · {state.tasks.length} tugas
                      singkat
                    </span>
                  </div>
                  <div className="pref-setting-row">
                    <span>Ingatan</span>
                    <span className="pref-secondary">
                      {state.memories.length} tersimpan (maks. 12 aktif di chat)
                    </span>
                  </div>
                </Group>
                <Group title="Cadangan (Ekspor & Impor)">
                  <BitoButton
                    type="button"
                    className="pref-link-row"
                    disabled={actionBusy}
                    onClick={() => void run("export")}
                  >
                    <span>Ekspor cadangan data (.json)</span>
                    <Download size={16} />
                  </BitoButton>
                  <BitoButton
                    type="button"
                    className="pref-link-row"
                    disabled={actionBusy || state.busy}
                    onClick={() => void run("import-data")}
                  >
                    <span>Pulihkan dari berkas cadangan (.json)</span>
                    <Upload size={16} />
                  </BitoButton>
                </Group>
                <Group title="Penghapusan data & privasi">
                  <BitoButton
                    type="button"
                    className="pref-link-row pref-danger"
                    disabled={actionBusy || state.busy}
                    onClick={() => void run("clear-chat")}
                  >
                    <span>
                      {state.activeProjectId
                        ? "Hapus obrolan proyek aktif…"
                        : "Hapus obrolan umum…"}
                    </span>
                    <Trash2 size={16} />
                  </BitoButton>
                  <BitoButton
                    type="button"
                    className="pref-link-row pref-danger"
                    disabled={actionBusy || state.busy}
                    onClick={() => void run("clear-chat", { scope: "all" })}
                  >
                    <span>Hapus seluruh riwayat obrolan…</span>
                    <Trash2 size={16} />
                  </BitoButton>
                  <BitoButton
                    type="button"
                    className="pref-link-row pref-danger"
                    disabled={actionBusy || state.busy}
                    onClick={() => void run("reset-local-data")}
                  >
                    <span>Reset semua data lokal di komputer ini…</span>
                    <Trash2 size={16} />
                  </BitoButton>
                  {state.auth?.configured && state.auth.userId && (
                    <BitoButton
                      type="button"
                      className="pref-link-row pref-danger"
                      disabled={actionBusy || state.busy}
                      onClick={() => void run("auth-delete-account")}
                    >
                      <span>Hapus permanen akun &amp; data cloud Bito…</span>
                      <Trash2 size={16} />
                    </BitoButton>
                  )}
                </Group>
                <p className="pref-caption">
                  Riwayat percakapan, proyek, tugas singkat, pengingat, dan
                  ingatan disimpan secara lokal di perangkatmu. Saat kamu
                  mengirim pesan atau lampiran ke AI, konteks diproses secara
                  terenkripsi melalui antrean sementara (maks. 24 jam) dan
                  penyedia model AI. Bito tidak pernah merekam layar tanpa
                  konfirmasimu.
                </p>
              </>
            )}
            {page === "reminders" && (
              <>
                <Group>
                  <form
                    className="pref-reminder-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        (
                          await run("reminder-add", {
                            title: reminder,
                            due: new Date(due).getTime(),
                          })
                        ).ok
                      ) {
                        setReminder("");
                        setDue("");
                      }
                    }}
                  >
                    <div className="pref-field bito-form-field">
                      <span>Ingatkan aku untuk</span>
                      <BitoInput
                        label="Ingatkan aku untuk"
                        required
                        maxLength={240}
                        value={reminder}
                        onChange={(e) => setReminder(e.target.value)}
                      />
                    </div>
                    <label className="pref-field">
                      <span>Kapan?</span>
                      <BitoInput
                        label="Waktu pengingat"
                        type="datetime-local"
                        required
                        value={due}
                        onChange={(e) => setDue(e.target.value)}
                      />
                    </label>
                    <BitoButton
                      className="pref-primary"
                      variant="primary"
                      disabled={actionBusy}
                      type="submit"
                    >
                      Tambah pengingat
                    </BitoButton>
                  </form>
                </Group>
                {state.reminders
                  .filter((r) => !r.done)
                  .map((r) => (
                    <Group key={r.id}>
                      <div className="pref-memory-row">
                        <Bell size={16} />
                        <span className="pref-memory-text">
                          {r.title}
                          <small>
                            {new Date(r.due).toLocaleString("id-ID")}
                          </small>
                        </span>
                        <div className="pref-memory-actions">
                          <BitoButton
                            type="button"
                            aria-label={`Tunda 10 menit: ${r.title}`}
                            title="Tunda 10 menit"
                            onClick={() => void run("reminder-snooze", r.id)}
                          >
                            <Clock3 size={15} />
                          </BitoButton>
                          <BitoButton
                            type="button"
                            aria-label={`Tandai selesai: ${r.title}`}
                            title="Tandai selesai"
                            onClick={() => void run("reminder-done", r.id)}
                          >
                            <Check size={17} />
                          </BitoButton>
                          <BitoButton
                            type="button"
                            aria-label={`Hapus pengingat: ${r.title}`}
                            title="Hapus"
                            onClick={() => void run("reminder-delete", r.id)}
                          >
                            <X size={15} />
                          </BitoButton>
                        </div>
                      </div>
                    </Group>
                  ))}
              </>
            )}
            {notice && (
              <p
                className={noticeError ? "pref-field-error" : "pref-caption"}
                role={noticeError ? "alert" : "status"}
              >
                {notice}
              </p>
            )}
          </motion.div>
        </div>
      </section>
    </main>
  );
}
