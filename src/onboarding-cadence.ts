export const conversationTiming = {
  reply: 340,
  nextMessage: 360,
  flow: 380,
  reverseReveal: 180,
} as const;

// A newer navigation or reply replaces pending work. Cleared callbacks cannot
// reinsert a message after the user has already moved to another step.
export class ConversationCadence {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  cancel() {
    this.generation += 1;
    clearTimeout(this.timer);
  }
  schedule(delay: number, callback: () => void) {
    this.cancel();
    const generation = this.generation;
    this.timer = setTimeout(() => {
      if (generation === this.generation) callback();
    }, delay);
  }
}
