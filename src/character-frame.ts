export type CharacterFrame = { width: number; height: number };

export function matchingCharacterFrame(
  frame: CharacterFrame | null,
  viewport: CharacterFrame,
) {
  return (
    !!frame &&
    Number.isFinite(frame.width) &&
    Number.isFinite(frame.height) &&
    frame.width > 0 &&
    frame.height > 0 &&
    Math.abs(frame.width - viewport.width) < 1 &&
    Math.abs(frame.height - viewport.height) < 1
  );
}

/** Reject a blank or opaque black/white initial surface before revealing it. */
export function paintedCharacterFrame(pixels: Uint8ClampedArray) {
  let colored = 0,
    transparent = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) transparent++;
    if (
      pixels[i + 3] > 120 &&
      pixels[i + 1] > pixels[i] + 12 &&
      pixels[i + 1] > pixels[i + 2] + 8
    )
      colored++;
  }
  return colored > 0 && transparent > 0;
}
