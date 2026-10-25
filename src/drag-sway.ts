export type Sway = {
  angle: number;
  spin: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  lift: number;
};
export const initialSway = (x: number, y: number): Sway => ({
  angle: 0,
  spin: 0,
  vx: 0,
  vy: 0,
  x,
  y,
  scaleX: 1,
  scaleY: 1,
  lift: 0,
});
const clamp = (v: number, low: number, high: number) =>
  Math.max(low, Math.min(high, v));

export function advanceSway(
  s: Sway,
  point: { x: number; y: number },
  held: boolean,
  seconds: number,
): Sway {
  const dt = clamp(seconds, 0.001, 0.04);
  const blend = 1 - Math.exp(-dt / 0.05);
  const vx =
    s.vx +
    ((held ? clamp((point.x - s.x) / dt, -2400, 2400) : 0) - s.vx) * blend;
  const vy =
    s.vy +
    ((held ? clamp((point.y - s.y) / dt, -1800, 1800) : 0) - s.vy) * blend;
  // Sustained lean makes slow dragging legible; acceleration adds a soft kick.
  // The target returns to zero as soon as the held pointer stops moving.
  const target = held ? clamp(vx * 0.018, -11, 11) : 0;
  let spin = s.spin + (held ? (vx - s.vx) * 0.055 : 0),
    angle = s.angle;
  const steps = Math.ceil(dt * 240),
    step = dt / steps;
  for (let i = 0; i < steps; i++) {
    spin += (-90 * (angle - target) - 6.8 * spin) * step;
    angle += spin * step;
    if (Math.abs(angle) > 12) {
      angle = clamp(angle, -12, 12);
      if (spin * angle > 0) spin *= -0.08;
    }
  }
  const pickup = 1 - Math.exp(-dt / 0.075);
  const stretch = held ? 0.012 + Math.min(0.006, Math.abs(vy) * 0.000006) : 0;
  return {
    angle,
    spin,
    vx,
    vy,
    x: point.x,
    y: point.y,
    scaleX: s.scaleX + (1 - stretch * 0.55 - s.scaleX) * pickup,
    scaleY: s.scaleY + (1 + stretch - s.scaleY) * pickup,
    lift: s.lift + ((held ? -1.5 : 0) - s.lift) * pickup,
  };
}

export function swayAtRest(s: Sway) {
  return (
    Math.abs(s.angle) < 0.015 &&
    Math.abs(s.spin) < 0.12 &&
    Math.abs(s.scaleY - 1) < 0.0001 &&
    Math.abs(s.lift) < 0.015
  );
}

export function safeSwayLimits(
  pivot: { x: number; y: number },
  width: number,
  height: number,
) {
  const fits = (angle: number) => {
    const a = (angle * Math.PI) / 180,
      c = Math.cos(a),
      n = Math.sin(a);
    // Envelope of Bito's silhouette: a rectangular envelope falsely includes
    // empty upper corners and was suppressing most of the visible swing.
    const outline = [
      [0.26, 0.14],
      [0.36, 0.065],
      [0.64, 0.065],
      [0.74, 0.14],
      [0.82, 0.36],
      [0.925, 0.57],
      [0.925, 0.73],
      [0.72, 0.935],
      [0.28, 0.935],
      [0.075, 0.73],
      [0.075, 0.57],
      [0.18, 0.36],
    ];
    for (const [x, y] of outline) {
      const dx = (x - pivot.x) * width * 0.994,
        dy = (y - pivot.y) * height * 1.018;
      const px = pivot.x * width + dx * c - dy * n;
      const py = pivot.y * height + dx * n + dy * c - 1.5;
      if (px < 2 || px > width - 2 || py < 2 || py > height - 2) return false;
    }
    return true;
  };
  const limit = (sign: number) => {
    let low = 0,
      high = 12;
    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2;
      if (fits(mid * sign)) low = mid;
      else high = mid;
    }
    return low * sign;
  };
  return { min: limit(-1), max: limit(1) };
}

export function pivotCompensation(
  s: Sway,
  old: { x: number; y: number },
  next: { x: number; y: number },
  width: number,
  height: number,
) {
  const x = (old.x - next.x) * width,
    y = (old.y - next.y) * height;
  const a = (s.angle * Math.PI) / 180,
    c = Math.cos(a),
    n = Math.sin(a);
  return {
    x: x - (x * s.scaleX * c - y * s.scaleY * n),
    y: y - (x * s.scaleX * n + y * s.scaleY * c),
  };
}
