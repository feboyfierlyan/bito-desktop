export type Rect = { x: number; y: number; width: number; height: number };

// Electron content bounds and pointer coordinates use device-independent pixels.
export function anchorBounds(slot: Rect, content: Rect, zoom = 1): Rect {
  return {
    x: Math.round(content.x + slot.x * zoom) || 0,
    y: Math.round(content.y + slot.y * zoom) || 0,
    width: Math.round(slot.width * zoom),
    height: Math.round(slot.height * zoom),
  };
}
export function droppedOutside(pet: Rect, window: Rect): boolean {
  const x = pet.x + pet.width / 2,
    y = pet.y + pet.height / 2;
  return (
    x < window.x ||
    x > window.x + window.width ||
    y < window.y ||
    y > window.y + window.height
  );
}
export function easePosition(from: Rect, to: Rect, progress: number): Rect {
  const t = Math.min(1, Math.max(0, progress));
  const ease = 1 - Math.pow(1 - t, 3);
  return {
    ...from,
    x: Math.round(from.x + (to.x - from.x) * ease) || 0,
    y: Math.round(from.y + (to.y - from.y) * ease) || 0,
  };
}
export function wordDelay(word: string): number {
  return (
    105 +
    Math.min(word.length, 10) * 9 +
    (/[.!?…]$/.test(word) ? 190 : /[,;:]$/.test(word) ? 85 : 0)
  );
}

export function canWave(
  view: { step: number; phase: string; characterReady: boolean } | undefined,
) {
  return (
    !!view && view.step < 2 && view.characterReady && view.phase === "anchored"
  );
}
