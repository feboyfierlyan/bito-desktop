import { BitoButton } from "./ui/controls";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Maximize2, X } from "lucide-react";
import {
  selectedRect,
  validSelection,
  type AreaFrame,
  type AreaPoint,
} from "./area-selection";
import type { ScreenRect } from "./grounding";

declare global {
  interface Window {
    bitoArea: {
      ready(): void;
      painted(session: string): void;
      cancel(session: string): void;
      submit(payload: unknown): Promise<{ ok: boolean; error?: string }>;
      onFrame(fn: (v: AreaFrame) => void): () => void;
      onClose(fn: () => void): () => void;
    };
  }
}

export function AreaSelect() {
  const [frame, setFrame] = useState<AreaFrame>(),
    [rect, setRect] = useState<ScreenRect>(),
    [editing, setEditing] = useState(false),
    [keyboardMode, setKeyboardMode] = useState<"move" | "resize" | null>(null),
    [error, setError] = useState(""),
    [closing, setClosing] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const start = useRef<AreaPoint | undefined>(undefined),
    current = useRef(frame),
    rectRef = useRef(rect),
    modeRef = useRef(keyboardMode),
    pending = useRef(false);
  current.current = frame;
  rectRef.current = rect;
  modeRef.current = keyboardMode;

  useEffect(() => {
    const a = window.bitoArea.onFrame((v) => {
      start.current = undefined;
      setFrame(v);
      setRect(undefined);
      setEditing(false);
      setKeyboardMode(null);
      setError("");
      setClosing(false);
      setSubmitting(false);
      pending.current = false;
    });
    const b = window.bitoArea.onClose(() => {
      setClosing(true);
      const closed = current.current;
      setTimeout(() => {
        if (current.current === closed) setFrame(undefined);
      }, 170);
    });
    window.bitoArea.ready();
    return () => {
      a();
      b();
    };
  }, []);

  async function submit(selection = rectRef.current) {
    const f = current.current;
    if (!selection || !f || pending.current) return;
    pending.current = true;
    setSubmitting(true);
    setError("");
    const result = await window.bitoArea
      .submit({ session: f.session, rect: selection, question: "" })
      .catch(() => ({
        ok: false,
        error: "Area belum bisa dilampirkan. Coba lagi.",
      }));
    if (current.current?.session !== f.session) return;
    if (!result.ok) {
      pending.current = false;
      setSubmitting(false);
      setError(result.error || "Coba pilih area lagi.");
    }
  }

  // BITO-009 (WCAG 2.2 AA): Full keyboard region selection & adjustment
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const f = current.current;
      if (!f || pending.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        window.bitoArea.cancel(f.session);
        return;
      }
      const w = f.width || window.innerWidth || 1280;
      const ht = f.height || window.innerHeight || 800;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 40 : e.altKey ? 4 : 14;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const base = rectRef.current ?? {
          x: Math.round(Math.max(0, (w - Math.min(640, w - 48)) / 2)),
          y: Math.round(Math.max(0, (ht - Math.min(400, ht - 48)) / 2)),
          width: Math.min(640, w - 48),
          height: Math.min(400, ht - 48),
        };
        const mode = modeRef.current ?? "move";
        if (!modeRef.current) setKeyboardMode("move");
        const next: ScreenRect =
          mode === "resize"
            ? {
                x: base.x,
                y: base.y,
                width: Math.max(48, Math.min(w - base.x, base.width + dx)),
                height: Math.max(48, Math.min(ht - base.y, base.height + dy)),
              }
            : {
                x: Math.max(0, Math.min(w - base.width, base.x + dx)),
                y: Math.max(0, Math.min(ht - base.height, base.y + dy)),
                width: base.width,
                height: base.height,
              };
        setRect(next);
        setEditing(true);
      } else if (e.key === " " && modeRef.current && rectRef.current) {
        e.preventDefault();
        setKeyboardMode((m) => (m === "resize" ? "move" : "resize"));
      } else if (e.key === "Enter" && rectRef.current && modeRef.current) {
        e.preventDefault();
        void submit(rectRef.current);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!frame) return null;
  const duration = frame.reducedMotion ? 0 : 0.18;
  const painted = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => window.bitoArea.painted(frame.session)),
    );

  return (
    <motion.main
      className={`area-select${editing ? " area-editing" : ""}`}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration }}
      onContextMenu={(e) => {
        e.preventDefault();
        window.bitoArea.cancel(frame.session);
      }}
    >
      <img
        className="area-desktop"
        src={frame.image}
        alt=""
        draggable={false}
        onLoad={painted}
      />
      <div
        className="area-drag-surface"
        onPointerDown={(e) => {
          if (e.button !== 0 || submitting) return;
          start.current = { x: e.clientX, y: e.clientY };
          setKeyboardMode(null);
          setEditing(false);
          setError("");
          setRect(undefined);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start.current)
            setRect(
              selectedRect(
                start.current,
                { x: e.clientX, y: e.clientY },
                frame,
              ),
            );
        }}
        onPointerUp={(e) => {
          if (!start.current) return;
          const next = selectedRect(
            start.current,
            { x: e.clientX, y: e.clientY },
            frame,
          );
          start.current = undefined;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (validSelection(next, frame)) {
            setRect(next);
            setEditing(true);
            void submit(next);
          } else setRect(undefined);
        }}
        onLostPointerCapture={() => {
          if (start.current) {
            start.current = undefined;
            setRect(undefined);
          }
        }}
      >
        <svg
          className="area-mask"
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          <defs>
            <mask id="selection">
              <rect width="100%" height="100%" fill="white" />
              {rect && <rect {...rect} rx="6" fill="black" />}
            </mask>
          </defs>
          <motion.rect
            width="100%"
            height="100%"
            fill="rgba(12,19,30,.42)"
            mask="url(#selection)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration }}
          />
          {rect && (
            <rect
              {...rect}
              rx="6"
              fill="none"
              stroke="var(--bito-focus)"
              strokeWidth="2"
            />
          )}
        </svg>
      </div>
      <BitoButton
        type="button"
        className="area-cancel"
        aria-label="Batalkan pilihan area"
        onClick={() => window.bitoArea.cancel(frame.session)}
      >
        <X size={19} />
      </BitoButton>
      <div className="area-instruction" role="status">
        <span>
          {submitting
            ? "Menambahkan cuplikan…"
            : error
              ? error
              : keyboardMode
                ? `Mode keyboard (${keyboardMode === "move" ? "Geser" : "Ubah ukuran"} · Spasi ganti mode · Enter konfirmasi)`
                : "Seret area layar (atau tekan Panah untuk pilih via keyboard) · Esc batal"}
        </span>
        {!submitting && (
          <BitoButton
            type="button"
            variant="secondary"
            className="area-full-btn"
            onClick={() => {
              const full = {
                x: 0,
                y: 0,
                width: frame.width || window.innerWidth,
                height: frame.height || window.innerHeight,
              };
              setRect(full);
              setEditing(true);
              void submit(full);
            }}
          >
            <Maximize2 size={13} />
            Layar penuh
          </BitoButton>
        )}
        {error && rect && (
          <BitoButton type="button" onClick={() => void submit()}>
            Coba lagi
          </BitoButton>
        )}
      </div>
    </motion.main>
  );
}
