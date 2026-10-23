import type { Rive } from "@rive-app/canvas";
import type { Artboard, Node } from "@rive-app/canvas/rive_advanced.mjs";
import type { GazeTarget } from "./shared";
import { approach, gazeOffset } from "./gaze";

// The pinned 2.45 runtime exposes its low-level artboard on the instance.
// Keep this one internal access isolated so a runtime upgrade is easy to audit.
export function createEyeRig(rive: Rive) {
  const artboard = (rive as unknown as { artboard: Artboard }).artboard;
  const left = artboard?.node("Pupil_L"),
    right = artboard?.node("Pupil_R");
  if (!left || !right) return null;
  const pupils = [left, right].map((node: Node) => ({
    node,
    x: node.x,
    y: node.y,
  }));
  const bounds = rive.bounds;
  const centers = pupils.map(({ node, x, y }) => {
    const m = node.worldTransform();
    const result = {
      x: m.tx - m.xx * x - m.yx * y,
      y: m.ty - m.xy * x - m.yy * y,
    };
    m.delete();
    return result;
  });
  const centerX =
    ((centers[0].x + centers[1].x) / 2 - bounds.minX) /
    (bounds.maxX - bounds.minX);
  const centerY =
    ((centers[0].y + centers[1].y) / 2 - bounds.minY) /
    (bounds.maxY - bounds.minY);
  let mix = 0,
    x = 0,
    y = 0,
    controlling = false;
  const restore = () => {
    if (!controlling) return;
    for (const p of pupils) {
      p.node.x = p.x;
      p.node.y = p.y;
    }
    artboard.advance(0);
    mix = 0;
    controlling = false;
  };
  return {
    restore,
    advance(target: GazeTarget, seconds: number, enabled: boolean) {
      const active = enabled && target.active;
      if (!active && !controlling) return;
      controlling = true;
      const offset = gazeOffset(target.x, target.y, centerX, centerY);
      x = approach(x, offset.x, seconds);
      y = approach(y, offset.y, seconds);
      mix = approach(mix, active ? 1 : 0, seconds, 0.065);
      if (!active && mix < 0.002) {
        restore();
        return;
      }
      for (const p of pupils) {
        // Tracking converges around the whites' center; adding offsets to the
        // original ±15.5 would push a pupil beyond the edge of its white.
        p.node.x = p.x * (1 - mix) + x * mix;
        p.node.y = p.y + y * mix;
      }
      // onAdvance runs after state-machine updates and before the canvas draw.
      artboard.advance(0);
    },
  };
}
