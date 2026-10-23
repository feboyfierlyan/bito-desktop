import type { GazeTarget, Snapshot } from "./shared";

export const neutralGaze: GazeTarget = { active: false, x: 0.5, y: 0.5 };
export function canTrackGaze(state: Snapshot): boolean {
  const p = state.presentation;
  return (
    !!p &&
    p.step < 2 &&
    p.characterReady &&
    p.phase === "anchored" &&
    !state.dragging &&
    !state.settings.reducedMotion
  );
}

// Native screen coordinates and window bounds are both Electron DIP, including
// monitors to the left of the primary display. Do not multiply by Retina scale.
export function gazeInViewport(
  cursor: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number },
): GazeTarget {
  return {
    active: true,
    x: (cursor.x - bounds.x) / Math.max(1, bounds.width),
    y: (cursor.y - bounds.y) / Math.max(1, bounds.height),
  };
}

export function gazeOffset(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
) {
  const dx = (x - centerX) / 0.55,
    dy = (y - centerY) / 0.55;
  const radius = Math.max(1, Math.hypot(dx, dy));
  // White eyes are 72×87; pupils 41×62. Stay inside their safe ellipse.
  return { x: (dx / radius) * 11, y: (dy / radius) * 7 };
}
export function approach(
  current: number,
  target: number,
  seconds: number,
  tau = 0.075,
) {
  return target + (current - target) * Math.exp(-Math.max(0, seconds) / tau);
}
