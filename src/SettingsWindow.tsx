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
      <div className="pref-group-body">{children}</div>
    </section>
  );
}
function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="pref-switch-row">
      <span>
        <span className="pref-label">{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="pref-switch-track" aria-hidden="true">
        <span />
      </span>
    </label>
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
  const go = (next: Page) => {
    void profile.flush();
    void settings.flush();
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
        <div className="pref-window-title">Settings</div>
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
            <button
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
            </button>
          ))}
        </nav>
        <small className="pref-version">Bito · {version}</small>
      </aside>
      <section className="pref-main">
        <header className="pref-header">
          <div>
            {["data", "reminders"].includes(page) && (
              <button
                className="pref-back"
                onClick={() => go("app")}
                aria-label="Kembali ke Aplikasi"
              >
                <ArrowLeft size={17} />
              </button>
            )}
            <h1>{title}</h1>
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
              <button
                onClick={() => {
                  void profile.retry();
                  void settings.retry();
                }}
              >
                Coba simpan lagi
              </button>
            ) : null}
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
                  <label className="pref-field">
                    <span>Nama panggilan</span>
                    <input
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
                  </label>
                  <label className="pref-field">
                    <span>Proyek yang sedang dikerjakan</span>
                    <textarea
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
                  </label>
                </Group>
                <Group>
                  <button
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
                  </button>
                </Group>
                <Group title="Yang Bito ingat">
                  <form
                    className="pref-memory-input"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void addMemory();
                    }}
                  >
                    <input
                      aria-label="Hal yang ingin Bito ingat"
                      placeholder="Tambahkan sesuatu tentangmu"
                      value={memory}
                      maxLength={500}
                      onChange={(e) => setMemory(e.target.value)}
                    />
                    <button
                      type="submit"
                      aria-label="Tambah memori"
                      disabled={!memory.trim() || memoryBusy}
                    >
                      <Plus size={18} />
                    </button>
                  </form>
                  {state.memories.map((m) => (
                    <div className="pref-memory-row" key={m.id}>
                      <span>{m.text}</span>
                      <button
                        aria-label={`Hapus memori: ${m.text}`}
                        disabled={actionBusy}
                        onClick={() => void run("memory-delete", m.id)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </Group>
              </>
            )}
            {page === "bito" && (
              <>
                <Group title="Kepribadian">
                  <div className="pref-field">
                    <span>Gaya bicara</span>
                    <div
                      className="pref-segmented"
                      role="radiogroup"
                      aria-label="Gaya bicara"
                      onKeyDown={(e) => {
                        if (
                          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                            e.key,
                          )
                        )
                          return;
                        e.preventDefault();
                        const choices = bitoStyles.map((style) => style.value);
                        const at = choices.indexOf(profile.draft.style);
                        const next =
                          e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? choices.length - 1
                              : (at +
                                  (e.key === "ArrowLeft" ? -1 : 1) +
                                  choices.length) %
                                choices.length;
                        profile.edit("style", choices[next]);
                        e.currentTarget
                          .querySelectorAll<HTMLButtonElement>("button")
                          [next].focus();
                      }}
                    >
                      {bitoStyles.map((item) => (
                        <button
                          key={item.value}
                          role="radio"
                          aria-checked={profile.draft.style === item.value}
                          tabIndex={profile.draft.style === item.value ? 0 : -1}
                          onClick={() => profile.edit("style", item.value)}
                        >
                          {profile.draft.style === item.value && (
                            <motion.span
                              className="pref-segment-selected"
                              layoutId="settings-style"
                              transition={
                                reduced
                                  ? { duration: 0 }
                                  : {
                                      type: "spring",
                                      stiffness: 500,
                                      damping: 38,
                                    }
                              }
                            />
                          )}
                          <span>{item.title}</span>
                        </button>
                      ))}
                    </div>
                    {errorFor("style")}
                  </div>
                  <label className="pref-setting-row">
                    <span>Kebiasaan menyapa</span>
                    <select
                      aria-label="Kebiasaan menyapa"
                      value={profile.draft.proactive}
                      onChange={(e) =>
                        profile.edit(
                          "proactive",
                          e.target.value as Profile["proactive"],
                        )
                      }
                    >
                      <option value="on-demand">Saat dipanggil</option>
                      <option value="sometimes">Sesekali</option>
                      <option value="quiet">Mode tenang</option>
                    </select>
                  </label>
                  {errorFor("proactive")}
                </Group>
                <Group title="Di desktop">
                  <label className="pref-field pref-size">
                    <span>
                      Ukuran Bito<output>{settings.draft.size}px</output>
                    </span>
                    <input
                      type="range"
                      min={130}
                      max={260}
                      value={settings.draft.size}
                      onChange={(e) => {
                        const size = Number(e.target.value);
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
                      onPointerUp={() => void settings.flush()}
                      onKeyUp={() => void settings.flush()}
                      onBlur={() => void settings.flush()}
                    />
                    {errorFor("size")}
                  </label>
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
                    <button
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
                    </button>
                  </Group>
                )}
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
                  <button className="pref-link-row" onClick={() => go("data")}>
                    <span>Data & penyimpanan</span>
                    <ChevronRight size={16} />
                  </button>
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
                  <button
                    className="pref-link-row"
                    disabled={actionBusy}
                    onClick={() => void run("export")}
                  >
                    <span>Ekspor data</span>
                    <Download size={16} />
                  </button>
                  <button
                    className="pref-link-row pref-danger"
                    disabled={actionBusy || state.busy}
                    onClick={() => void run("clear-chat")}
                  >
                    <span>Hapus percakapan</span>
                    <Trash2 size={16} />
                  </button>
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
                    <label className="pref-field">
                      <span>Ingatkan aku untuk</span>
                      <input
                        required
                        maxLength={240}
                        value={reminder}
                        onChange={(e) => setReminder(e.target.value)}
                      />
                    </label>
                    <label className="pref-field">
                      <span>Kapan?</span>
                      <input
                        type="datetime-local"
                        required
                        value={due}
                        onChange={(e) => setDue(e.target.value)}
                      />
                    </label>
                    <button
                      className="pref-primary"
                      disabled={actionBusy}
                      type="submit"
                    >
                      Tambah pengingat
                    </button>
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
                        <button
                          aria-label="Tandai selesai"
                          onClick={() => void run("reminder-done", r.id)}
                        >
                          <Check size={17} />
                        </button>
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
