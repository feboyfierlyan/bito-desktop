// Keep the React component boundary separate from the root bootstrap for Fast Refresh.
import React, { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  LayoutGroup,
} from "motion/react";
import {
  ArrowRight,
  X,
  Plus,
  Check,
  MessageCircle,
  Pause,
  Play,
} from "lucide-react";
import { api, isDesktop } from "./bridge";
import { appendReplyDelta } from "./reply-bubbles";
import { Character } from "./Character";
import { DesktopChat } from "./DesktopChat";
import { GreetingBubble } from "./GreetingBubble";
import { SettingsWindow } from "./SettingsWindow";
import { SetupFlow } from "./SetupFlow";
import { useDragSway } from "./use-drag-sway";
import { isDrag, remaining } from "../electron/core";
import type { Snapshot } from "./shared";
import "./style.css";
import "./DesktopChat.css";
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
    const delta = api.onDelta((event) =>
      setState((s) =>
        s
          ? {
              ...s,
              messages: s.messages.map((m) => appendReplyDelta(m, event)),
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
  }, [
    route,
    state?.settings.reducedTransparency,
    state?.settings.reducedMotion,
  ]);
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
      {["auth", "onboarding", "welcome"].includes(route) ? (
        <SetupFlow state={state} route={route} act={act} />
      ) : state.auth?.configured &&
        state.auth.status !== "ready" &&
        state.presentation?.purpose !== "login" ? null : route === "pet" ? (
        <Pet state={state} />
      ) : route === "chat" ? (
        <LayoutGroup id="desktop-conversation">
          <DesktopChat
            state={state}
            act={act}
            panels={{
              focus: <Focus state={state} act={act} />,
              tasks: <Tasks state={state} act={act} />,
            }}
          />
          <GreetingBubble state={state} />
        </LayoutGroup>
      ) : (
        <SettingsWindow state={state} initial={route} />
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
  const sway = useDragSway(
    state.settings.reducedMotion || !!state.presentation,
  );
  const latest = useRef(state);
  latest.current = state;
  const pointer = useRef<{
    x: number;
    y: number;
    drag: boolean;
    pointerId: number;
    grab: { x: number; y: number };
  } | null>(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
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
    window.addEventListener("mousemove", move);
    window.addEventListener("blur", cancel);
    function cancel() {
      if (latest.current.presentation && pointer.current?.drag) return;
      if (pointer.current?.drag) api.dragEnd();
      sway.release();
      pointer.current = null;
    }
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  useEffect(() => {
    if (!state.dragging) sway.release();
  }, [state.dragging, sway.release]);
  useEffect(
    () =>
      api.onDragMotion?.((motion) => {
        if (motion.phase === "start") sway.begin(motion, motion.grab);
        else if (motion.phase === "move") sway.move(motion.x, motion.y);
        else sway.release();
      }),
    [sway.begin, sway.move, sway.release],
  );
  return (
    <div
      className={`pet ${state.dragging ? "dragging" : ""} ${state.presentation ? "presenting" : ""} ${state.presentation?.phase === "ready" ? "ready" : ""}`}
      role="button"
      aria-label={
        state.presentation
          ? "Bito: tahan dan seret keluar jendela untuk mulai"
          : "Bito: klik untuk chat, seret untuk memindahkan"
      }
      tabIndex={0}
      onKeyDown={(e) => {
        if (state.presentation) return;
        if (e.key === "Enter" || e.key === " ") api.toggleChat();
        if (e.key === "ContextMenu") api.contextMenu();
      }}
      onPointerDown={(e) => {
        if (
          e.button !== 0 ||
          (state.presentation && state.presentation.phase !== "ready")
        )
          return;
        pointer.current = {
          x: e.screenX,
          y: e.screenY,
          drag: false,
          pointerId: e.pointerId,
          grab: { x: e.clientX / innerWidth, y: e.clientY / innerHeight },
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
          if (!isDesktop) sway.begin({ x: p.x, y: p.y }, p.grab);
          api.dragStart();
        }
        if (p.drag) {
          if (!isDesktop) sway.move(e.screenX, e.screenY);
          api.dragMove(dx, dy);
        }
      }}
      onPointerUp={(e) => {
        if (e.button !== 0) return;
        const p = pointer.current;
        pointer.current = null;
        sway.release();
        if (!p) return;
        if (p.drag) api.dragEnd();
        else if (!state.presentation) api.toggleChat();
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        if (pointer.current?.drag) void api.command("drag-cancel");
        pointer.current = null;
        sway.release();
      }}
      onLostPointerCapture={() => {
        if (pointer.current?.drag) api.dragEnd();
        pointer.current = null;
        sway.release();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        api.contextMenu();
      }}
    >
      <div className="pet-sway" ref={sway.visual}>
        <Character
          state={state}
          nativeSurface
          onReady={(frame) => {
            void api.command("character-ready", frame);
          }}
        />
      </div>
    </div>
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
