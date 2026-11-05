import type { ScreenRect } from "./grounding";
export type AreaPoint = { x: number; y: number };
export type AreaFrame = {
  session: string;
  image: string;
  width: number;
  height: number;
  reducedMotion: boolean;
};
export type SelectedArea = {
  thumbnail?: string;
  id: string;
  capturedAt: number;
  width: number;
  height: number;
};
const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
/** Renderer coordinates are display-local DIP. Image dimensions are read from
 * the captured bitmap, not inferred from devicePixelRatio. */
export function selectedRect(
  a: AreaPoint,
  b: AreaPoint,
  frame: { width: number; height: number },
): ScreenRect {
  const x1 = clamp(a.x, frame.width),
    x2 = clamp(b.x, frame.width);
  const y1 = clamp(a.y, frame.height),
    y2 = clamp(b.y, frame.height);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}
export function validSelection(
  raw: unknown,
  frame: { width: number; height: number },
): raw is ScreenRect {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as ScreenRect;
  return (
    [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.width >= 12 &&
    r.height >= 12 &&
    r.x + r.width <= frame.width + 0.01 &&
    r.y + r.height <= frame.height + 0.01
  );
}
export function cropPixels(
  rect: ScreenRect,
  frame: { width: number; height: number },
  image: { width: number; height: number },
): ScreenRect {
  if (!validSelection(rect, frame) || image.width <= 0 || image.height <= 0)
    throw Error("invalid_selection");
  const x = Math.floor((rect.x / frame.width) * image.width),
    y = Math.floor((rect.y / frame.height) * image.height);
  return {
    x,
    y,
    width:
      Math.min(
        image.width,
        Math.ceil(((rect.x + rect.width) / frame.width) * image.width),
      ) - x,
    height:
      Math.min(
        image.height,
        Math.ceil(((rect.y + rect.height) / frame.height) * image.height),
      ) - y,
  };
}
export function areaInputPosition(
  rect: ScreenRect,
  frame: { width: number; height: number },
) {
  const width = Math.min(380, frame.width - 32),
    height = 160,
    gap = 14;
  return {
    x: Math.max(
      16,
      Math.min(frame.width - width - 16, rect.x + rect.width - width),
    ),
    y: Math.max(
      16,
      Math.min(
        frame.height - height - 16,
        rect.y + rect.height + gap + height <= frame.height - 16
          ? rect.y + rect.height + gap
          : rect.y - height - gap,
      ),
    ),
    width,
  };
}
