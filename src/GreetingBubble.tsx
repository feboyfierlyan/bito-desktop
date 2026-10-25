import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useIsPresent,
  useSpring,
} from "motion/react";
import { Bubble } from "./Bubble";
import { api } from "./bridge";
import { wordDelay } from "./handoff";
import type { Message, Snapshot } from "./shared";

export function GreetingBubble({ state }: { state: Snapshot }) {
  const active =
    !!state.greeting && (!state.chatOpen || state.greeting.phase === "opening");
  const message = state.messages.find(
    (m) => m.id === state.greeting?.messageId,
  );
  return (
    <AnimatePresence>
      {active && message && (
        <Greeting key={message.id} state={state} message={message} />
      )}
    </AnimatePresence>
  );
}

function Greeting({ state, message }: { state: Snapshot; message: Message }) {
  const present = useIsPresent();
  const osReduced = useReducedMotion();
  const reduced = state.settings.reducedMotion || !!osReduced;
  const words = useMemo(() => message.text.split(/\s+/), [message.text]);
  const [count, setCount] = useState(reduced ? words.length : 0);
  const target = useRef<HTMLDivElement>(null);
  const closing = state.greeting?.phase === "dismissing";
  const transferring = state.chatOpen && state.greeting?.phase === "opening";
  const [flying, setFlying] = useState(false);
  const flightSpring = { stiffness: 420, damping: 38, mass: 0.8 };
  const x = useSpring(0, flightSpring),
    y = useSpring(0, flightSpring);
  const width = useSpring(0, flightSpring),
    height = useSpring(0, flightSpring);
  useLayoutEffect(() => {
    if (!transferring || !target.current) return;
    // One visible bubble owns the entire trip. The transcript reserves its final
    // space while its first layout and bottom scroll settle behind the overlay.
    let frame = 0,
      cancelled = false,
      attempts = 0;
    let previous = "",
      stable = 0;
    const destination = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-welcome-message]"),
      )
        .find((el) => el.dataset.welcomeMessage === message.id)
        ?.querySelector<HTMLElement>(".bubble-shell");
    const finish = () => {
      if (!cancelled) void api.command("greeting-opened", message.id);
    };
    const prepare = () => {
      if (cancelled) return;
      const el = destination();
      const rect = el?.getBoundingClientRect();
      if (
        !rect ||
        !rect.width ||
        !rect.height ||
        !el?.closest('[data-handoff-ready="true"]')
      ) {
        if (++attempts < 60) frame = requestAnimationFrame(prepare);
        else finish();
        return;
      }
      const geometry = [rect.x, rect.y, rect.width, rect.height]
        .map(Math.round)
        .join(",");
      stable = previous === geometry ? stable + 1 : 0;
      previous = geometry;
      if (stable < 2 && ++attempts < 60) {
        frame = requestAnimationFrame(prepare);
        return;
      }
      if (reduced) {
        finish();
        return;
      }
      const source = (
        target.current!.querySelector<HTMLElement>(".bubble-shell") ||
        target.current!
      ).getBoundingClientRect();
      x.jump(source.x);
      y.jump(source.y);
      width.jump(source.width);
      height.jump(source.height);
      setFlying(true);
      let settled = 0;
      const goals = [NaN, NaN, NaN, NaN];
      const follow = () => {
        if (cancelled) return;
        const to = destination()?.getBoundingClientRect() || rect;
        const axes = [
          [x, to.x],
          [y, to.y],
          [width, to.width],
          [height, to.height],
        ] as const;
        const atRest = axes.every(
          ([value, goal]) =>
            Math.abs(value.get() - goal) < 0.2 &&
            Math.abs(value.getVelocity()) < 3,
        );
        axes.forEach(([value, goal], i) => {
          if (goals[i] !== goal) {
            value.set(goal);
            goals[i] = goal;
          }
        });
        settled = atRest ? settled + 1 : 0;
        if (settled >= 2) {
          for (const [value, goal] of axes) value.jump(goal);
          finish();
        } else frame = requestAnimationFrame(follow);
      };
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(prepare);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      x.stop();
      y.stop();
      width.stop();
      height.stop();
    };
  }, [transferring, message.id, reduced, x, y, width, height]);
  useEffect(() => {
    if (!present || transferring) {
      setCount(words.length);
      return;
    }
    let timer: ReturnType<typeof setTimeout>,
      cancelled = false,
      index = 0;
    const speaking = (talking: boolean) =>
      void api.command("greeting-speaking", { messageId: message.id, talking });
    const finish = () => {
      if (cancelled) return;
      setCount(words.length);
      speaking(false);
      void api.command("greeting-ready", message.id);
    };
    if (reduced) {
      finish();
      return;
    }
    const reveal = () => {
      if (cancelled) return;
      setCount(++index);
      timer = setTimeout(
        index === words.length ? finish : reveal,
        wordDelay(words[index - 1]) * 0.48,
      );
    };
    timer = setTimeout(() => {
      speaking(true);
      reveal();
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      speaking(false);
    };
  }, [message.id, reduced, words, present, transferring]);
  useLayoutEffect(() => {
    if (!present || transferring) return;
    let frame = 0,
      previous = "";
    const report = () => {
      if (target.current) {
        const rect = target.current.getBoundingClientRect();
        const next = JSON.stringify(
          closing
            ? []
            : [
                {
                  x: rect.x - 9,
                  y: rect.y,
                  width: rect.width + 18,
                  height: rect.height,
                },
              ],
        );
        if (next !== previous) {
          previous = next;
          api.setChatRegions(JSON.parse(next));
        }
      }
      frame = requestAnimationFrame(report);
    };
    report();
    return () => cancelAnimationFrame(frame);
  }, [closing, present, transferring]);
  const open = () => {
    if (!closing && !transferring) void api.command("show-chat");
  };
  return (
    <motion.aside
      className="desktop-chat desktop-greeting"
      data-dock={state.chatSide || "right"}
      data-transferring={flying}
      aria-label={message.text}
      aria-live="polite"
      aria-hidden={!present || transferring}
      inert={!present || closing || transferring}
      style={
        {
          "--greeting-lift": `${Math.max(44, Math.min(180, (state.settings.size + 32) * 0.32))}px`,
        } as React.CSSProperties
      }
      initial={false}
      exit={{
        opacity: 0,
        transition: { duration: reduced || transferring ? 0 : 0.12 },
      }}
    >
      <div className="desktop-greeting-anchor">
        <motion.div
          ref={target}
          className="desktop-greeting-hit"
          style={
            flying
              ? { position: "fixed", left: x, top: y, width, height }
              : undefined
          }
          role="button"
          tabIndex={closing ? -1 : 0}
          aria-label="Buka percakapan dengan Bito"
          data-chat-hit
          onClick={open}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              open();
            }
          }}
        >
          <Bubble
            className="bubble desktop-bubble desktop-welcome-bubble"
            liquid
            reduced={reduced}
            closing={closing}
            handoffTail={flying && state.chatSide === "left"}
          >
            <p aria-hidden="true">
              {words.map((word, i) => (
                <span
                  key={i}
                  className={`greeting-word ${i < count ? "revealed" : ""}`}
                >
                  {word}
                  {i < words.length - 1 ? " " : ""}
                </span>
              ))}
            </p>
          </Bubble>
        </motion.div>
      </div>
    </motion.aside>
  );
}
