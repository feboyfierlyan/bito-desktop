type Point = { x: number; y: number };
type Bounds = { left: number; top: number; width: number; height: number };

/** Map CSS coordinates to the painted bitmap, including Retina and CSS scaling. */
export function paintedPixelAt(
  point: Point, bounds: Bounds, bitmap: { width: number; height: number },
  alphaAt: (x: number, y: number) => number,
): boolean {
  if (![point.x, point.y, bounds.left, bounds.top, bounds.width, bounds.height, bitmap.width, bitmap.height].every(Number.isFinite) ||
      bounds.width <= 0 || bounds.height <= 0 || bitmap.width <= 0 || bitmap.height <= 0) return false;
  const x = (point.x - bounds.left) / bounds.width;
  const y = (point.y - bounds.top) / bounds.height;
  if (x < 0 || y < 0 || x >= 1 || y >= 1) return false;
  return alphaAt(Math.floor(x * bitmap.width), Math.floor(y * bitmap.height)) >= 48;
}

/** The visible capsule, excluding the empty corners of its rectangular host. */
export function insideCapsule(point: Point, bounds: Bounds): boolean {
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  const r = Math.min(bounds.width, bounds.height) / 2;
  const x = point.x - bounds.left, y = point.y - bounds.top;
  if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) return false;
  const nearestX = Math.max(r, Math.min(bounds.width - r, x));
  return (x - nearestX) ** 2 + (y - bounds.height / 2) ** 2 <= r ** 2;
}

/** Keep an already-open toolbar reachable through the small gap under the feet.
 * This corridor never activates hover from a fresh approach and is not clickable.
 */
export function insideHoverBridge(
  point: Point, visual: Bounds, pill: Bounds, expandedWidth: number, keepOpen: boolean,
): boolean {
  if (!keepOpen || visual.width <= 0 || visual.height <= 0 || expandedWidth <= 0) return false;
  const top = visual.top + visual.height * .84;
  const bottom = pill.top + pill.height / 2;
  if (bottom <= top || point.y < top || point.y > bottom) return false;
  const progress = (point.y - top) / (bottom - top);
  const feetCenter = visual.left + visual.width / 2;
  const pillCenter = pill.left + pill.width / 2;
  const center = feetCenter + (pillCenter - feetCenter) * progress;
  const feetWidth = visual.width * .46;
  const width = feetWidth + (Math.max(feetWidth, expandedWidth) - feetWidth) * progress;
  return Math.abs(point.x - center) <= width / 2;
}

export function hitPetHoverBridge(root: HTMLElement, x: number, y: number, keepOpen: boolean): boolean {
  if (!keepOpen) return false;
  const visual = root.querySelector<HTMLElement>(".pet-visual");
  const pill = root.querySelector<HTMLElement>(".pet-idle-handle");
  const actions = root.querySelector<HTMLElement>(".pet-tool-actions");
  if (!visual || !pill || !actions || !root.clientWidth) return false;
  // offsetWidth is the full toolbar width, independent of the reveal transform.
  const scale = root.getBoundingClientRect().width / root.clientWidth;
  return insideHoverBridge({ x, y }, visual.getBoundingClientRect(),
    pill.getBoundingClientRect(), actions.offsetWidth * scale, keepOpen);
}

const posters = new WeakMap<HTMLImageElement, { src: string; canvas: HTMLCanvasElement }>();
export function hitPetSurface(root: HTMLElement, x: number, y: number): boolean {
  const point = { x, y };
  const pill = root.querySelector<HTMLElement>(".pet-idle-handle");
  if (pill && insideCapsule(point, pill.getBoundingClientRect())) return true;
  const character = root.querySelector<HTMLElement>(".character");
  if (!character) return false;
  try {
    const ready = character.dataset.characterReady === "true";
    const visible = ready
      ? character.querySelector<HTMLCanvasElement>("canvas")
      : character.querySelector<HTMLImageElement>(".character-poster");
    if (!visible) return false;
    let bitmap: HTMLCanvasElement;
    if (visible instanceof HTMLImageElement) {
      if (!visible.complete || !visible.naturalWidth) return false;
      let cached = posters.get(visible);
      if (!cached || cached.src !== visible.currentSrc) {
        const canvas = document.createElement("canvas");
        canvas.width = visible.naturalWidth; canvas.height = visible.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return false;
        ctx.drawImage(visible, 0, 0);
        cached = { src: visible.currentSrc, canvas }; posters.set(visible, cached);
      }
      bitmap = cached.canvas;
    } else bitmap = visible;
    const context = bitmap.getContext("2d");
    if (!context) return false;
    // One pixel on pointer movement only; no screenshot or polling loop.
    return paintedPixelAt(point, visible.getBoundingClientRect(), bitmap,
      (px, py) => context.getImageData(px, py, 1, 1).data[3]);
  } catch { return false; }
}
