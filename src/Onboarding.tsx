import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Heart,
  Leaf,
  Zap,
  MousePointer2,
  Move,
  MoreHorizontal,
  Keyboard,
} from "lucide-react";
import { api, isDesktop } from "./bridge";
import { Character } from "./Character";
import { wordDelay } from "./handoff";
import type { Profile, Snapshot, Reply } from "./shared";
import "./Onboarding.css";

type Act = (name: string, payload?: unknown) => Promise<Reply>;
const personalities = [
  {
    value: "warm",
    title: "Hangat",
    hint: "Ramah & menyemangati",
    Icon: Heart,
    example:
      "Pelan-pelan juga nggak apa-apa. Kita mulai dari satu langkah kecil, ya?",
  },
  {
    value: "calm",
    title: "Tenang",
    hint: "Lembut & menenangkan",
    Icon: Leaf,
    example:
      "Tarik napas dulu. Satu hal dalam satu waktu. Aku di sini menemanimu.",
  },
  {
    value: "direct",
    title: "Langsung",
    hint: "Ringkas & membantu",
    Icon: Zap,
    example:
      "Kita buat lebih ringan. Pilih satu tugas, pecah jadi langkah kecil, lalu mulai.",
  },
] as const;

function SpeechBubble({
  text,
  ready,
  reduced,
  onTalking,
  onDone,
}: {
  text: string;
  ready: boolean;
  reduced: boolean;
  onTalking: (talking: boolean) => void;
  onDone: () => void;
}) {
  const words = text.split(/\s+/),
    [count, setCount] = useState(0);
  const callbacks = useRef({ onTalking, onDone });
  callbacks.current = { onTalking, onDone };
  const skip = useRef<() => void>(() => {});
  useEffect(() => {
    setCount(0);
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout>,
      finished = false,
      index = 0;
    const tokens = text.split(/\s+/);
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      setCount(tokens.length);
      callbacks.current.onTalking(false);
      callbacks.current.onDone();
    };
    skip.current = finish;
    if (reduced) {
      finish();
      return;
    }
    callbacks.current.onTalking(true);
    const reveal = () => {
      if (finished) return;
      setCount(++index);
      timer = setTimeout(
        index === tokens.length ? finish : reveal,
        wordDelay(tokens[index - 1]),
      );
    };
    timer = setTimeout(reveal, 170);
    return () => {
      finished = true;
      clearTimeout(timer);
      callbacks.current.onTalking(false);
      skip.current = () => {};
    };
  }, [text, ready, reduced]);
  return (
    <motion.button
      type="button"
      className="setup-speech"
      aria-label={text}
      title="Klik untuk menampilkan seluruh kalimat"
      onClick={() => skip.current()}
      initial={{ opacity: 0, scale: reduced ? 1 : 0.94, y: reduced ? 0 : 5 }}
      animate={{ opacity: ready ? 1 : 0, scale: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <span aria-hidden="true">
        {words.map((word, i) => (
          <span className={`setup-word ${i < count ? "revealed" : ""}`} key={i}>
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
      <svg className="setup-tail" viewBox="0 0 36 30" aria-hidden="true">
        <path d="M36 0H11C14 15 9 24 0 29C15 29 27 25 36 17Z" />
      </svg>
    </motion.button>
  );
}

export function Onboarding({
  state,
  act,
  restart = false,
}: {
  state: Snapshot;
  act: Act;
  restart?: boolean;
}) {
  const [step, setStep] = useState(restart ? 0 : state.onboardingStep);
  const [profile, setProfile] = useState<Profile>(state.profile);
  const [line, setLine] = useState(
    "Hai, aku Bito. Teman kecil yang akan menemani harimu. Aku boleh panggil kamu siapa?",
  );
  const [saving, setSaving] = useState(false),
    [localReady, setLocalReady] = useState(false);
  const slot = useRef<HTMLDivElement>(null),
    armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestAct = useRef(act);
  latestAct.current = act;
  const osReduced = useReducedMotion();
  const reduced = state.settings.reducedMotion || !!osReduced;
  const ready = isDesktop ? !!state.presentation?.characterReady : localReady;
  const phase = state.presentation?.phase || "anchored";
  const leaving =
    phase === "dragging" || phase === "returning" || phase === "departing";
  const armed = phase === "ready";
  const update = (p: Partial<Profile>) =>
    setProfile((previous) => ({ ...previous, ...p }));
  const save = (nextStep: number, nextProfile = profile) =>
    latestAct.current("onboarding", {
      step: nextStep,
      profile: { ...nextProfile, name: nextProfile.name.trim() },
      complete: false,
    });

  useEffect(() => {
    // Re-entering onboarding starts at the first screen; draft resume keeps its step.
    if (restart)
      void latestAct.current("onboarding", {
        step: 0,
        profile: {
          ...state.profile,
          name: state.profile.name.trim() || "Teman",
        },
        complete: false,
      });
  }, []);
  useEffect(() => {
    const measure = () => {
      if (!isDesktop || !slot.current) return;
      const b = slot.current.getBoundingClientRect();
      void api.command("onboarding-anchor", {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    if (slot.current) observer.observe(slot.current);
    measure();
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      clearTimeout(armTimer.current);
      void api.command("onboarding-speech", false);
    };
  }, []);
  useEffect(() => {
    clearTimeout(armTimer.current);
    if (step === 0) {
      const name = profile.name.trim();
      const timer = setTimeout(
        () =>
          setLine(
            name
              ? `Senang kenal kamu, ${name}. Kita bisa ngobrol, cari ide, atau mulai satu langkah kecil bareng.`
              : "Hai, aku Bito. Teman kecil yang akan menemani harimu. Aku boleh panggil kamu siapa?",
          ),
        name ? 650 : 0,
      );
      return () => clearTimeout(timer);
    }
    if (step === 1)
      setLine(personalities.find((p) => p.value === profile.style)!.example);
    if (step === 2)
      setLine(
        `Siap, ${profile.name.trim() || "teman"}? Tahan aku, lalu seret keluar jendela ini. Kita ketemu di desktop!`,
      );
  }, [step, profile.style, profile.name]);
  const moveStep = async (nextStep: number) => {
    if (saving || leaving || !profile.name.trim()) return;
    setSaving(true);
    try {
      const result = await save(nextStep);
      if (result.ok) setStep(nextStep);
    } finally {
      setSaving(false);
    }
  };
  const speechDone = () => {
    if (step !== 2 || !ready) return;
    clearTimeout(armTimer.current);
    armTimer.current = setTimeout(
      () => {
        void api.command("onboarding-arm");
      },
      reduced ? 0 : 650,
    );
  };
  return (
    <main className={`setup ${leaving ? "setup-leaving" : ""}`}>
      <div className="setup-titlebar" aria-hidden="true" />
      <section className="setup-scene" aria-label="Bito berkenalan denganmu">
        <span className="setup-brand">
          bito<span>●</span>
        </span>
        <div
          ref={slot}
          className={`setup-character ${armed ? "setup-character-ready" : ""}`}
        >
          {!isDesktop && (
            <Character
              state={{
                ...state,
                presentation: {
                  phase: "anchored",
                  talking: state.presentation?.talking || false,
                  characterReady: localReady,
                  step,
                },
              }}
              onReady={() => setLocalReady(true)}
            />
          )}
        </div>
        <AnimatePresence>
          {!leaving && (
            <motion.div
              className="setup-speech-position"
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
            >
              <SpeechBubble
                key={`${step}:${line}`}
                text={line}
                ready={ready}
                reduced={reduced}
                onTalking={(value) => {
                  void api.command("onboarding-speech", value);
                }}
                onDone={speechDone}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="setup-scene-caption" aria-live="polite">
          {phase === "departing"
            ? "Sampai ketemu di desktop."
            : phase === "returning"
              ? "Coba lagi. Seret aku melewati tepi jendela."
              : phase === "dragging"
                ? "Lepaskan di desktop untuk mulai."
                : step === 2 && armed
                  ? "Tahan dan seret aku keluar jendela"
                  : "Teman untuk langkah kecilmu."}
        </div>
      </section>
      <section className="setup-panel">
        <nav className="setup-navigation" aria-label="Progres perkenalan">
          <button
            aria-label="Langkah sebelumnya"
            disabled={step === 0 || saving || leaving}
            onClick={() => void moveStep(step - 1)}
          >
            <ArrowLeft size={20} />
          </button>
          <div
            className="setup-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={3}
            aria-valuenow={step + 1}
            aria-label={`Langkah ${step + 1} dari 3`}
          >
            {[0, 1, 2].map((i) => (
              <span key={i} className={i <= step ? "complete" : ""} />
            ))}
          </div>
          <button
            aria-label="Langkah berikutnya"
            disabled={step === 2 || !profile.name.trim() || saving || leaving}
            onClick={() => void moveStep(step + 1)}
          >
            <ArrowRight size={20} />
          </button>
        </nav>
        <div className="setup-content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: reduced ? 0 : 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduced ? 0 : -10 }}
              transition={{ duration: reduced ? 0 : 0.18 }}
            >
              <p className="setup-step-label">
                {
                  ["SENANG BISA KENAL", "BIAR TERASA COCOK", "BAWA AKU PULANG"][
                    step
                  ]
                }
              </p>
              <h1>
                {
                  [
                    "Hai, kita kenalan dulu.",
                    "Teman seperti apa?",
                    "Desktopmu, rumah baruku.",
                  ][step]
                }
              </h1>
              <p className="setup-description">
                {
                  [
                    "Aku Bito. Untuk hari yang sibuk, ide yang belum ketemu, dan hal kecil yang ingin kamu mulai.",
                    "Pilih cara ngobrol yang paling nyaman buatmu. Kamu bisa mengubahnya kapan saja.",
                    "Tiga hal kecil sebelum kita mulai. Setelah itu, seret aku keluar dari jendela ini.",
                  ][step]
                }
              </p>
              {step === 0 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void moveStep(1);
                  }}
                >
                  <label className="setup-name">
                    Aku boleh panggil kamu siapa?
                    <input
                      autoFocus
                      autoComplete="given-name"
                      placeholder="Nama panggilanmu"
                      maxLength={40}
                      value={profile.name}
                      onChange={(e) => update({ name: e.target.value })}
                    />
                  </label>
                  <button
                    type="submit"
                    className="primary setup-next"
                    disabled={!profile.name.trim() || saving}
                  >
                    Kenalan, yuk <ArrowRight size={16} />
                  </button>
                  <p className="setup-footnote">
                    Nggak perlu akun. Kita mulai dari namamu saja.
                  </p>
                </form>
              )}
              {step === 1 && (
                <>
                  <div
                    className="setup-personalities"
                    role="radiogroup"
                    aria-label="Gaya bicara Bito"
                  >
                    {personalities.map(({ value, title, hint, Icon }) => (
                      <button
                        key={value}
                        role="radio"
                        aria-checked={profile.style === value}
                        className={profile.style === value ? "selected" : ""}
                        onClick={() => update({ style: value })}
                      >
                        <Icon size={22} strokeWidth={1.6} />
                        <strong>{title}</strong>
                        <small>{hint}</small>
                        <span className="setup-card-check">
                          {profile.style === value && (
                            <Check size={12} strokeWidth={3} />
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="primary setup-next setup-next-wide"
                    disabled={saving}
                    onClick={() => void moveStep(2)}
                  >
                    Rasanya cocok <ArrowRight size={16} />
                  </button>
                  <p className="setup-footnote">
                    Coba pilih kartu. Dengarkan caraku lewat kata-kata.
                  </p>
                </>
              )}
              {step === 2 && (
                <>
                  <div className="setup-tips">
                    {[
                      {
                        Icon: MousePointer2,
                        title: "Klik sekali",
                        detail: "Chat muncul di sebelah kananku.",
                      },
                      {
                        Icon: Move,
                        title: "Tahan & seret",
                        detail: "Pindahkan aku tanpa membuka chat.",
                      },
                      {
                        Icon: MoreHorizontal,
                        title: "Klik kanan",
                        detail: "Fokus, pengingat, dan pengaturan.",
                      },
                    ].map(({ Icon, title, detail }) => (
                      <div key={title}>
                        <span>
                          <Icon size={18} strokeWidth={1.7} />
                        </span>
                        <p>
                          <strong>{title}</strong>
                          <small>{detail}</small>
                        </p>
                      </div>
                    ))}
                  </div>
                  <label className="setup-proactive">
                    Boleh menyapa duluan?
                    <select
                      disabled={leaving}
                      value={profile.proactive}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          proactive: e.target.value as Profile["proactive"],
                        };
                        update(next);
                        void save(2, next);
                      }}
                    >
                      <option value="sometimes">Sesekali, dengan lembut</option>
                      <option value="on-demand">Hanya saat aku panggil</option>
                      <option value="quiet">Mode tenang</option>
                    </select>
                  </label>
                  <div className={`setup-drag-cue ${armed ? "armed" : ""}`}>
                    <Move size={17} />
                    <span>
                      {leaving
                        ? "Bito sedang pindah…"
                        : armed
                          ? "Sekarang, bawa aku ke desktopmu."
                          : "Sebentar, Bito sedang menyapa…"}
                    </span>
                  </div>
                  {isDesktop ? (
                    <button
                      className="setup-keyboard"
                      disabled={!armed}
                      onClick={() => void act("onboarding-keyboard")}
                    >
                      <Keyboard size={14} /> Pindahkan tanpa menyeret
                    </button>
                  ) : (
                    <p className="setup-footnote">
                      Buka aplikasi desktop untuk mencoba perpindahan Bito.
                    </p>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <p className="setup-bottom">
          Pribadi. Bisa diatur. Hadir saat kamu butuh.
        </p>
      </section>
    </main>
  );
}
