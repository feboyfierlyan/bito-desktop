import type { Snapshot } from "./shared";
/** Independent speaking sources must not mask one another (e.g. a waiting guide). */
export function characterSpeaking(s: Snapshot) {
  if (s.settings.reducedMotion || s.dragging) return false;
  if (s.presentation) return s.presentation.talking;
  if (s.sleeping) return false;
  return !!s.greeting?.talking || s.guideActivity === "talking" ||
    (s.replyActivity?.phase === "talking") ||
    (s.busy && !s.replyActivity && !s.guideActivity && s.messages.at(-1)?.role === "assistant" && !!s.messages.at(-1)?.text);
}
export class SpeechHold {
  private until = 0;
  update(speaking: boolean, now: number) {
    if (speaking) this.until = now + 480;
    return speaking || now < this.until;
  }
  reset() { this.until = 0; }
}
