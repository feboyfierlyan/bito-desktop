import { useEffect, useRef, useState } from "react";
import { Rive, RuntimeLoader, Layout, Fit, Alignment } from "@rive-app/canvas";
import type { Snapshot } from "./shared";
import { api, isDesktop } from "./bridge";
import { canTrackGaze, neutralGaze } from "./gaze";
import { createEyeRig } from "./eye-rig";
RuntimeLoader.setWasmUrl(new URL("rive.wasm", window.location.href).href);
export function Character({
  state,
  large = false,
  onReady,
}: {
  state: Snapshot;
  large?: boolean;
  onReady?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    instance = useRef<Rive | null>(null);
  const latest = useRef(state);
  const gaze = useRef(neutralGaze);
  const eyeRig = useRef<ReturnType<typeof createEyeRig>>(null);
  latest.current = state;
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false);
  const apply = () => {
    const vm = (instance.current as any)?.viewModelInstance;
    if (!vm) return;
    const s = latest.current;
    const presenting = !!s.presentation;
    const talking =
      (presenting
        ? s.presentation!.talking
        : s.busy && !!s.messages.at(-1)?.text) && !s.settings.reducedMotion;
    const set = (name: string, value: boolean) => {
      try {
        const p = vm.boolean(name);
        if (p) p.value = value;
      } catch {}
    };
    set("isDragging", s.dragging);
    set("isSleeping", !presenting && s.sleeping && !s.dragging);
    set(
      "isThinking",
      !presenting && s.busy && !talking && !s.sleeping && !s.dragging,
    );
    set(
      "isFocusing",
      !presenting && s.focus.running && !s.sleeping && !s.dragging,
    );
    set("isTalking", talking && (presenting || !s.sleeping) && !s.dragging);
  };
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const r = new Rive({
      src: new URL("bito.riv", window.location.href).href,
      canvas: canvas.current!,
      autoplay: true,
      stateMachine: "State Machine 1",
      autoBind: true,
      layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
      onLoad: () => {
        if (!alive) return;
        r.resizeDrawingSurfaceToCanvas();
        eyeRig.current = createEyeRig(r);
        if (!eyeRig.current)
          console.error(
            "Bito eye rig: named pupils missing from the Rive asset",
          );
        apply();
        timer = setTimeout(() => {
          if (alive) {
            setReady(true);
            readyCallback.current?.();
            try {
              (r as any).viewModelInstance?.trigger("wave")?.trigger();
            } catch {}
          }
        }, 1600);
      },
      onLoadError: () => setError(true),
      onAdvance: (event: { data: number }) => {
        eyeRig.current?.advance(
          gaze.current,
          event.data,
          canTrackGaze(latest.current),
        );
      },
    } as any);
    instance.current = r;
    const resize = new ResizeObserver(() => r.resizeDrawingSurfaceToCanvas());
    resize.observe(canvas.current!);
    return () => {
      alive = false;
      clearTimeout(timer);
      resize.disconnect();
      eyeRig.current?.restore();
      eyeRig.current = null;
      r.cleanup();
      instance.current = null;
    };
  }, []);
  useEffect(() => {
    if (isDesktop)
      return api.onGaze((target) => {
        gaze.current = target;
      });
    const move = (event: PointerEvent) => {
      const rect = canvas.current?.getBoundingClientRect();
      if (rect)
        gaze.current = {
          active: true,
          x: (event.clientX - rect.left) / rect.width,
          y: (event.clientY - rect.top) / rect.height,
        };
    };
    const reset = () => {
      gaze.current = { ...gaze.current, active: false };
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", reset);
    document.documentElement.addEventListener("pointerleave", reset);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", reset);
      document.documentElement.removeEventListener("pointerleave", reset);
    };
  }, []);
  useEffect(apply, [
    state.busy,
    state.dragging,
    state.sleeping,
    state.focus.running,
    state.presentation?.talking,
    !!state.presentation,
    state.settings.reducedMotion,
    !!state.messages.at(-1)?.text,
  ]);
  useEffect(() => {
    const r = instance.current;
    if (!r || !ready) return;
    if (
      state.settings.reducedMotion &&
      !state.dragging &&
      !state.busy &&
      !state.focus.running &&
      !state.sleeping
    ) {
      eyeRig.current?.restore();
      r.pause();
    } else r.play();
  }, [
    ready,
    state.settings.reducedMotion,
    state.dragging,
    state.busy,
    state.focus.running,
    state.sleeping,
  ]);
  useEffect(() => {
    const r = instance.current;
    if (!ready || !r || !state.presentation?.wave) return;
    r.play();
    try {
      (r as any).viewModelInstance?.trigger("wave")?.trigger();
    } catch {}
    const timer = setTimeout(() => {
      const s = latest.current;
      if (
        s.settings.reducedMotion &&
        !s.dragging &&
        !s.busy &&
        !s.focus.running &&
        !s.sleeping
      )
        r.pause();
    }, 1500);
    return () => clearTimeout(timer);
  }, [ready, state.presentation?.wave]);
  const values = Array.from({ length: 256 }, (_, i) =>
    i >= 245 && i <= 250 ? 0 : 1,
  ).join(" ");
  return (
    <div className={`character ${large ? "character-large" : ""}`}>
      <svg
        width="0"
        height="0"
        aria-hidden="true"
        style={{ position: "absolute" }}
      >
        <defs>
          <filter id="artboard-key" colorInterpolationFilters="sRGB">
            <feComponentTransfer in="SourceGraphic" result="key">
              <feFuncR type="discrete" tableValues={values} />
              <feFuncG type="discrete" tableValues={values} />
              <feFuncB type="discrete" tableValues={values} />
            </feComponentTransfer>
            <feColorMatrix
              in="key"
              result="mask"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 1 1 0 0"
            />
            <feComposite in="SourceGraphic" in2="mask" operator="in" />
          </filter>
        </defs>
      </svg>
      <canvas
        ref={canvas}
        className={ready ? "ready" : ""}
        aria-label="Karakter Bito"
      />
      {!ready && (
        <span className="character-loading">
          {error ? "Bito belum termuat" : "b."}
        </span>
      )}
    </div>
  );
}
