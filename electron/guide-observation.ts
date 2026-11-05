import type { InterfaceObservation } from "./screen-context";
import { sameScreenRect, type ScreenRect } from "../src/grounding";

export function interfaceSignature(view: InterfaceObservation | null) {
  return JSON.stringify(
    view?.elements.map((e) => [e.id, e.role, e.name, e.enabled, e.bounds]) ||
      [],
  );
}
/** Ignore carets/compression noise, but notice small menus that occupy much
 * less than the old whole-page 3.5% threshold. Comparison is local, not AI. */
export function guideImageChanged(a: Uint8Array, b: Uint8Array) {
  if (!a.length || a.length !== b.length) return true;
  let different = 0;
  for (let i = 0; i < a.length; i += 4)
    if (
      Math.abs(a[i] - b[i]) +
        Math.abs(a[i + 1] - b[i + 1]) +
        Math.abs(a[i + 2] - b[i + 2]) >
      90
    )
      different++;
  return different / (a.length / 4) > 0.004;
}
/** User activity is only a wake-up signal. Require a changed, settled view
 * before asking the model to verify the expected result. Never advance here. */
export class GuideObservationGate {
  private pendingUntil = 0;
  private candidate?: Uint8Array;
  private candidateSignature?: string;
  private candidateFrame?: ScreenRect;
  private signature: string;
  private observedSignature: string;
  private activity: string;
  private baseline: Uint8Array;
  get settling() {
    return !!this.candidate;
  }
  continueTransition(now: number) {
    this.pendingUntil = now + 6000;
  }
  constructor(
    view: InterfaceObservation | null,
    pixels: Uint8Array,
    private frame?: ScreenRect,
  ) {
    this.activity = view?.activity || "";
    this.signature = interfaceSignature(view);
    this.observedSignature = this.signature;
    this.baseline = pixels;
  }
  unchanged(
    view: InterfaceObservation | null,
    pixels: Uint8Array,
    frame?: ScreenRect,
  ) {
    return (
      !guideImageChanged(this.baseline, pixels) &&
      this.signature === interfaceSignature(view) &&
      (!this.frame || (!!frame && sameScreenRect(this.frame, frame)))
    );
  }
  needsCapture(view: InterfaceObservation | null, now: number) {
    if (!view) return false;
    const signature = interfaceSignature(view);
    if (
      view.activity !== this.activity ||
      this.observedSignature !== signature
    ) {
      this.activity = view.activity;
      this.observedSignature = signature;
      this.pendingUntil = now + 6000;
      this.candidate = undefined;
    }
    return this.pendingUntil > 0 && now <= this.pendingUntil;
  }
  sample(
    view: InterfaceObservation | null,
    pixels: Uint8Array,
    now: number,
    frame?: ScreenRect,
  ) {
    const activity = view?.activity || "";
    if (activity !== this.activity) {
      this.activity = activity;
      this.pendingUntil = now + 6000;
      this.candidate = undefined;
      return false;
    }
    if (now > this.pendingUntil || !this.pendingUntil) return false;
    if (this.unchanged(view, pixels, frame)) {
      this.candidate = undefined;
      return false;
    }
    const signature = interfaceSignature(view);
    if (
      !this.candidate ||
      guideImageChanged(this.candidate, pixels) ||
      this.candidateSignature !== signature ||
      (this.candidateFrame &&
        (!frame || !sameScreenRect(this.candidateFrame, frame)))
    ) {
      this.candidate = pixels;
      this.candidateSignature = signature;
      this.candidateFrame = frame;
      return false;
    }
    this.pendingUntil = 0;
    this.candidate = undefined;
    return true;
  }
}
