import { BitoButton } from "./ui/controls";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
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
    [error, setError] = useState(""),
    [closing, setClosing] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const start = useRef<AreaPoint | undefined>(undefined),
    current = useRef(frame),
    pending = useRef(false);
  current.current = frame;
  useEffect(() => {
    const a = window.bitoArea.onFrame((v) => {
      start.current = undefined;
      setFrame(v);
      setRect(undefined);
      setEditing(false);
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
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && current.current)
        window.bitoArea.cancel(current.current.session);
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
  async function submit(selection = rect) {
    if (!selection || !frame || pending.current) return;
    pending.current = true;
    setSubmitting(true);
    setError("");
    const result = await window.bitoArea
      .submit({ session: frame.session, rect: selection, question: "" })
      .catch(() => ({
        ok: false,
        error: "Area belum bisa dilampirkan. Coba lagi.",
      }));
    if (current.current?.session !== frame.session) return;
    if (!result.ok) {
      pending.current = false;
      setSubmitting(false);
      setError(result.error || "Coba pilih area lagi.");
    }
  }
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
              {rect && <rect {...rect} rx="4" fill="black" />}
            </mask>
          </defs>
          <motion.rect
            width="100%"
            height="100%"
            fill="rgba(12,19,30,.38)"
            mask="url(#selection)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration }}
          />
          {rect && (
            <rect
              {...rect}
              rx="4"
              fill="none"
              stroke="var(--bito-focus)"
              strokeWidth="1.5"
            />
          )}
        </svg>
      </div>
      <BitoButton
        className="area-cancel"
        aria-label="Batalkan pilihan area"
        onClick={() => window.bitoArea.cancel(frame.session)}
      >
        <X size={19} />
      </BitoButton>
      <div className="area-instruction" role="status">
        {submitting
          ? "Menambahkan cuplikan…"
          : error || "Seret area yang ingin ditanyakan · Esc untuk batal"}
        {error && rect && (
          <BitoButton onClick={() => void submit()}>Coba lagi</BitoButton>
        )}
      </div>
    </motion.main>
  );
}
