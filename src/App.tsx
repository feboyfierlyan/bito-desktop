// Keep the React component boundary separate from the root bootstrap for Fast Refresh.
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  X,
  Plus,
  Settings as SettingsIcon,
  Timer,
  Paperclip,
  Square,
  Check,
  ChevronRight,
  MessageCircle,
  MousePointer2,
  Move,
  MoreHorizontal,
  Pause,
  Play,
  CheckCheck,
  Bell,
  Heart,
  User,
  KeyRound,
  Monitor,
  Shield,
  Download,
  Trash2,
  FileText,
  Copy,
  Bookmark,
  RefreshCw,
  Sprout,
  VolumeX,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, isDesktop } from "./bridge";
import { Character } from "./Character";
import { isDrag, remaining } from "../electron/core";
import type { Snapshot, Profile, Settings, Message } from "./shared";
import "./style.css";
const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 36,
  mass: 0.85,
};
const surface =
  new URLSearchParams(location.search).get("surface") || "onboarding";
function IconButton({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export default function App() {
  const [state, setState] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [route, setRoute] = useState(surface);
  useEffect(() => {
    void api.getState().then(setState);
    const off = api.onState(setState);
    const delta = api.onDelta(({ id, delta }) =>
      setState((s) =>
        s
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === id ? { ...m, text: m.text + delta } : m,
              ),
            }
          : s,
      ),
    );
    const listener = (e: Event) => setRoute((e as CustomEvent).detail);
    window.addEventListener("bito-route", listener);
    return () => {
      off();
      delta();
      window.removeEventListener("bito-route", listener);
    };
  }, []);
  const act = async (name: string, payload?: unknown) => {
    const result = await api.command(name, payload);
    if (!result.ok) setError(result.error || "Terjadi kesalahan.");
    return result;
  };
  useEffect(() => {
    document.body.dataset.surface = route;
    if (state) {
      document.body.dataset.solid = String(state.settings.reducedTransparency);
      document.body.dataset.motion = state.settings.reducedMotion
        ? "reduced"
        : "full";
    }
  }, [route, state?.settings.reducedTransparency]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 6500);
    return () => clearTimeout(timer);
  }, [error]);
  if (!state) return <div className="boot">Menyiapkan Bito…</div>;
  return (
    <MotionConfig
      transition={spring}
      reducedMotion={state.settings.reducedMotion ? "always" : "user"}
    >
      {route === "pet" ? (
        <Pet state={state} />
      ) : route === "chat" ? (
        <Chat state={state} act={act} />
      ) : (route === "onboarding" && !state.onboarded) ||
        route === "welcome" ? (
        <Onboarding
          key={route}
          state={state}
          act={act}
          restart={route === "welcome"}
        />
      ) : (
        <Studio state={state} act={act} initial={route} />
      )}
      {error && (
        <motion.div
          role="alert"
          className="toast"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
          <button aria-label="Tutup pemberitahuan" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </motion.div>
      )}
      {!isDesktop && route !== "pet" && (
        <div className="preview-label">
          Browser preview · fitur desktop tersedia di aplikasi
        </div>
      )}
    </MotionConfig>
  );
}
type Act = (
  name: string,
  payload?: unknown,
) => Promise<{ ok: boolean; error?: string; value?: unknown }>;
function Pet({ state }: { state: Snapshot }) {
  const pointer = useRef<{
    x: number;
    y: number;
    drag: boolean;
    pointerId: number;
  } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (pointer.current) return;
      const w = innerWidth,
        h = innerHeight;
      const x = e.clientX / w,
        y = e.clientY / h;
      const hit =
        (y > 0.1 && y < 0.43 && x > 0.27 && x < 0.74) ||
        (y > 0.38 && y < 0.85 && x > 0.13 && x < 0.87) ||
        (y > 0.8 && y < 0.94 && x > 0.25 && x < 0.75);
      api.setHit(hit);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("blur", cancel);
    function cancel() {
      if (pointer.current?.drag) api.dragEnd();
      pointer.current = null;
    }
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  return (
    <div
      className={`pet ${state.dragging ? "dragging" : ""}`}
      role="button"
      aria-label="Bito: klik untuk chat, seret untuk memindahkan"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") api.toggleChat();
        if (e.key === "ContextMenu") api.contextMenu();
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        pointer.current = {
          x: e.screenX,
          y: e.screenY,
          drag: false,
          pointerId: e.pointerId,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const p = pointer.current;
        if (!p) return;
        const dx = e.screenX - p.x,
          dy = e.screenY - p.y;
        if (!p.drag && isDrag(dx, dy)) {
          p.drag = true;
          api.dragStart();
        }
        if (p.drag) api.dragMove(dx, dy);
      }}
      onPointerUp={(e) => {
        if (e.button !== 0) return;
        const p = pointer.current;
        pointer.current = null;
        if (!p) return;
        if (p.drag) api.dragEnd();
        else api.toggleChat();
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        if (pointer.current?.drag) api.dragEnd();
        pointer.current = null;
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        api.contextMenu();
      }}
    >
      <Character state={state} />
    </div>
  );
}
function Onboarding({
  state,
  act,
  restart = false,
}: {
  state: Snapshot;
  act: Act;
  restart?: boolean;
}) {
  const [step, setStep] = useState(restart ? 0 : state.onboardingStep),
    [profile, setProfile] = useState<Profile>(state.profile),
    [goal, setGoal] = useState(state.profile.goal || "Tugas akhir");
  const update = (p: Partial<Profile>) => setProfile({ ...profile, ...p });
  const next = async () => {
    const result = await act("onboarding", {
      step: Math.min(2, step + 1),
      profile: { ...profile, goal },
      complete: step === 2,
    });
    if (result.ok) setStep(Math.min(2, step + 1));
  };
  return (
    <main className="onboarding">
      <div className="onboard-top">
        <span className="wordmark">
          bito<span>●</span>
        </span>
        <span>Teman untuk langkah kecilmu.</span>
      </div>
      <div className="onboard-content">
        <div className="onboard-character">
          <Character state={state} large />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={step}
            className="onboard-step"
            initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
            transition={{ duration: 0.22 }}
          >
            <p className="eyebrow">
              {
                ["SENANG BISA KENAL", "SEDIKIT TENTANG KAMU", "RUMAH BARUKU"][
                  step
                ]
              }
            </p>
            <h1>
              {step === 0
                ? "Hai, aku Bito."
                : step === 1
                  ? `Lagi mengerjakan apa, ${profile.name}?`
                  : "Aku akan menemanimu di sini."}
            </h1>
            <p className="lead">
              {step === 0
                ? "Teman kecil di desktopmu. Untuk ide yang belum ketemu, tugas yang terasa berat, dan langkah kecil berikutnya."
                : step === 1
                  ? "Biar bantuanku terasa lebih pas. Semuanya bisa kamu ubah nanti."
                  : "Pindahkan aku ke tempat yang nyaman. Aku ada saat kamu butuh."}
            </p>
            {step === 0 && (
              <label className="name-field">
                Aku boleh panggil kamu siapa?
                <input
                  autoFocus
                  placeholder="Nama panggilanmu"
                  value={profile.name}
                  maxLength={40}
                  onChange={(e) => update({ name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && profile.name.trim()) void next();
                  }}
                />
              </label>
            )}
            {step === 1 && (
              <div className="personalize">
                <div className="chips">
                  {[
                    "Tugas akhir",
                    "Menjaga fokus",
                    "Mengatur hari",
                    "Teman bekerja",
                  ].map((g) => (
                    <button
                      key={g}
                      className={goal === g ? "selected" : ""}
                      onClick={() => {
                        setGoal(g);
                        update({ goal: g });
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Proyek yang sedang dikerjakan"
                  placeholder={`Ceritakan sedikit tentang ${goal.toLowerCase()}mu (opsional)`}
                  value={profile.project}
                  onChange={(e) => update({ project: e.target.value })}
                />
                <div className="style-options">
                  {(["warm", "calm", "direct"] as const).map((v, i) => (
                    <button
                      key={v}
                      onClick={() => update({ style: v })}
                      className={profile.style === v ? "selected" : ""}
                    >
                      <strong>{["Hangat", "Tenang", "Langsung"][i]}</strong>
                      <small>
                        {
                          [
                            "“Pelan-pelan, kita mulai bareng.”",
                            "“Satu hal dulu. Aku temani.”",
                            "“Kita pecah jadi tiga langkah.”",
                          ][i]
                        }
                      </small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="how-to">
                <div>
                  <MousePointer2 />
                  <span>
                    <strong>Klik sekali</strong>
                    <small>Ngobrol di sebelah kananku</small>
                  </span>
                </div>
                <div>
                  <Move />
                  <span>
                    <strong>Seret</strong>
                    <small>Pindahkan aku, tanpa membuka chat</small>
                  </span>
                </div>
                <div>
                  <MoreHorizontal />
                  <span>
                    <strong>Klik kanan</strong>
                    <small>Fokus, pengingat, dan pengaturan</small>
                  </span>
                </div>
                <label className="proactive">
                  Boleh menyapa duluan?
                  <select
                    value={profile.proactive}
                    onChange={(e) =>
                      update({
                        proactive: e.target.value as Profile["proactive"],
                      })
                    }
                  >
                    <option value="on-demand">Hanya saat dipanggil</option>
                    <option value="sometimes">Sesekali, dengan lembut</option>
                    <option value="quiet">Mode tenang</option>
                  </select>
                </label>
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </div>
      <footer className="onboard-bottom">
        <div className="progress" aria-label={`Langkah ${step + 1} dari 3`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i === step ? "active" : ""} />
          ))}
        </div>
        <div>
          {step > 0 && (
            <button className="text-button" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} /> Kembali
            </button>
          )}
          <button
            className="primary"
            disabled={!profile.name.trim()}
            onClick={() => void next()}
          >
            {["Kenalan, yuk", "Lanjutkan", "Mulai bersama Bito"][step]}
            <ArrowRight size={17} />
          </button>
        </div>
        <p>Pribadi, tenang, dan selalu bisa kamu atur.</p>
      </footer>
    </main>
  );
}
function Chat({ state, act }: { state: Snapshot; act: Act }) {
  const [text, setText] = useState(""),
    [attachment, setAttachment] = useState<
      { name: string; content: string } | undefined
    >(),
    [tab, setTab] = useState<"chat" | "focus" | "tasks">("chat"),
    [copied, setCopied] = useState("");
  const scroller = useRef<HTMLDivElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null),
    nearBottom = useRef(true);
  useEffect(() => {
    if (nearBottom.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [state.messages, state.busy, tab]);
  useEffect(() => {
    if (state.chatOpen) setTimeout(() => textarea.current?.focus(), 200);
  }, [state.chatOpen]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") void act("close-chat");
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  async function send(value = text) {
    if (state.busy || (!value.trim() && !attachment)) return;
    const result = await act("send", { text: value, attachment });
    if (result.ok) {
      setText("");
      setAttachment(undefined);
      nearBottom.current = true;
    }
  }
  const copy = async (m: Message) => {
    await navigator.clipboard.writeText(m.text);
    setCopied(m.id);
    setTimeout(() => setCopied(""), 1500);
  };
  return (
    <motion.main
      className="chat-panel"
      initial={{ opacity: 0, x: -12, scale: 0.965 }}
      animate={{
        opacity: state.chatOpen ? 1 : 0,
        x: state.chatOpen ? 0 : -8,
        scale: state.chatOpen ? 1 : 0.97,
      }}
      transition={spring}
      style={{ pointerEvents: state.chatOpen ? "auto" : "none" }}
    >
      <header className="chat-header">
        <div className="avatar">
          <Sprout size={20} />
        </div>
        <div className="chat-name">
          <strong>Bito</strong>
          <span>
            {state.busy
              ? "Sedang memikirkan jawaban…"
              : state.sleeping
                ? "Sedang istirahat"
                : state.focus.running
                  ? "Menemanimu fokus"
                  : "Di sini, menemanimu"}
          </span>
        </div>
        <IconButton
          label="Settings"
          onClick={() => void act("show-settings", "settings")}
        >
          <SettingsIcon size={17} />
        </IconButton>
        <IconButton
          label="Tutup percakapan"
          onClick={() => void act("close-chat")}
        >
          <X size={18} />
        </IconButton>
      </header>
      <nav className="chat-tabs">
        {[
          ["chat", "Percakapan", MessageCircle],
          ["focus", "Fokus", Timer],
          ["tasks", "Langkah kecil", CheckCheck],
        ].map(([key, label, Icon]) => {
          const I = Icon as typeof Timer;
          return (
            <button
              key={String(key)}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key as typeof tab)}
            >
              <I size={14} />
              {String(label)}
              {tab === key && (
                <motion.span layoutId="chat-tab" className="tab-line" />
              )}
            </button>
          );
        })}
      </nav>
      <AnimatePresence mode="wait" initial={false}>
        {tab === "chat" ? (
          <motion.div
            key="messages"
            className="conversation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <div
              className="messages"
              ref={scroller}
              onScroll={() => {
                const el = scroller.current!;
                nearBottom.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 90;
              }}
            >
              {!state.messages.length && (
                <div className="empty-chat">
                  <div className="hello-icon">
                    <Heart size={22} />
                  </div>
                  <h2>Hai, {state.profile.name || "teman"}.</h2>
                  <p>
                    {state.profile.project
                      ? `Gimana kabar ${state.profile.project}? Kita bisa mulai dari satu hal kecil.`
                      : "Ada yang sedang memenuhi pikiranmu? Cerita saja. Kita urai pelan-pelan."}
                  </p>
                  <div className="suggestions">
                    {[
                      "Bantu aku mulai",
                      "Aku lagi mentok",
                      "Temani fokus 15 menit",
                    ].map((t) => (
                      <button
                        key={t}
                        onClick={() =>
                          t.includes("fokus")
                            ? void act("focus-start", 15)
                            : void send(t)
                        }
                      >
                        {t}
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {state.messages.map((m, i) => (
                <motion.article
                  layout="position"
                  key={m.id}
                  className={`message ${m.role} ${m.status === "error" ? "failed" : ""}`}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.18 }}
                >
                  {(i === 0 ||
                    new Date(m.createdAt).toDateString() !==
                      new Date(
                        state.messages[i - 1].createdAt,
                      ).toDateString()) && (
                    <time className="date-divider">
                      {new Date(m.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                      })}
                    </time>
                  )}
                  <div className="bubble">
                    {m.text ? (
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              onClick={(e) => {
                                e.preventDefault();
                                void act("open-link", href);
                              }}
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {m.text}
                      </Markdown>
                    ) : (
                      <span
                        className="typing"
                        aria-label="Bito sedang berpikir"
                      >
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </div>
                  {m.role === "assistant" && m.text && (
                    <div className="message-actions">
                      <button
                        aria-label="Salin jawaban"
                        onClick={() => void copy(m)}
                      >
                        {copied === m.id ? (
                          <Check size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                      <button
                        aria-label="Simpan sebagai catatan"
                        onClick={() => void act("save-note", m.text)}
                      >
                        <Bookmark size={12} />
                      </button>
                      {m.status === "interrupted" && <span>Dihentikan</span>}
                      {m.status === "error" && (
                        <button
                          onClick={() => {
                            const previous = state.messages
                              .slice(0, i)
                              .reverse()
                              .find((p) => p.role === "user");
                            if (previous) void send(previous.text);
                          }}
                        >
                          <RefreshCw size={12} /> Coba lagi
                        </button>
                      )}
                    </div>
                  )}
                </motion.article>
              ))}
            </div>
            {!state.hasKey && (
              <button
                className="connection-hint"
                onClick={() => void act("show-settings", "ai")}
              >
                <KeyRound size={14} />
                <span>Hubungkan AI untuk mulai ngobrol</span>
                <ChevronRight size={14} />
              </button>
            )}
            <div className="composer-area">
              {attachment && (
                <div className="attachment">
                  <FileText size={14} />
                  {attachment.name}
                  <button
                    aria-label="Lepas dokumen"
                    onClick={() => setAttachment(undefined)}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <IconButton
                  label="Lampirkan dokumen teks"
                  disabled={state.busy}
                  onClick={async () => {
                    const r = await act("read-document");
                    if (r.value) setAttachment(r.value as any);
                  }}
                >
                  <Plus size={20} />
                </IconButton>
                <textarea
                  ref={textarea}
                  aria-label="Pesan untuk Bito"
                  placeholder="Cerita ke Bito…"
                  rows={1}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 118)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                {state.busy ? (
                  <button
                    type="button"
                    className="send-button"
                    aria-label="Hentikan jawaban"
                    onClick={() => void act("stop")}
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    className="send-button"
                    aria-label="Kirim pesan"
                    disabled={(!text.trim() && !attachment) || !state.hasKey}
                  >
                    <ArrowUp size={19} />
                  </button>
                )}
              </form>
              <p className="chat-footnote">
                Bito adalah AI. Hal penting tetap perlu diperiksa.
              </p>
            </div>
          </motion.div>
        ) : tab === "focus" ? (
          <motion.div
            key="focus"
            className="chat-content"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Focus state={state} act={act} />
          </motion.div>
        ) : (
          <motion.div
            key="tasks"
            className="chat-content"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Tasks state={state} act={act} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
  );
}
function Focus({ state, act }: { state: Snapshot; act: Act }) {
  const [, update] = useState(0),
    [minutes, setMinutes] = useState(25);
  useEffect(() => {
    const t = setInterval(() => update((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = remaining(state.focus),
    active = !!state.focus.active,
    started = active || state.focus.running;
  const value = state.focus.running || started ? sec : minutes * 60;
  const progress =
    state.focus.running || started ? sec / state.focus.duration : 1;
  return (
    <div className="focus-view">
      <p className="eyebrow">SATU HAL DULU</p>
      <h2>Pelan-pelan, tetap maju.</h2>
      <p className="muted">
        {state.profile.project ||
          "Pilih satu hal kecil yang ingin kamu kerjakan."}
      </p>
      <div className="timer-ring">
        <svg viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="90" />
          <circle
            cx="100"
            cy="100"
            r="90"
            className="timer-progress"
            strokeDasharray={565.5}
            strokeDashoffset={565.5 * (1 - progress)}
          />
        </svg>
        <div>
          <strong>
            {Math.floor(value / 60)
              .toString()
              .padStart(2, "0")}
            :{(value % 60).toString().padStart(2, "0")}
          </strong>
          <span>
            {state.focus.running
              ? "Aku temani di sini"
              : started
                ? "Ambil napas sebentar"
                : "Waktunya buat kamu"}
          </span>
        </div>
      </div>
      {!started && (
        <div className="chips center">
          {[15, 25, 45].map((n) => (
            <button
              key={n}
              className={minutes === n ? "selected" : ""}
              onClick={() => setMinutes(n)}
            >
              {n} menit
            </button>
          ))}
        </div>
      )}
      <button
        className="primary full"
        onClick={() =>
          void act(
            state.focus.running
              ? "focus-pause"
              : started && sec > 0
                ? "focus-resume"
                : "focus-start",
            minutes,
          )
        }
      >
        {state.focus.running ? (
          <>
            <Pause size={16} /> Jeda sebentar
          </>
        ) : (
          <>
            <Play size={16} />{" "}
            {started && sec > 0 ? "Lanjutkan" : "Mulai fokus"}
          </>
        )}
      </button>
      {(started || active) && (
        <button className="text-button" onClick={() => void act("focus-end")}>
          Selesaikan sesi
        </button>
      )}
    </div>
  );
}
function Tasks({ state, act }: { state: Snapshot; act: Act }) {
  const [title, setTitle] = useState("");
  return (
    <section className="tasks-view">
      <p className="eyebrow">LANGKAH KECIL</p>
      <h2>Sedikit demi sedikit.</h2>
      <p className="muted">
        {state.profile.project || "Tidak perlu semuanya selesai hari ini."}
      </p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) {
            void act("task-add", title);
            setTitle("");
          }
        }}
      >
        <input
          aria-label="Tugas baru"
          placeholder="Satu hal yang bisa kamu lakukan…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <IconButton
          label="Tambah tugas"
          onClick={() => {
            if (title.trim()) {
              void act("task-add", title);
              setTitle("");
            }
          }}
        >
          <Plus size={18} />
        </IconButton>
      </form>
      <div className="task-list">
        {state.tasks.map((t) => (
          <button
            key={t.id}
            className={`task-row ${t.done ? "done" : ""}`}
            onClick={() => void act("task-toggle", t.id)}
          >
            <span className="checkbox">{t.done && <Check size={13} />}</span>
            {t.title}
          </button>
        ))}
      </div>
      {!state.tasks.length && (
        <p className="quiet-note">
          Mulai dari satu langkah. Aku akan bantu mengingatnya.
        </p>
      )}
    </section>
  );
}
function Studio({
  state,
  act,
  initial,
}: {
  state: Snapshot;
  act: Act;
  initial: string;
}) {
  const [page, setPage] = useState(
      initial === "settings" ? "profile" : initial,
    ),
    [saved, setSaved] = useState(false),
    [profile, setProfile] = useState(state.profile),
    [settings, setSettings] = useState(state.settings),
    [key, setKey] = useState(""),
    [testing, setTesting] = useState(false),
    [connection, setConnection] = useState(""),
    [memory, setMemory] = useState(""),
    [reminder, setReminder] = useState(""),
    [due, setDue] = useState("");
  useEffect(
    () => setPage(initial === "settings" ? "profile" : initial),
    [initial],
  );
  const save = async () => {
    const r = await act(
      page === "profile" ? "profile" : "settings",
      page === "profile" ? profile : settings,
    );
    if (r.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    }
  };
  const navigation = [
    ["profile", "Tentang kamu", User],
    ["personality", "Kepribadian", Heart],
    ["desktop", "Desktop", Monitor],
    ["ai", "Koneksi AI", KeyRound],
    ["reminders", "Pengingat", Bell],
    ["memory", "Memori & data", Shield],
  ] as const;
  return (
    <main className="studio">
      <aside>
        <span className="wordmark">
          bito<span>●</span>
        </span>
        <div className="sidebar-profile">
          <div className="avatar">
            <Sprout size={20} />
          </div>
          <div>
            <strong>{state.profile.name || "Teman Bito"}</strong>
            <small>Ruang kecilmu</small>
          </div>
        </div>
        <nav>
          {navigation.map(([value, label, Icon]) => (
            <button
              key={value}
              className={page === value ? "active" : ""}
              onClick={() => setPage(value)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <button className="sidebar-chat" onClick={() => void act("show-chat")}>
          <MessageCircle size={17} /> Kembali ngobrol <ArrowRight size={15} />
        </button>
        <small className="version">Bito 0.1 · Dibuat untuk menemani</small>
      </aside>
      <section className="settings-content">
        <div className="settings-heading">
          <p className="eyebrow">BIKIN SENYAMAN KAMU</p>
          <h1>
            {navigation.find((n) => n[0] === page)?.[1] || "Tentang kamu"}
          </h1>
          <p className="lead">
            {page === "ai"
              ? "Hubungkan model pilihanmu. API key disimpan di perangkat ini."
              : page === "memory"
                ? "Kamu yang menentukan apa yang Bito ingat."
                : "Hal-hal kecil yang membuat Bito terasa lebih dekat."}
          </p>
        </div>
        {page === "profile" && (
          <div className="settings-section">
            <Field label="Nama panggilan">
              <input
                value={profile.name}
                maxLength={40}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
              />
            </Field>
            <Field
              label="Proyek yang sedang kamu kerjakan"
              hint="Bito akan memakai konteks ini untuk membantu dengan lebih pas."
            >
              <textarea
                value={profile.project}
                maxLength={200}
                onChange={(e) =>
                  setProfile({ ...profile, project: e.target.value })
                }
              />
            </Field>
          </div>
        )}
        {page === "personality" && (
          <div className="settings-section">
            <Field label="Gaya bicara">
              <select
                value={profile.style}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    style: e.target.value as Profile["style"],
                  })
                }
              >
                <option value="warm">Hangat dan menyemangati</option>
                <option value="calm">Tenang dan lembut</option>
                <option value="direct">Langsung dan praktis</option>
              </select>
            </Field>
            <Field label="Bito boleh menyapa duluan">
              <select
                value={profile.proactive}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    proactive: e.target.value as Profile["proactive"],
                  })
                }
              >
                <option value="on-demand">Hanya saat dipanggil</option>
                <option value="sometimes">
                  Sesekali (maksimal satu kali per jam)
                </option>
                <option value="quiet">Mode tenang</option>
              </select>
            </Field>
            <button
              className="primary"
              onClick={async () => {
                const r = await act("profile", profile);
                if (r.ok) {
                  setSaved(true);
                  setTimeout(() => setSaved(false), 1800);
                }
              }}
            >
              {saved ? <Check size={16} /> : null}
              {saved ? "Tersimpan" : "Simpan kepribadian"}
            </button>
          </div>
        )}
        {page === "desktop" && (
          <div className="settings-section">
            <Field label={`Ukuran Bito · ${settings.size}px`}>
              <input
                type="range"
                min="130"
                max="260"
                value={settings.size}
                onChange={(e) =>
                  setSettings({ ...settings, size: Number(e.target.value) })
                }
              />
            </Field>
            <Toggle
              title="Selalu terlihat di atas jendela lain"
              checked={settings.alwaysOnTop}
              onChange={(v) => setSettings({ ...settings, alwaysOnTop: v })}
            />
            <Toggle
              title="Tampilkan saat komputer dinyalakan"
              checked={settings.launchAtLogin}
              onChange={(v) => setSettings({ ...settings, launchAtLogin: v })}
            />
            <Toggle
              title="Jangan ganggu"
              hint="Tunda notifikasi sampai kamu siap."
              checked={settings.dnd}
              onChange={(v) => setSettings({ ...settings, dnd: v })}
            />
            <Toggle
              title="Kurangi gerakan"
              hint="Transisi lebih tenang dan karakter tidak bergerak saat idle."
              checked={settings.reducedMotion}
              onChange={(v) => setSettings({ ...settings, reducedMotion: v })}
            />
            <Toggle
              title="Kurangi transparansi"
              checked={settings.reducedTransparency}
              onChange={(v) =>
                setSettings({ ...settings, reducedTransparency: v })
              }
            />
          </div>
        )}
        {page === "ai" && (
          <div className="settings-section">
            <div className="info-box">
              <KeyRound size={18} />
              <div>
                <strong>
                  {state.hasKey ? "API key sudah tersimpan" : "Belum terhubung"}
                </strong>
                <p>
                  Menggunakan Responses API. Biaya pemakaian mengikuti akun
                  penyedia AI kamu.
                </p>
              </div>
            </div>
            <Field
              label="Alamat API"
              hint="Default OpenAI. Endpoint lain harus mendukung Responses API. Mengubah alamat akan menghapus key lama."
            >
              <input
                value={settings.baseURL}
                onChange={(e) =>
                  setSettings({ ...settings, baseURL: e.target.value })
                }
              />
            </Field>
            <Field label="Model">
              <input
                value={settings.model}
                onChange={(e) =>
                  setSettings({ ...settings, model: e.target.value })
                }
              />
            </Field>
            <Field
              label={state.hasKey ? "Ganti API key (opsional)" : "API key"}
            >
              <input
                type="password"
                autoComplete="off"
                placeholder="Tempel API key milikmu"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </Field>
            <div className="button-row">
              <button
                className="primary"
                onClick={async () => {
                  const r = await act("settings", settings);
                  if (r.ok) {
                    if (key) {
                      const k = await act("api-key", key);
                      if (!k.ok) return;
                      setKey("");
                    }
                    setConnection("Pengaturan disimpan.");
                  }
                }}
              >
                Simpan koneksi
              </button>
              <button
                className="secondary"
                disabled={testing || !state.hasKey}
                onClick={async () => {
                  setTesting(true);
                  setConnection("");
                  try {
                    const r = await act("test-ai");
                    if (r.ok) setConnection(String(r.value));
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                {testing ? "Memeriksa…" : "Tes koneksi"}
              </button>
            </div>
            {connection && (
              <p role="status" className="success-note">
                <Check size={15} />
                {connection}
              </p>
            )}
            {state.hasKey && (
              <button
                className="text-button danger"
                onClick={() => void act("api-key", "")}
              >
                Hapus API key
              </button>
            )}
          </div>
        )}
        {page === "reminders" && (
          <div className="settings-section">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await act("reminder-add", {
                  title: reminder,
                  due: new Date(due).getTime(),
                });
                if (r.ok) {
                  setReminder("");
                  setDue("");
                }
              }}
            >
              <Field label="Ingatkan aku untuk…">
                <input
                  required
                  maxLength={240}
                  placeholder="Misalnya: kirim revisi ke dosen"
                  value={reminder}
                  onChange={(e) => setReminder(e.target.value)}
                />
              </Field>
              <Field label="Kapan?">
                <input
                  required
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </Field>
              <button className="primary" type="submit">
                <Plus size={16} /> Tambah pengingat
              </button>
            </form>
            <div className="reminder-list">
              {state.reminders.map((r) => (
                <div
                  key={r.id}
                  className={`reminder-row ${r.done ? "done" : ""}`}
                >
                  <Bell size={17} />
                  <div>
                    <strong>{r.title}</strong>
                    <small>
                      {new Date(r.due).toLocaleString("id-ID")}
                      {r.notified && !r.done ? " · Sudah diingatkan" : ""}
                    </small>
                  </div>
                  {r.done ? (
                    <Check size={16} />
                  ) : (
                    <>
                      <button
                        className="text-button"
                        onClick={() => void act("reminder-snooze", r.id)}
                      >
                        +10m
                      </button>
                      <IconButton
                        label="Tandai selesai"
                        onClick={() => void act("reminder-done", r.id)}
                      >
                        <Check size={17} />
                      </IconButton>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="quiet-note">
              Bito mengingatkan saat aplikasi berjalan. Pengingat yang terlewat
              diperiksa kembali saat aplikasi dibuka.
            </p>
          </div>
        )}
        {page === "memory" && (
          <div className="settings-section">
            <Field label="Sesuatu yang ingin Bito ingat">
              <div className="inline-form">
                <input
                  value={memory}
                  maxLength={500}
                  placeholder="Misalnya: aku lebih nyaman belajar sore"
                  onChange={(e) => setMemory(e.target.value)}
                />
                <IconButton
                  label="Simpan memori"
                  onClick={() => {
                    if (memory.trim()) {
                      void act("memory-add", memory);
                      setMemory("");
                    }
                  }}
                >
                  <Plus size={18} />
                </IconButton>
              </div>
            </Field>
            {state.memories.map((m) => (
              <div key={m.id} className="memory-row">
                <span>{m.text}</span>
                <IconButton
                  label="Hapus memori"
                  onClick={() => void act("memory-delete", m.id)}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            ))}
            <div className="data-actions">
              <button className="secondary" onClick={() => void act("export")}>
                <Download size={16} /> Ekspor data
              </button>
              <button
                className="secondary danger"
                onClick={() => void act("clear-chat")}
              >
                <Trash2 size={16} /> Hapus percakapan
              </button>
            </div>
            <p className="quiet-note">
              Profil, chat, dan memori tersimpan lokal. Saat mengirim pesan,
              konteks percakapan dan memori dikirim ke penyedia AI pilihanmu.
            </p>
          </div>
        )}
        {["profile", "desktop"].includes(page) && (
          <div className="save-bar">
            <span>
              {page === "profile" ? (
                <button
                  className="text-button"
                  onClick={() => void act("show-settings", "welcome")}
                >
                  Ulangi perkenalan
                </button>
              ) : (
                "Perubahan disimpan di perangkatmu."
              )}
            </span>
            <button className="primary" onClick={() => void save()}>
              {saved ? <Check size={16} /> : null}
              {saved ? "Tersimpan" : "Simpan perubahan"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Toggle({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{title}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
