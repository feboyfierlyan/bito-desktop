import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { bubbleReveal } from "./bubble-motion";

export function Bubble({
  children,
  side = "bito",
  className = "",
  appear = true,
  reduced = false,
  liquid = false,
  layoutId,
  closing = false,
  handoffTail = false,
}: {
  children: ReactNode;
  side?: "bito" | "user";
  className?: string;
  appear?: boolean;
  reduced?: boolean;
  liquid?: boolean;
  layoutId?: string;
  closing?: boolean;
  handoffTail?: boolean;
}) {
  const osReduced = useReducedMotion();
  const variants = bubbleReveal(side, reduced || !!osReduced, liquid);
  if (closing) {
    variants.shell.exit = {
      opacity: 0,
      y: 0,
      transition: { duration: reduced || osReduced ? 0 : 0.26, delay: 0.04 },
    };
    variants.surface.exit = {
      scaleX: reduced || osReduced ? 1 : 0.16,
      scaleY: reduced || osReduced ? 1 : 0.68,
      transition: {
        duration: reduced || osReduced ? 0 : 0.26,
        ease: [0.65, 0, 0.35, 1],
      },
    };
    variants.content.exit = {
      opacity: 0,
      transition: { duration: reduced || osReduced ? 0 : 0.1 },
    };
  }
  return (
    <motion.div
      className={`bubble-shell bubble-shell-${side} ${className}`}
      layout={liquid ? false : "size"}
      layoutId={layoutId}
      variants={variants.shell}
      initial={appear ? "hidden" : false}
      animate={closing ? "exit" : "visible"}
      exit="exit"
      transition={{
        layout: {
          duration: reduced || osReduced ? 0 : 0.2,
          ease: [0.22, 1, 0.36, 1],
        },
      }}
    >
      <motion.span
        aria-hidden="true"
        className="bubble-surface"
        variants={variants.surface}
      >
        <motion.svg
          className="bubble-tail"
          viewBox="0 0 36 30"
          animate={{ opacity: handoffTail ? 0 : 1 }}
          transition={{ duration: reduced || osReduced ? 0 : 0.14 }}
        >
          <path d="M36 0H11C14 15 9 24 0 29C15 29 27 25 36 17Z" />
        </motion.svg>
        {handoffTail && (
          <motion.svg
            className="bubble-tail bubble-handoff-tail"
            viewBox="0 0 36 30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: reduced || osReduced ? 0 : 0.18,
              delay: reduced || osReduced ? 0 : 0.08,
            }}
          >
            <path d="M36 0H11C14 15 9 24 0 29C15 29 27 25 36 17Z" />
          </motion.svg>
        )}
      </motion.span>
      <motion.div className="bubble-content" variants={variants.content}>
        {children}
      </motion.div>
    </motion.div>
  );
}
