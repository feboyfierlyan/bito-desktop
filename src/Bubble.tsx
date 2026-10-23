import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { bubbleReveal } from "./bubble-motion";

export function Bubble({
  children,
  side = "bito",
  className = "",
  appear = true,
  reduced = false,
}: {
  children: ReactNode;
  side?: "bito" | "user";
  className?: string;
  appear?: boolean;
  reduced?: boolean;
}) {
  const osReduced = useReducedMotion();
  const variants = bubbleReveal(side, reduced || !!osReduced);
  return (
    <motion.div
      className={`bubble-shell bubble-shell-${side} ${className}`}
      layout="size"
      variants={variants.shell}
      initial={appear ? "hidden" : false}
      animate="visible"
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
        <svg className="bubble-tail" viewBox="0 0 36 30">
          <path d="M36 0H11C14 15 9 24 0 29C15 29 27 25 36 17Z" />
        </svg>
      </motion.span>
      <motion.div className="bubble-content" variants={variants.content}>
        {children}
      </motion.div>
    </motion.div>
  );
}
