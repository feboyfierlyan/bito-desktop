import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch as AstryxSwitch } from "@astryxdesign/core/Switch";
import { Card } from "@astryxdesign/core/Card";
import { Slider } from "@astryxdesign/core/Slider";
import { BitoInput, BitoButton, BitoTextArea } from "./ui/controls";
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
  Trash2,
  LoaderCircle,
  Bell,
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
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [reminder, setReminder] = useState(""),
    [due, setDue] = useState("");
  const [closing, setClosing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const writer = useMemo(() => preferenceWriter(api.command), []);
  const profile = usePreferenceDraft("profile", state.profile, writer);
  const settings = usePreferenceDraft("settings", state.settings, writer);
  const drafts = useRef({ profile, settings });
  drafts.current = { profile, settings };
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
  const go = async (next: Page) => {
    const saved = await Promise.all([profile.flush(), settings.flush()]);
    if (!saved.every(Boolean)) {
      setNoticeError(true);
      setNotice(
        "Perubahan belum tersimpan. Periksa isian sebelum pindah halaman.",
      );
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
        void Promise.all([
          drafts.current.profile.flush(),
          drafts.current.settings.flush(),
        ]).then((results) => {
          if (results.every(Boolean)) void api.command("settings-close-ready");
          else {
            setClosing(false);
            setNoticeError(true);
            setNotice(
              "Selesaikan perubahan yang belum tersimpan sebelum menutup.",
            );
          }
        });
      }),
    [],
  );
  useEffect(() => () => cancelAnimationFrame(previewFrame.current), []);
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
            go(pages[next].id);
          }}
        >
          {pages.map(({ id, label, icon: Icon }) => (
            <BitoButton
              key={id}
              className={`pref-nav-item ${selected === id ? "selected" : ""}`}
              aria-current={selected === id ? "page" : undefined}
              onClick={() => go(id)}
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
        <small className="pref-version">Bito · {version}</small>
      </aside>
      <section className="pref-main">
        <header className="pref-header">
          <div>
            {["data", "reminders"].includes(page) && (
              <BitoButton
                className="pref-back"
                onClick={() => go("app")}
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
                    bito: "Atur cara Bito menemani harimu.",
                    app: "Koneksi, kenyamanan, dan aksesibilitas.",
                    data: "Lihat dan kelola yang kamu simpan di Bito.",
                    reminders: "Hal kecil yang ingin kamu ingat.",
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
                      onBlur={() => void profile.flush()}
                    />
                    {errorFor("name")}
                  </div>
                  <div className="pref-field bito-form-field">
                    <span>Proyek yang sedang dikerjakan</span>
                    <BitoTextArea
                      label="Proyek yang sedang dikerjakan"
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
                    className="pref-link-row"
                    disabled={actionBusy || state.busy}
                    onClick={async () => {
                      const saved = await Promise.all([
                        profile.flush(),
                        settings.flush(),
                      ]);
                      if (saved.every(Boolean))
                        await run("show-settings", "welcome");
                    }}
                  >
                    <span>Ulangi perkenalan</span>
                    <ChevronRight size={16} />
                  </BitoButton>
                </Group>
                <Group title="Yang Bito ingat">
                  <form
                    className="pref-memory-input"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void addMemory();
                    }}
                  >
                    <BitoInput
                      aria-label="Hal yang ingin Bito ingat"
                      placeholder="Tambahkan sesuatu tentangmu"
                      value={memory}
                      maxLength={500}
                      onChange={(e) => setMemory(e.target.value)}
                    />
                    <BitoButton
                      type="submit"
                      aria-label="Tambah memori"
                      disabled={!memory.trim() || memoryBusy}
                    >
                      <Plus size={18} />
                    </BitoButton>
                  </form>
                  {state.memories.map((m) => (
                    <div className="pref-memory-row" key={m.id}>
                      <span>{m.text}</span>
                      <BitoButton
                        aria-label={`Hapus memori: ${m.text}`}
                        disabled={actionBusy}
                        onClick={() => void run("memory-delete", m.id)}
                      >
                        <X size={15} />
                      </BitoButton>
                    </div>
                  ))}
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
                    <Selector
                      label="Sapaan di luar tugas"
                      isLabelHidden
                      containerClassName="bito-preference-selector"
                      value={profile.draft.proactive}
                      onChange={(value) =>
                        profile.edit("proactive", value as Profile["proactive"])
                      }
                      options={[
                        { value: "on-demand", label: "Saat dipanggil" },
                        { value: "sometimes", label: "Sesekali" },
                        { value: "quiet", label: "Semua sapaan otomatis mati" },
                      ]}
                    />
                  </div>
                  {errorFor("proactive")}
                </Group>
                <Group title="Teman nugas">
                  <Switch
                    label="Bito boleh menawarkan bantuan"
                    hint="Saran dari progres dan tenggat tugasmu, tanpa perlu chat dulu."
                    checked={settings.draft.projectNudges ?? true}
                    onChange={(v) => settings.edit("projectNudges", v)}
                  />
                  {errorFor("projectNudges")}
                  {settings.draft.projectNudges !== false && (
                    <>
                      <div className="pref-setting-row">
                        <span>Frekuensi</span>
                        <Selector
                          label="Frekuensi bantuan tugas"
                          isLabelHidden
                          containerClassName="bito-preference-selector"
                          value={settings.draft.nudgeCadence || "gentle"}
                          onChange={(value) =>
                            settings.edit(
                              "nudgeCadence",
                              value as "gentle" | "balanced",
                            )
                          }
                          options={[
                            {
                              value: "gentle",
                              label: "Pelan · maksimal 2 kali sehari",
                            },
                            {
                              value: "balanced",
                              label: "Seimbang · maksimal 3 kali sehari",
                            },
                          ]}
                        />
                      </div>
                      {errorFor("nudgeCadence")}
                      <div className="pref-setting-row">
                        <span>Mulai menyapa</span>
                        <Selector
                          label="Jam mulai bantuan tugas"
                          isLabelHidden
                          containerClassName="bito-preference-selector"
                          value={String(settings.draft.nudgeStartHour ?? 9)}
                          onChange={(value) =>
                            settings.edit("nudgeStartHour", Number(value))
                          }
                          options={Array.from({ length: 24 }, (_, hour) => ({
                            value: String(hour),
                            label: `${String(hour).padStart(2, "0")}.00`,
                          }))}
                        />
                      </div>
                      <div className="pref-setting-row">
                        <span>Berhenti menyapa</span>
                        <Selector
                          label="Jam selesai bantuan tugas"
                          isLabelHidden
                          containerClassName="bito-preference-selector"
                          value={String(settings.draft.nudgeEndHour ?? 21)}
                          onChange={(value) =>
                            settings.edit("nudgeEndHour", Number(value))
                          }
                          options={Array.from({ length: 24 }, (_, hour) => ({
                            value: String(hour),
                            label: `${String(hour).padStart(2, "0")}.00`,
                          }))}
                        />
                      </div>
                      {errorFor("nudgeStartHour")}
                      {errorFor("nudgeEndHour")}
                      <div className="pref-setting-row">
                        <span className="pref-secondary">
                          {profile.draft.proactive === "quiet"
                            ? "Mode tenang sedang mematikan semua sapaan otomatis."
                            : "Jam lokal perangkat. Nanti menunda saran selama 1 jam."}
                        </span>
                      </div>
                    </>
                  )}
                </Group>
                <Group title="Di desktop">
                  <div className="pref-field pref-size">
                    <span>
                      Ukuran Bito<output>{settings.draft.size}px</output>
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
                      <span className="pref-secondary">{state.auth.email}</span>
                    </div>
                    <BitoButton
                      className="pref-link-row"
                      disabled={actionBusy || state.busy}
                      onClick={async () => {
                        const saved = await Promise.all([
                          profile.flush(),
                          settings.flush(),
                        ]);
                        if (saved.every(Boolean)) await run("auth-signout");
                      }}
                    >
                      <span>Keluar dari akun</span>
                      <ChevronRight size={16} />
                    </BitoButton>
                  </Group>
                )}
                <Group title="Google Calendar">
                  <div className="pref-setting-row">
                    <span>
                      {state.calendar?.status === "connected"
                        ? "Terhubung"
                        : state.calendar?.status === "connecting"
                          ? "Menunggu izin di browser…"
                          : "Belum terhubung"}
                    </span>
                    <span className="pref-secondary">
                      {state.calendar?.email}
                    </span>
                  </div>
                  <Switch
                    label="Sinkronisasi otomatis"
                    hint="Rencana yang disetujui dan perubahan jadwal otomatis mengikuti Bito."
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
                        className="pref-link-row"
                        disabled={actionBusy}
                        onClick={() => void run("calendar-import")}
                      >
                        <span>Siapkan koneksi Calendar</span>
                        <ChevronRight size={16} />
                      </BitoButton>
                    ) : (
                      <p className="pref-secondary">
                        Koneksi Calendar belum tersedia di versi ini.
                      </p>
                    )
                  ) : state.calendar.status === "connected" ? (
                    <BitoButton
                      className="pref-link-row"
                      disabled={actionBusy}
                      onClick={() => void run("calendar-disconnect")}
                    >
                      <span>Putuskan koneksi di perangkat ini</span>
                      <ChevronRight size={16} />
                    </BitoButton>
                  ) : state.calendar.status === "connecting" ? (
                    <BitoButton
                      className="pref-link-row"
                      disabled={actionBusy}
                      onClick={() => void run("calendar-cancel")}
                    >
                      <span>Batalkan</span>
                      <ChevronRight size={16} />
                    </BitoButton>
                  ) : (
                    <BitoButton
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
                    className="pref-link-row"
                    onClick={() => go("data")}
                  >
                    <span>Data & penyimpanan</span>
                    <ChevronRight size={16} />
                  </BitoButton>
                </Group>
              </>
            )}
            {page === "data" && (
              <>
                <Group>
                  <div className="pref-setting-row">
                    <span>Percakapan</span>
                    <span className="pref-secondary">
                      {state.messages.length} pesan
                    </span>
                  </div>
                  <div className="pref-setting-row">
                    <span>Memori</span>
                    <span className="pref-secondary">
                      {state.memories.length} tersimpan
                    </span>
                  </div>
                </Group>
                <Group>
                  <BitoButton
                    className="pref-link-row"
                    disabled={actionBusy}
                    onClick={() => void run("export")}
                  >
                    <span>Ekspor data</span>
                    <Download size={16} />
                  </BitoButton>
                  <BitoButton
                    className="pref-link-row pref-danger"
                    disabled={actionBusy || state.busy}
                    onClick={() => void run("clear-chat")}
                  >
                    <span>Hapus percakapan</span>
                    <Trash2 size={16} />
                  </BitoButton>
                </Group>
                <p className="pref-caption">
                  Profil, percakapan, dan memori tersimpan di perangkatmu.
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
                        type="datetime-local"
                        required
                        value={due}
                        onChange={(e) => setDue(e.target.value)}
                      />
                    </label>
                    <BitoButton
                      className="pref-primary"
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
                        <span>
                          {r.title}
                          <small>
                            {new Date(r.due).toLocaleString("id-ID")}
                          </small>
                        </span>
                        <BitoButton
                          aria-label="Tandai selesai"
                          onClick={() => void run("reminder-done", r.id)}
                        >
                          <Check size={17} />
                        </BitoButton>
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
