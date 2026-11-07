import { BitoTheme } from "./ui/BitoTheme";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { placeGuideBubble, type ScreenRect } from "./grounding";
import "./Spotlight.css";
import "./ui/astryx-bito.css";
type View = {
  visible: boolean;
  target?: ScreenRect;
  label?: string;
  reducedMotion?: boolean;
  guide?: {
    text: string;
    anchor: ScreenRect;
    phase?: "thinking" | "talking" | "waiting";
    hint?: string;
  } | null;
};
function Spotlight() {
  const [view, set] = useState<View>({ visible: false });
  useEffect(
    () =>
      (
        window as unknown as {
          bitoSpotlight?: { listen(fn: (v: View) => void): () => void };
        }
      ).bitoSpotlight?.listen((value) => set((old) => ({ ...old, ...value }))),
    [],
  );
  useEffect(() => {
    if (!view.target) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        (
          window as unknown as { bitoSpotlight?: { painted(): void } }
        ).bitoSpotlight?.painted(),
      );
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [view.target]);
  const r = view.target;
  const bubble = view.guide;
  const [reveal, showWords] = useState({ text: "", words: 0 });
  const words = reveal.text === bubble?.text ? reveal.words : 0;
  useEffect(() => {
    const text = bubble?.text || "";
    showWords({ text, words: view.reducedMotion ? 9999 : 0 });
    if (!bubble || view.reducedMotion || bubble.phase === "thinking") return;
    let count = 0;
    const length = bubble.text.split(/\s+/).length;
    const timer = setInterval(() => {
      showWords({ text, words: ++count });
      if (count >= length) clearInterval(timer);
    }, 65);
    return () => clearInterval(timer);
  }, [bubble?.text, bubble?.phase === "thinking", view.reducedMotion]);
  const place = bubble
    ? placeGuideBubble(
        bubble.anchor,
        { x: 0, y: 0, width: innerWidth, height: innerHeight },
        r,
        bubble.phase === "thinking" ? {width: 68, height: 44} : undefined,
      )
    : undefined;
  const left = place?.side === "left";
  return (
    <>
      <svg
        className={`spotlight ${view.visible ? "visible" : ""}`}
        style={{ transitionDuration: view.reducedMotion ? "0ms" : undefined }}
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        <defs>
          <mask id="spotlight-hole">
            <rect width="100%" height="100%" fill="white" />
            {r && (
              <motion.rect
                initial={false}
                animate={{
                  x: r.x - 6,
                  y: r.y - 6,
                  width: r.width + 12,
                  height: r.height + 12,
                  rx: Math.min(12, r.height / 3),
                }}
                transition={{
                  duration: view.reducedMotion ? 0 : 0.28,
                  ease: [0.2, 0.7, 0.2, 1],
                }}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(8,18,32,.28)"
          mask="url(#spotlight-hole)"
        />
        {r && (
          <motion.rect
            initial={false}
            animate={{
              x: r.x - 6,
              y: r.y - 6,
              width: r.width + 12,
              height: r.height + 12,
              rx: Math.min(12, r.height / 3),
            }}
            transition={{
              duration: view.reducedMotion ? 0 : 0.28,
              ease: [0.2, 0.7, 0.2, 1],
            }}
            fill="none"
            stroke="var(--bito-focus)"
            strokeWidth="2.5"
          />
        )}
      </svg>
      <AnimatePresence>
        {bubble && (
          <motion.div
            layout="size"
            className="guide-bubble"
            data-phase={bubble.phase}
            data-side={place?.side}
            data-reduced-motion={view.reducedMotion}
            initial={{ opacity: 0, scale: 0.94, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{
              duration: view.reducedMotion ? 0 : 0.24,
              ease: [0.2, 0.7, 0.2, 1],
            }}
            style={{
              width: bubble.phase === "thinking" ? 68 : undefined,
              left: left ? undefined : place!.x,
              right: left ? innerWidth - place!.x - place!.width : undefined,
              top: place?.side === "above" ? undefined : place!.y,
              bottom:
                place?.side === "above"
                  ? innerHeight - place.y - place.height
                  : undefined,
              transformOrigin: left ? "100% 75%" : "0% 75%",
            }}
            role="status"
            aria-live="polite"
          >
            <motion.div
              layout="size"
              transition={{
                duration: view.reducedMotion ? 0 : 0.24,
                ease: [0.2, 0.7, 0.2, 1],
              }}
            >
              {bubble.phase === "thinking" ? (
                <span
                  className="guide-typing"
                  aria-label="Bito sedang memproses"
                >
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <>
                  {bubble.text
                    .split(/\s+/)
                    .slice(0, words)
                    .map((word, i) => (
                      <motion.span
                        key={`${bubble.text}:${i}`}
                        initial={{ opacity: 0, filter: "blur(2px)" }}
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        transition={{ duration: view.reducedMotion ? 0 : 0.16 }}
                      >
                        {word}{" "}
                      </motion.span>
                    ))}
                  {!words && <span aria-hidden="true">…</span>}
                </>
              )}
            </motion.div>
            {bubble.hint && bubble.phase !== "thinking" && (
              <div className="guide-hint">{bubble.hint}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <BitoTheme>
    <Spotlight />
  </BitoTheme>,
);
