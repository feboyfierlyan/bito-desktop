export type HitRegion = { x: number; y: number; width: number; height: number };

export function transcriptHeight(
  rows: readonly number[],
  available: number,
  openingCount: number,
  manual: boolean,
) {
  if (manual) return Math.max(0, available);
  const added = Math.max(0, rows.length - openingCount);
  const recent =
    rows.slice(-(3 + added)).reduce((sum, height) => sum + height, 0) + 5;
  return Math.max(
    0,
    Math.min(available, added ? recent : Math.min(280, recent)),
  );
}

// The panel's 12px outer margin plus Bito's transparent silhouette margin
// should leave a visible 22px gap, rather than treating the viewport as art.
export function placeChatPanel(
  chat: { x: number; width: number },
  petSize: number,
  side: "left" | "right",
  area: { x: number; width: number },
) {
  const inset = Math.round(petSize * 0.075) + 2;
  return Math.round(
    Math.max(
      area.x + 12,
      Math.min(
        chat.x + (side === "left" ? inset : -inset),
        area.x + area.width - chat.width - 12,
      ),
    ),
  );
}
export function clipRegion(
  region: HitRegion,
  viewport: HitRegion,
): HitRegion | null {
  const x = Math.max(region.x, viewport.x),
    y = Math.max(region.y, viewport.y);
  const right = Math.min(region.x + region.width, viewport.x + viewport.width);
  const bottom = Math.min(
    region.y + region.height,
    viewport.y + viewport.height,
  );
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : null;
}
export function pointInRegions(
  point: { x: number; y: number },
  regions: HitRegion[],
) {
  return regions.some(
    (r) =>
      point.x >= r.x &&
      point.y >= r.y &&
      point.x <= r.x + r.width &&
      point.y <= r.y + r.height,
  );
}
