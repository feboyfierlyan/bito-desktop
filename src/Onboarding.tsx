import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { api, isDesktop } from "./bridge";
import { Character } from "./Character";
import { Bubble } from "./Bubble";
import { bubbleReveal } from "./bubble-motion";
import { wordDelay } from "./handoff";
import { conversationTiming, ConversationCadence } from "./onboarding-cadence";
import type { Profile, Snapshot, Reply } from "./shared";
import "./Onboarding.css";

type Act = (name: string, payload?: unknown) => Promise<Reply>;
const personalities = [
  {
    value: "warm",
    title: "Hangat",
    example:
      "Oke, aku akan jadi teman yang hangat. Kita jalan pelan-pelan bareng, ya.",
  },
  {
    value: "calm",
    title: "Tenang",
    example:
      "Oke, aku akan menemanimu dengan tenang. Satu hal dulu, tanpa buru-buru.",
  },
  {
    value: "direct",
    title: "Langsung",
    example:
      "Siap. Aku akan bicara singkat, jelas, dan langsung bantu kamu menentukan langkah berikutnya.",
  },
] as const;

function SpeechBubble({
  text,
  ready,
  active,
  reduced,
  onTalking,
  onDone,
  delay = 0,
}: {
  text: string;
  ready: boolean;
  active: boolean;
  reduced: boolean;
  onTalking: (talking: boolean) => void;
  onDone: () => void;
  delay?: number;
}) {
  const words = text.split(/\s+/),
    [count, setCount] = useState(active ? 0 : words.length);
  const [entered, setEntered] = useState(!active);
  const callbacks = useRef({ onTalking, onDone });
  callbacks.current = { onTalking, onDone };
  useEffect(() => {
    if (!active) {
      setCount(words.length);
      setEntered(true);
      return;
    }
    setCount(0);
    setEntered(false);
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
      setEntered(true);
      callbacks.current.onTalking(false);
      callbacks.current.onDone();
    };
    if (reduced) {
      finish();
      return;
    }
    const reveal = () => {
      if (finished) return;
      setCount(++index);
      timer = setTimeout(
        index === tokens.length ? finish : reveal,
        wordDelay(tokens[index - 1]),
      );
    };
    timer = setTimeout(() => {
      setEntered(true);
      callbacks.current.onTalking(true);
      timer = setTimeout(reveal, 110);
    }, delay);
    return () => {
      finished = true;
      clearTimeout(timer);
      callbacks.current.onTalking(false);
    };
  }, [text, ready, active, reduced, delay]);
  const variants = bubbleReveal("bito", reduced);
  variants.surface.exit = {
    scaleX: reduced ? 1 : 0.32,
    scaleY: reduced ? 1 : 0.82,
    transition: { duration: reduced ? 0 : 0.2 },
  };
  variants.content.exit = {
    opacity: 0,
    transition: { duration: reduced ? 0 : 0.08 },
  };
  return (
    <motion.div
      role="article"
      aria-label={text}
      className="setup-speech bubble-shell bubble-shell-bito"
      variants={variants.shell}
      initial="hidden"
      animate={entered && (ready || !active) ? "visible" : "hidden"}
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
    </motion.div>
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
  type Turn = {
    id: string;
    side: "bito" | "user";
    text: string;
    step: number;
    kind?: "ack" | "instruction";
  };
  const name = profile.name.trim();
  const style = personalities.find((p) => p.value === profile.style)!;
  const helloId = `hello:${name}`;
  const ackId = `ack:${style.value}`;
  const instructionId = `instruction:${style.value}`;
  const [instructionStyle, setInstructionStyle] = useState<string | null>(null);
  const [activeTurn, setActiveTurn] = useState<string | null>(() =>
    step === 0 ? "intro" : step === 1 ? helloId : ackId,
  );
  const [replay, setReplay] = useState({ id: activeTurn, revision: 0 });
  const [turnRevisions, setTurnRevisions] = useState<Record<string, number>>(
    {},
  );
  const [direction, setDirection] = useState(1);
  const [responseStep, setResponseStep] = useState(step);
  const cadence = useRef(new ConversationCadence());
  const speechOwner = useRef<string | null>(null);
  const replayRevision = useRef(0);
  const stepRef = useRef(step);
  stepRef.current = step;
  const turns: Turn[] = [
    {
      id: "intro",
      side: "bito",
      text: "Aku boleh panggil kamu siapa?",
      step: 0,
    },
    { id: `name:${name}`, side: "user", text: name, step: 1 },
    {
      id: helloId,
      side: "bito",
      text: `Senang kenal kamu, ${name}. Mau aku jadi teman ngobrol yang seperti apa?`,
      step: 1,
    },
    { id: `choice:${style.value}`, side: "user", text: style.title, step: 2 },
    { id: ackId, side: "bito", text: style.example, step: 2, kind: "ack" },
    {
      id: instructionId,
      side: "bito",
      text: "Tahan aku, lalu seret keluar jendela ini. Kita mulai di desktop!",
      step: 2,
      kind: "instruction",
    },
  ];
  const visibleTurns = turns.filter(
    (turn) =>
      turn.step <= step &&
      (turn.side !== "bito" || turn.step < step || responseStep === step) &&
      (turn.kind !== "instruction" || instructionStyle === style.value),
  );
  const pointer = useRef<{ x: number; y: number; drag: boolean } | null>(null);
  const submitting = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cadence.current.cancel();
    };
  }, []);
  const [saving, setSaving] = useState(false),
    [localReady, setLocalReady] = useState(false);
  const slot = useRef<HTMLButtonElement>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restartInitialized = useRef(false);
  const latestAct = useRef(act);
  latestAct.current = act;
  const osReduced = useReducedMotion();
  const reduced = state.settings.reducedMotion || !!osReduced;
  const ready = isDesktop ? !!state.presentation?.characterReady : localReady;
  const phase = state.presentation?.phase || "anchored";
  const leaving = ["dragging", "returning", "departing"].includes(phase);
  const armed = phase === "ready";
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
    if (restart && !restartInitialized.current) {
      restartInitialized.current = true;
      void latestAct.current("onboarding", {
        step: 0,
        profile: {
          ...state.profile,
          name: state.profile.name.trim() || "Teman",
        },
        complete: false,
      });
    }
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
      cadence.current.cancel();
      void api.command("onboarding-speech", false);
    };
  }, []);
  useEffect(() => {
    clearTimeout(armTimer.current);
  }, [step, activeTurn]);
  useEffect(() => {
    if (leaving) cadence.current.cancel();
  }, [leaving]);
  const queueInstruction = () => {
    cadence.current.schedule(
      reduced ? 0 : conversationTiming.nextMessage,
      () => {
        if (!alive.current || stepRef.current !== 2) return;
        setInstructionStyle(style.value);
        setActiveTurn(instructionId);
      },
    );
  };
  const moveStep = async (next: number) => {
    if (
      submitting.current ||
      leaving ||
      next < 0 ||
      next > 2 ||
      (next > step && !profile.name.trim())
    )
      return;
    submitting.current = true;
    setSaving(true);
    clearTimeout(armTimer.current);
    cadence.current.cancel();
    try {
      const result = await act("onboarding", {
        step: next,
        profile: {
          ...profile,
          name: profile.name.trim() || state.profile.name || "Teman",
        },
        complete: false,
      });
      if (result.ok && alive.current) {
        const forward = next > step;
        setDirection(forward ? 1 : -1);
        speechOwner.current = null;
        void api.command("onboarding-speech", false);
        stepRef.current = next;
        setStep(next);
        const target = next === 0 ? "intro" : next === 1 ? helloId : ackId;
        // Only the destination replays. Retained history keeps its identity.
        if (next === 2) setInstructionStyle(null);
        replayRevision.current += 1;
        setReplay({ id: target, revision: replayRevision.current });
        setTurnRevisions((previous) => ({
          ...previous,
          [target]: replayRevision.current,
        }));
        if (forward) {
          // The user's message lands first; no invisible assistant row reserves
          // space or pushes the conversation before Bito actually responds.
          setResponseStep(-1);
          setActiveTurn(null);
          cadence.current.schedule(
            reduced ? 0 : conversationTiming.reply,
            () => {
              if (!alive.current || stepRef.current !== next) return;
              setResponseStep(next);
              setActiveTurn(target);
            },
          );
        } else {
          setResponseStep(next);
          setActiveTurn(target);
        }
      }
    } finally {
      submitting.current = false;
      if (alive.current) setSaving(false);
    }
  };
  const speechDone = (turn: Turn, revision: number) => {
    if (revision !== replayRevision.current || turn.id !== activeTurn) return;
    setActiveTurn(null);
    if (turn.kind === "ack" && stepRef.current === 2) queueInstruction();
  };
  const transition = {
    duration: reduced ? 0 : 0.22,
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
          <AnimatePresence mode="sync" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={{
                enter: (d: number) => ({ opacity: 0, y: reduced ? 0 : d * 7 }),
                show: { opacity: 1, y: 0 },
                leave: (d: number) => ({ opacity: 0, y: reduced ? 0 : d * -7 }),
              }}
              initial="enter"
              animate="show"
              exit="leave"
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
            aria-label={
              step < 2
                ? "Sapa Bito"
                : armed
                  ? "Seret Bito ke desktop"
                  : "Bito sedang bersiap"
            }
            title={step < 2 ? "Sapa Bito" : undefined}
            disabled={!ready || phase === "returning" || phase === "departing"}
            onClick={() => {
              if (step < 2) void act("onboarding-wave");
            }}
            onPointerDown={(e) => {
              if (step !== 2 || !armed || e.button !== 0) return;
              e.preventDefault();
              pointer.current = { x: e.screenX, y: e.screenY, drag: true };
              e.currentTarget.setPointerCapture(e.pointerId);
              api.dragStart();
            }}
            onPointerMove={(e) => {
              const p = pointer.current;
              if (!p) return;
              const dx = e.screenX - p.x,
                dy = e.screenY - p.y;
              if (p.drag) api.dragMove(dx, dy);
            }}
            onPointerUp={(e) => {
              if (e.button !== 0) return;
              const p = pointer.current;
              pointer.current = null;
              if (p?.drag) api.dragEnd();
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => {
              if (pointer.current?.drag) void api.command("drag-cancel");
              pointer.current = null;
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
            <div
              className="setup-transcript"
              role="log"
              aria-label="Percakapan perkenalan"
            >
              <div className="setup-transcript-stack">
                <AnimatePresence mode="sync" initial={false}>
                  {visibleTurns.map((turn) => (
                    <motion.div
                      key={turn.id}
                      className={`setup-turn setup-turn-${turn.side}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: {
                          duration: reduced
                            ? 0
                            : conversationTiming.flow / 1000,
                          ease: [0.22, 1, 0.36, 1],
                        },
                        opacity: { duration: reduced ? 0 : 0.16 },
                      }}
                    >
                      <div className="setup-turn-content">
                        {turn.side === "bito" ? (
                          <div className="setup-speech-replay">
                            <AnimatePresence mode="sync">
                              <SpeechBubble
                                key={`${turn.id}:${turnRevisions[turn.id] || 0}`}
                                text={turn.text}
                                ready={ready}
                                active={turn.id === activeTurn}
                                reduced={reduced}
                                delay={
                                  direction < 0 && turn.id === replay.id
                                    ? conversationTiming.reverseReveal
                                    : 0
                                }
                                onTalking={(value) => {
                                  const owner = `${turn.id}:${replay.revision}`;
                                  if (
                                    value &&
                                    turn.id === activeTurn &&
                                    replay.revision === replayRevision.current
                                  ) {
                                    speechOwner.current = owner;
                                    void api.command("onboarding-speech", true);
                                  } else if (
                                    !value &&
                                    speechOwner.current === owner
                                  ) {
                                    speechOwner.current = null;
                                    void api.command(
                                      "onboarding-speech",
                                      false,
                                    );
                                  }
                                }}
                                onDone={() => speechDone(turn, replay.revision)}
                              />
                            </AnimatePresence>
                          </div>
                        ) : (
                          <Bubble
                            side="user"
                            className="setup-user-reply"
                            reduced={reduced}
                          >
                            {turn.text}
                          </Bubble>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
            <div className="setup-reply-slot">
              <AnimatePresence mode="sync" initial={false} custom={direction}>
                <motion.div
                  key={step}
                  className="setup-reply"
                  custom={direction}
                  variants={{
                    enter: (d: number) => ({
                      opacity: 0,
                      y: reduced ? 0 : d * 7,
                    }),
                    show: { opacity: 1, y: 0, pointerEvents: "auto" },
                    leave: (d: number) => ({
                      opacity: 0,
                      y: reduced ? 0 : d * -7,
                      pointerEvents: "none",
                    }),
                  }}
                  initial="enter"
                  animate="show"
                  exit="leave"
                  transition={transition}
                >
                  {step === 0 && (
                    <form
                      className="setup-composer"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void moveStep(1);
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
                  {step === 1 && (
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
                        onClick={() => void moveStep(2)}
                        whileTap={reduced ? undefined : { scale: 0.89 }}
                      >
                        <ArrowUp size={19} strokeWidth={2.6} />
                      </motion.button>
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
