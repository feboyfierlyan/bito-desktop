import { placeChatPanel } from "../src/chat-layout";
import { desktopWelcome, type BitoStyle } from "../src/bito-voice";

// Reading time starts after the reveal and freezes during hover or dragging.
export class GreetingLifetime {
  private last = 0;
  private remaining = 8000;
  private ready = false;
  constructor(text = "") {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    this.remaining = Math.min(18000, Math.max(8000, words * 260));
  }
  revealDone(now: number) {
    if (this.ready) return;
    this.ready = true;
    this.last = now;
  }
  tick(now: number, paused: boolean) {
    if (!this.ready) return false;
    const elapsed = Math.max(0, now - this.last);
    this.last = now;
    if (!paused) this.remaining -= elapsed;
    return this.remaining <= 0;
  }
}

export function welcomeText(name: string, style: BitoStyle = "chill") {
  return desktopWelcome(name, style);
}

// Keep the native viewport identical for a greeting and its full conversation.
// The greeting's 17px content inset supplies the closer visual gap in CSS.
export function placeGreeting(
  chat: { x: number; width: number },
  petSize: number,
  side: "left" | "right",
  area: { x: number; width: number },
) {
  return placeChatPanel(chat, petSize, side, area);
}
