import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AuthWindow } from "./AuthWindow";
import { Onboarding } from "./Onboarding";
import { Character } from "./Character";
import { SetupContext } from "./setup-context";
import { isDesktop } from "./bridge";
import type { Reply, Snapshot } from "./shared";
import { nativePresentationVisible, type Rect } from "./handoff";
import "./SetupFlow.css";

type Geometry = { panel: Rect; mascot: Rect };
const sameRect = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) < 0.1 &&
  Math.abs(a.y - b.y) < 0.1 &&
  Math.abs(a.width - b.width) < 0.1 &&
  Math.abs(a.height - b.height) < 0.1;

export function SetupFlow({
  state,
  route,
  act,
}: {
  state: Snapshot;
  route: string;
  act: (name: string, payload?: unknown) => Promise<Reply>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const previousRoute = useRef(route);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [characterReady, setCharacterReady] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const reduced = !!useReducedMotion() || state.settings.reducedMotion;
  const login = route === "auth";
  const phase = state.presentation?.phase || "anchored";
  const nativeOwnsCharacter =
    isDesktop &&
    !login &&
    !!state.presentation?.nativeReady &&
    nativePresentationVisible(
      state.presentation,
      state.presentation?.hostActive !== false,
    );

  useLayoutEffect(() => {
    const changed = previousRoute.current !== route;
    previousRoute.current = route;
    if (!changed || reduced) {
      setTransitioning(false);
      return;
    }
    setTransitioning(true);
    const timer = setTimeout(() => setTransitioning(false), 560);
    return () => clearTimeout(timer);
  }, [route, reduced]);

  useLayoutEffect(() => {
    const page = root.current?.querySelector<HTMLElement>(
      `[data-setup-route="${route}"]`,
    );
    const panel = login ? page?.querySelector<HTMLElement>(".auth-card") : page;
    const mascot = page?.querySelector<HTMLElement>("[data-setup-anchor]");
    if (!root.current || !panel || !mascot) return;
    let frame = 0;
    const measure = () => {
      const origin = root.current!.getBoundingClientRect();
      const relative = (element: HTMLElement): Rect => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x - origin.x,
          y: rect.y - origin.y,
          width: rect.width,
          height: rect.height,
        };
      };
      const next = { panel: relative(panel), mascot: relative(mascot) };
      setGeometry((old) =>
        old &&
        sameRect(old.panel, next.panel) &&
        sameRect(old.mascot, next.mascot)
          ? old
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(root.current);
    observer.observe(panel);
    observer.observe(mascot);
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [route, login]);

  const duration = reduced ? 0 : transitioning ? 0.52 : 0.26;
  const ease = [0.22, 1, 0.36, 1] as const;
  const ready =
    characterReady && (!isDesktop || !!state.presentation?.characterReady);
  return (
    <SetupContext.Provider value={{ ready, transitioning }}>
      <div ref={root} className="setup-flow">
        <img
          className="setup-flow-artwork"
          src={
            new URL("artwork/bito-login-background.svg", window.location.href)
              .href
          }
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <div className="setup-flow-titlebar" aria-hidden="true" />
        {geometry && (
          <motion.div
            className="setup-flow-panel"
            aria-hidden="true"
            initial={false}
            animate={{
              left: geometry.panel.x,
              top: geometry.panel.y,
              width: geometry.panel.width,
              height: geometry.panel.height,
              borderRadius: login ? 19 : 14,
            }}
            transition={{
              default: { type: "tween", duration, ease },
              height: {
                type: "tween",
                duration: login && !transitioning ? 0 : duration,
                ease,
              },
            }}
          />
        )}
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={route}
            data-setup-route={route}
            className={`setup-flow-page ${login ? "setup-flow-page-auth" : "setup-flow-page-onboarding"}`}
            inert={transitioning}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{
              opacity: 0,
              pointerEvents: "none",
              transition: {
                type: "tween",
                duration: reduced ? 0 : 0.14,
                delay: 0,
              },
            }}
            transition={{
              opacity: {
                type: "tween",
                duration: reduced ? 0 : 0.18,
                delay: reduced || login ? 0 : 0.36,
              },
            }}
          >
            {login ? (
              <AuthWindow state={state} />
            ) : (
              <Onboarding
                state={state}
                act={act}
                restart={route === "welcome"}
              />
            )}
          </motion.div>
        </AnimatePresence>
        {geometry && (
          <motion.div
            className="setup-flow-character"
            aria-hidden="true"
            initial={false}
            animate={{
              x: geometry.mascot.x,
              y: geometry.mascot.y,
              scale: geometry.mascot.width / 282,
            }}
            style={{ visibility: nativeOwnsCharacter ? "hidden" : "visible" }}
            transition={{ type: "tween", duration, ease }}
          >
            <Character
              stableResolution
              state={{
                ...state,
                presentation: {
                  ...state.presentation,
                  purpose: login ? "login" : undefined,
                  phase: transitioning ? "returning" : phase,
                  step: login
                    ? 0
                    : (state.presentation?.step ?? state.onboardingStep),
                  talking: !transitioning && !!state.presentation?.talking,
                  characterReady: ready,
                },
              }}
              onReady={() => {
                setCharacterReady(true);
                if (isDesktop) void act("setup-painted");
              }}
            />
          </motion.div>
        )}
      </div>
    </SetupContext.Provider>
  );
}
