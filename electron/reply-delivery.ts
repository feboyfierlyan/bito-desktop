import { setTimeout as delay } from "node:timers/promises";
import { splitReplyBubbles, bubblePause } from "../src/reply-bubbles";

/** One model stream, sequential UI delivery. A stop cancels delayed bubbles too. */
export function createReplyDelivery(options: {
  signal: AbortSignal;
  reducedMotion?: boolean;
  verbatim?: boolean;
  onText: (bubble: number, delta: string) => void;
  onPhase: (phase: "thinking" | "talking") => void;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}) {
  let raw = "",
    parsed: string[] = [],
    active = -1,
    ended = false;
  let chain = Promise.resolve(),
    failure: unknown;
  const wait =
    options.wait || ((ms, signal) => delay(ms, undefined, { signal }));
  const enqueue = (parts: string[]) => {
    parts.forEach((text, index) => {
      const before = parsed[index] || "";
      const delta = text.slice(before.length);
      if (!delta) return;
      const previous = parts[index - 1] || "";
      chain = chain
        .then(async () => {
          if (failure) throw failure;
          options.signal.throwIfAborted();
          if (active !== index && index > 0) {
            options.onPhase("thinking");
            await wait(bubblePause(previous, parts[index]), options.signal);
            options.signal.throwIfAborted();
          }
          if (active !== index) options.onPhase("talking");
          active = index;
          options.onText(index, delta);
        })
        .catch((error) => {
          failure ??= error;
        });
    });
    parsed = parts;
  };
  return {
    push(delta: string) {
      if (ended || options.signal.aborted) return;
      raw += delta;
      enqueue(splitReplyBubbles(raw, false, options.verbatim));
    },
    async finish() {
      if (!ended) {
        ended = true;
        enqueue(splitReplyBubbles(raw, true, options.verbatim));
      }
      await chain;
      if (failure) throw failure;
      options.signal.throwIfAborted();
    },
  };
}
