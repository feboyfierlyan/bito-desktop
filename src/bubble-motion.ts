import type { Variants } from "motion/react";

// The surface stretches separately so letters keep their natural proportions.
export function bubbleReveal(_side: "bito" | "user", reduced: boolean) {
  const shell: Variants = {
    hidden: {
      opacity: 0,
      y: reduced ? 0 : 7,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: reduced
        ? { duration: 0 }
        : { type: "spring", stiffness: 430, damping: 30, mass: 0.8 },
    },
    exit: {
      opacity: 0,
      y: reduced ? 0 : -3,
      transition: { duration: reduced ? 0 : 0.1 },
    },
  };
  const surface: Variants = {
    hidden: { scaleX: reduced ? 1 : 0.32, scaleY: reduced ? 1 : 0.82 },
    visible: {
      scaleX: 1,
      scaleY: 1,
      transition: reduced
        ? { duration: 0 }
        : { type: "spring", stiffness: 470, damping: 31, mass: 0.7 },
    },
  };
  const content: Variants = {
    hidden: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 2 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? 0 : 0.14, delay: reduced ? 0 : 0.085 },
    },
  };
  return { shell, surface, content };
}
