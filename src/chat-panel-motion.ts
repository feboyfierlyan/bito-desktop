import { clipRegion, type HitRegion } from "./chat-layout";

/** One mask owns panel, composer, messages, menus and resize grip. */
export function chatPanelReveal(
  open: boolean,
  side: "left" | "right",
  width: number,
  height: number,
) {
  const top = open ? 0 : Math.max(0, height - 60);
  const horizontal = open ? 0 : Math.max(0, width - 60);
  return {
    opacity: open ? 1 : 0,
    clipPath: `inset(${top}px ${side === "right" ? horizontal : 0}px 0px ${side === "left" ? horizontal : 0}px round 30px)`,
  };
}

/** Keep native pointer ownership inside the currently visible animated mask. */
export function panelHitBounds(frame: HitRegion, mask: string): HitRegion {
  const values = mask
    .match(/^inset\((.*?)\s+round/)?.[1]
    ?.trim()
    .split(/\s+/)
    .map(parseFloat);
  if (!values?.length || values.some((value) => !Number.isFinite(value)))
    return frame;
  const [top, right = top, bottom = top, left = right] = values;
  return {
    x: frame.x + left,
    y: frame.y + top,
    width: Math.max(0, frame.width - left - right),
    height: Math.max(0, frame.height - top - bottom),
  };
}

export function clipToPanel(region: HitRegion, panel: HitRegion) {
  return clipRegion(region, panel);
}
