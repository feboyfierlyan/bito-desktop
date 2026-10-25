import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, LoaderCircle, WifiOff, CircleAlert } from "lucide-react";
import { api, isDesktop } from "./bridge";
import { Character } from "./Character";
import { useSetupScene } from "./setup-context";
import { loginMessages, loginStage, pendingLogin } from "./auth-scene";
import type { Snapshot } from "./shared";
import "./AuthWindow.css";

export function AuthWindow({ state }: { state: Snapshot }) {
  const sharedScene = useSetupScene();
  const [busy, setBusy] = useState<"google" | "retry" | "account" | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    kind: "info" | "error";
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [feedbackHeight, setFeedbackHeight] = useState(0);
  const feedbackContent = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null),
    running = useRef(false),
    alive = useRef(true);
  const reduced = useReducedMotion() || state.settings.reducedMotion;
  const stage = loginStage(state.auth, busy, state.loginPreview);
  const pending = pendingLogin(stage),
    waiting = ["opening", "waiting"].includes(stage);
  const retry = ["offline", "error"].includes(stage);
  const alternate = stage === "denied" || stage === "offline";
  const message = notice?.text || state.auth?.error || loginMessages[stage];
  const hasFeedback = !!message;
  const severity =
    notice?.kind ||
    (stage === "idle" && !state.auth?.configured
      ? "info"
      : ["denied", "offline", "error"].includes(stage)
        ? "error"
        : "info");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => setNotice(null), [stage, state.loginPreview]);
  useEffect(() => {
    const content = feedbackContent.current;
    if (!hasFeedback || !content) return;
    const measure = () =>
      setFeedbackHeight(content.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [hasFeedback]);
  useEffect(() => {
    if (!isDesktop || !slot.current) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = slot.current?.getBoundingClientRect();
        if (rect)
          void api.command("auth-anchor", {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          });
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(slot.current);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const run = async (command: string) => {
    if (running.current) return;
    setNotice(null);
    if (
      !state.auth?.configured &&
      state.loginPreview &&
      state.loginPreview !== "idle"
    ) {
      await api.command("auth-cancel");
      return;
    }
    if (!state.auth?.configured && command !== "auth-cancel") {
      setNotice({
        kind: "info",
        text: "Koneksi akun belum disiapkan untuk preview ini.",
      });
      return;
    }
    running.current = true;
    setBusy(
      command === "auth-google"
        ? "google"
        : command === "auth-retry"
          ? "retry"
          : "account",
    );
    try {
      const result = await api.command(command);
      if (!result.ok && alive.current)
        setNotice({
          kind: "error",
          text: result.error || "Belum berhasil masuk. Coba lagi.",
        });
    } catch {
      if (alive.current)
        setNotice({ kind: "error", text: "Belum bisa terhubung. Coba lagi." });
    } finally {
      running.current = false;
      if (alive.current) setBusy(null);
    }
  };
  return (
    <main className="auth-window" data-stage={stage}>
      {!sharedScene && (
        <img
          className="auth-artwork"
          src={
            new URL("artwork/bito-login-background.svg", window.location.href)
              .href
          }
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
      <div className="auth-drag-area" aria-hidden="true" />
      <section className="auth-scene" aria-label="Masuk ke Bito">
        <div className="auth-card">
          <div className="auth-character-stage" aria-hidden="true">
            <div ref={slot} className="auth-character" data-setup-anchor>
              {!sharedScene && (
                <Character
                  state={{
                    ...state,
                    presentation: {
                      purpose: "login",
                      wave: state.presentation?.wave,
                      phase: "anchored",
                      step: 0,
                      talking: false,
                      characterReady: ready,
                    },
                  }}
                  onReady={() => setReady(true)}
                />
              )}
            </div>
          </div>
          <motion.div
            className="auth-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: reduced ? 0 : 0.28,
              ease: [0.2, 0.8, 0.2, 1],
            }}
          >
            <header className="auth-heading">
              <h1>Bito</h1>
              <p>Teman kecil untuk menemani harimu.</p>
            </header>
            <div className="auth-actions">
              <motion.button
                className="auth-google"
                type="button"
                disabled={pending || !!busy}
                onClick={() => void run(retry ? "auth-retry" : "auth-google")}
                whileHover={reduced || pending ? undefined : { y: -1 }}
                whileTap={reduced || pending ? undefined : { scale: 0.985 }}
                transition={{ duration: 0.12 }}
              >
                <img
                  src={new URL("google-g.png", window.location.href).href}
                  width="18"
                  height="18"
                  alt=""
                />
                <span>{retry ? "Coba lagi" : "Lanjutkan dengan Google"}</span>
              </motion.button>
              <motion.div
                className="auth-feedback"
                aria-live="polite"
                aria-atomic="true"
                initial={false}
                animate={{ height: hasFeedback ? feedbackHeight : 0 }}
                transition={{
                  type: "tween",
                  duration: reduced ? 0 : 0.26,
                  ease: [0.2, 0.8, 0.2, 1],
                }}
              >
                <AnimatePresence initial={false}>
                  {hasFeedback && (
                    <motion.div
                      key="feedback"
                      ref={feedbackContent}
                      className="auth-feedback-content"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduced ? 0 : 0.12 }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {message && (
                          <motion.div
                            key={stage + ":" + message}
                            className={
                              "auth-status " +
                              severity +
                              (stage === "success" ? " success" : "")
                            }
                            initial={{ opacity: 0, y: reduced ? 0 : 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: reduced ? 0 : -3 }}
                            transition={{ duration: reduced ? 0 : 0.16 }}
                          >
                            {stage === "success" ? (
                              <Check size={16} />
                            ) : stage === "offline" ? (
                              <WifiOff size={16} />
                            ) : ["opening", "waiting", "checking"].includes(
                                stage,
                              ) ? (
                              <LoaderCircle
                                size={16}
                                className="auth-spinner"
                              />
                            ) : severity === "error" ? (
                              <CircleAlert size={16} />
                            ) : null}
                            <span>{message}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {(waiting || alternate) && (
                        <div className="auth-secondary-slot">
                          <button
                            className="auth-secondary"
                            type="button"
                            disabled={!!busy && !state.loginPreview}
                            onClick={() =>
                              void run(
                                waiting || state.loginPreview
                                  ? "auth-cancel"
                                  : "auth-signout",
                              )
                            }
                          >
                            {waiting ? "Batal" : "Gunakan akun lain"}
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
