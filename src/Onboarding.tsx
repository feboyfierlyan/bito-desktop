import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, ArrowUp, Move } from "lucide-react";
import { api, isDesktop } from "./bridge";
import { Character } from "./Character";
import { Bubble } from "./Bubble";
import { bubbleReveal } from "./bubble-motion";
import { wordDelay } from "./handoff";
import type { Profile, Snapshot, Reply } from "./shared";
import "./Onboarding.css";

type Act = (name: string, payload?: unknown) => Promise<Reply>;
const personalities = [
  {
    value: "warm",
    title: "Hangat",
    example: "Pelan-pelan juga nggak apa-apa. Kita mulai bareng, ya?",
  },
  {
    value: "calm",
    title: "Tenang",
    example: "Satu hal dulu. Tarik napas, aku di sini menemanimu.",
  },
  {
    value: "direct",
    title: "Langsung",
    example: "Pilih satu tugas. Kita pecah jadi langkah kecil, lalu mulai.",
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
  const variants = bubbleReveal("bito", reduced);
  return (
    <motion.button
      type="button"
      aria-label={text}
      title="Klik untuk menampilkan seluruh kalimat"
      onClick={() => skip.current()}
      className="setup-speech bubble-shell bubble-shell-bito"
      variants={variants.shell}
      initial="hidden"
      animate={ready ? "visible" : "hidden"}
      exit="exit"
    >
      <motion.span
        aria-hidden="true"
        className="bubble-surface"
        variants={variants.surface}
      >
        <svg className="setup-tail" viewBox="0 0 36 30">
          <path d="M36 0H11C14 15 9 24 0 29C15 29 27 25 36 17Z" />
        </svg>
      </motion.span>
      <motion.span
        className="bubble-content"
        variants={variants.content}
        aria-hidden="true"
      >
        {words.map((word, i) => (
          <span className={`setup-word ${i < count ? "revealed" : ""}`} key={i}>
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </motion.span>
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
  const [styleTouched, setStyleTouched] = useState(false);
  const [submittedReply, setSubmittedReply] = useState<string | null>(null);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const submitting = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(submitTimer.current);
    };
  }, []);
  const [saving, setSaving] = useState(false),
    [localReady, setLocalReady] = useState(false);
  const slot = useRef<HTMLButtonElement>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestAct = useRef(act);
  latestAct.current = act;
  const osReduced = useReducedMotion();
  const reduced = state.settings.reducedMotion || !!osReduced;
  const ready = isDesktop ? !!state.presentation?.characterReady : localReady;
  const phase = state.presentation?.phase || "anchored";
  const leaving = ["dragging", "returning", "departing"].includes(phase);
  const armed = phase === "ready";
  const line =
    step === 0
      ? "Aku boleh panggil kamu siapa?"
      : step === 1
        ? styleTouched
          ? personalities.find((p) => p.value === profile.style)!.example
          : `Senang kenal kamu, ${profile.name.trim()}. Mau aku jadi teman ngobrol yang seperti apa?`
        : "Tahan aku, lalu seret keluar jendela ini. Kita mulai di desktop!";
  const heading = [
    {
      title: "Hai, aku Bito.",
      description: "Teman kecil untuk menemani harimu.",
    },
    {
      title: "Biar terasa cocok.",
      description: "Pilih cara ngobrol yang paling nyaman buatmu.",
    },
    {
      title: "Bawa aku ke desktopmu.",
      description:
        "Klik untuk ngobrol. Seret untuk pindah. Klik kanan untuk pilihan.",
    },
  ][step];

  useEffect(() => {
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
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!isDesktop || !slot.current) return;
        const b = slot.current.getBoundingClientRect();
        void api.command("onboarding-anchor", {
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
        });
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    if (slot.current) observer.observe(slot.current);
    measure();
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      clearTimeout(armTimer.current);
      void api.command("onboarding-speech", false);
    };
  }, []);
  useEffect(() => {
    clearTimeout(armTimer.current);
  }, [step, line]);
  const moveStep = async (next: number, asReply = false) => {
    if (
      submitting.current ||
      saving ||
      leaving ||
      !profile.name.trim() ||
      next < 0 ||
      next > 2
    )
      return;
    submitting.current = true;
    setSaving(true);
    if (asReply)
      setSubmittedReply(
        step === 0
          ? profile.name.trim()
          : personalities.find((p) => p.value === profile.style)!.title,
      );
    try {
      const result = await act("onboarding", {
        step: next,
        profile: { ...profile, name: profile.name.trim() },
        complete: false,
      });
      if (result.ok) {
        if (asReply && !reduced)
          await new Promise<void>((resolve) => {
            submitTimer.current = setTimeout(resolve, 380);
          });
        if (alive.current) {
          setStyleTouched(false);
          setStep(next);
        }
      }
    } finally {
      submitting.current = false;
      if (alive.current) {
        setSaving(false);
        setSubmittedReply(null);
      }
    }
  };
  const speechDone = () => {
    if (step !== 2 || !ready) return;
    clearTimeout(armTimer.current);
    armTimer.current = setTimeout(
      () => {
        void api.command("onboarding-arm");
      },
      reduced ? 0 : 350,
    );
  };
  const transition = {
    duration: reduced ? 0 : 0.18,
    ease: [0.22, 1, 0.36, 1] as const,
  };
  return (
    <main
      className={`setup setup-conversation ${leaving ? "setup-leaving" : ""}`}
    >
      <div className="setup-titlebar" aria-hidden="true" />
      <nav className="setup-navigation" aria-label="Progres perkenalan">
        <button
          aria-label="Langkah sebelumnya"
          disabled={step === 0 || saving || leaving}
          onClick={() => void moveStep(step - 1)}
        >
          <ArrowLeft size={19} />
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
          <ArrowRight size={19} />
        </button>
      </nav>
      <div className="setup-layout">
        <header className="setup-heading">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: reduced ? 0 : 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -4 }}
              transition={transition}
            >
              <h1>{heading.title}</h1>
              <p className="setup-description">{heading.description}</p>
            </motion.div>
          </AnimatePresence>
        </header>
        <section
          className="setup-scene"
          aria-label="Percakapan perkenalan dengan Bito"
        >
          <button
            type="button"
            ref={slot}
            aria-label={step < 2 ? "Sapa Bito" : "Bito siap diseret ke desktop"}
            title={step < 2 ? "Sapa Bito" : undefined}
            disabled={step === 2 || !ready}
            onClick={() => {
              if (step < 2) void act("onboarding-wave");
            }}
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
                    wave: state.presentation?.wave,
                  },
                }}
                onReady={() => setLocalReady(true)}
              />
            )}
          </button>
          <motion.div
            className="setup-dialogue"
            animate={{ opacity: leaving ? 0 : 1 }}
            transition={{ duration: reduced ? 0 : 0.14 }}
            inert={leaving}
          >
            <div className="setup-bubble-slot">
              <AnimatePresence mode="wait" initial={false}>
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
              </AnimatePresence>
            </div>
            <div className="setup-reply-slot">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  className="setup-reply"
                  initial={{ opacity: 0, y: reduced ? 0 : 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduced ? 0 : -4 }}
                  transition={transition}
                >
                  {submittedReply && (
                    <Bubble
                      side="user"
                      className="setup-user-reply"
                      reduced={reduced}
                    >
                      {submittedReply}
                    </Bubble>
                  )}
                  {step === 0 && !submittedReply && (
                    <form
                      className="setup-composer"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void moveStep(1, true);
                      }}
                    >
                      <input
                        autoFocus
                        aria-label="Nama panggilanmu"
                        autoComplete="given-name"
                        placeholder="Namamu…"
                        maxLength={40}
                        value={profile.name}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, name: e.target.value }))
                        }
                      />
                      <motion.button
                        type="submit"
                        className="setup-send"
                        aria-label="Kirim nama"
                        title="Kirim nama"
                        disabled={!profile.name.trim() || saving}
                        whileTap={reduced ? undefined : { scale: 0.89 }}
                      >
                        <ArrowUp size={19} strokeWidth={2.6} />
                      </motion.button>
                    </form>
                  )}
                  {step === 1 && !submittedReply && (
                    <div className="setup-choice-reply">
                      <div
                        className="setup-choices"
                        role="radiogroup"
                        aria-label="Gaya bicara Bito"
                      >
                        {personalities.map((p) => (
                          <motion.button
                            key={p.value}
                            role="radio"
                            aria-checked={profile.style === p.value}
                            className={
                              profile.style === p.value ? "selected" : ""
                            }
                            onClick={() => {
                              setProfile((previous) => ({
                                ...previous,
                                style: p.value,
                              }));
                              setStyleTouched(true);
                            }}
                            whileTap={reduced ? undefined : { scale: 0.95 }}
                          >
                            {profile.style === p.value && (
                              <motion.span
                                layoutId="setup-choice-selection"
                                className="setup-choice-selection"
                                transition={{
                                  type: "spring",
                                  stiffness: 420,
                                  damping: 35,
                                }}
                              />
                            )}
                            <span>{p.title}</span>
                          </motion.button>
                        ))}
                      </div>
                      <motion.button
                        className="setup-send"
                        aria-label="Lanjut dengan gaya ini"
                        title="Lanjut"
                        disabled={saving}
                        onClick={() => void moveStep(2, true)}
                        whileTap={reduced ? undefined : { scale: 0.89 }}
                      >
                        <ArrowUp size={19} strokeWidth={2.6} />
                      </motion.button>
                    </div>
                  )}
                  {step === 2 && (
                    <div className="setup-desktop-reply">
                      {isDesktop && (
                        <motion.button
                          className="setup-desktop-action"
                          aria-label="Pindahkan Bito ke desktop tanpa menyeret"
                          title="Pindahkan tanpa menyeret"
                          disabled={!armed}
                          onClick={() => void act("onboarding-keyboard")}
                          whileTap={reduced ? undefined : { scale: 0.92 }}
                        >
                          <Move size={18} />
                        </motion.button>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
