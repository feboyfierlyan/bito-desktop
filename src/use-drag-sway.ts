import { useCallback, useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import {
  advanceSway,
  initialSway,
  pivotCompensation,
  safeSwayLimits,
  swayAtRest,
} from "./drag-sway";

export function useDragSway(disabled: boolean) {
  const osReduced = useReducedMotion();
  const disabledRef = useRef(disabled || !!osReduced);
  disabledRef.current = disabled || !!osReduced;
  const visual = useRef<HTMLDivElement>(null);
  const model = useRef(initialSway(0, 0));
  const pointer = useRef({ x: 0, y: 0 });
  const pivot = useRef({ x: 0.5, y: 0.3 });
  const limits = useRef({ min: -12, max: 12 });
  const compensation = useRef({ x: 0, y: 0 });
  const held = useRef(false),
    frame = useRef(0),
    last = useRef(0);
  const reset = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    held.current = false;
    model.current = initialSway(pointer.current.x, pointer.current.y);
    compensation.current = { x: 0, y: 0 };
    if (visual.current) {
      visual.current.style.transform = "none";
      visual.current.style.willChange = "auto";
    }
  }, []);
  const tick = useCallback(
    (now: number) => {
      frame.current = 0;
      if (disabledRef.current || !visual.current) {
        reset();
        return;
      }
      const dt = Math.min(0.04, (now - last.current) / 1000);
      last.current = now;
      model.current = advanceSway(
        model.current,
        pointer.current,
        held.current,
        dt,
      );
      const s = model.current;
      const decay = Math.exp(-dt / 0.075);
      compensation.current.x *= decay;
      compensation.current.y *= decay;
      // The conservative envelope keeps the art inside the existing transparent window.
      const angle = Math.max(
        limits.current.min,
        Math.min(limits.current.max, s.angle),
      );
      visual.current.style.transform = `translate3d(${compensation.current.x}px, ${s.lift + compensation.current.y}px, 0) rotate(${angle}deg) scale(${s.scaleX}, ${s.scaleY})`;
      if (
        !held.current &&
        swayAtRest(s) &&
        Math.hypot(compensation.current.x, compensation.current.y) < 0.01
      ) {
        reset();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    },
    [reset],
  );
  const begin = useCallback(
    (point: { x: number; y: number }, grab: { x: number; y: number }) => {
      if (disabledRef.current || !visual.current) return;
      const width = visual.current.offsetWidth,
        height = visual.current.offsetHeight;
      const next = {
        x: Math.max(0, Math.min(1, grab.x)),
        y: Math.max(0, Math.min(1, grab.y)),
      };
      // Re-grabbing uses the displayed pose, including the current safety limit.
      model.current.angle = Math.max(
        limits.current.min,
        Math.min(limits.current.max, model.current.angle),
      );
      const correction = pivotCompensation(
        model.current,
        pivot.current,
        next,
        width,
        height,
      );
      compensation.current.x += correction.x;
      compensation.current.y += correction.y;
      pivot.current = next;
      limits.current = safeSwayLimits(next, width, height);
      limits.current.min = Math.min(limits.current.min, model.current.angle);
      limits.current.max = Math.max(limits.current.max, model.current.angle);
      visual.current.style.transformOrigin = `${next.x * 100}% ${next.y * 100}%`;
      visual.current.style.willChange = "transform";
      pointer.current = point;
      model.current.x = point.x;
      model.current.y = point.y;
      model.current.vx = 0;
      model.current.vy = 0;
      held.current = true;
      if (!frame.current) {
        last.current = performance.now();
        frame.current = requestAnimationFrame(tick);
      }
    },
    [tick],
  );
  const move = useCallback((x: number, y: number) => {
    pointer.current = { x, y };
  }, []);
  const release = useCallback(() => {
    held.current = false;
  }, []);
  useEffect(() => {
    if (disabled || osReduced) reset();
  }, [disabled, osReduced, reset]);
  useEffect(() => reset, [reset]);
  return { visual, begin, move, release };
}
