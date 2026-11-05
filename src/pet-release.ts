/** The canvas stays at its onboarding resolution throughout this animation. */
export type PetRelease = {
  id: string;
  width: number;
  height: number;
  target: { x: number; y: number; width: number; height: number };
  duration: number;
};

export const PET_DOCK_HEIGHT = 30;
export const PET_RELEASE_DURATION = 560;

export function releaseTransform(release: PetRelease) {
  const { width, height, target } = release;
  const visualHeight = target.height - PET_DOCK_HEIGHT;
  const scale = Math.min(target.width / width, visualHeight / height);
  const x = target.x + (target.width - width * scale) / 2;
  const y = target.y + (visualHeight - height * scale) / 2;
  return `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
}

export function animatePetRelease(
  element: HTMLElement,
  release: PetRelease,
  complete: (id: string) => void,
) {
  // Animating native bounds reallocates the Rive surface on each resize. Keep
  // the layout/buffer fixed and let Chromium composite just one transform.
  element.style.width = `${release.width}px`;
  element.style.height = `${release.height}px`;
  element.style.transformOrigin = "0 0";
  element.style.willChange = "transform";
  const animation = element.animate(
    [{ transform: "translate3d(0, 0, 0) scale(1)" },
      { transform: releaseTransform(release) }],
    { duration: release.duration, easing: "cubic-bezier(.22,.8,.24,1)", fill: "forwards" },
  );
  let paint = 0;
  animation.onfinish = () => {
    // Keep the final transform until main commits the small native viewport.
    paint = requestAnimationFrame(() => complete(release.id));
  };
  return () => {
    cancelAnimationFrame(paint);
    animation.onfinish = null;
    animation.cancel();
    for (const property of ["width", "height", "transform-origin", "will-change"])
      element.style.removeProperty(property);
  };
}
