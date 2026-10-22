import { useEffect, useRef, useState } from "react";
import { Rive, RuntimeLoader, Layout, Fit, Alignment } from "@rive-app/canvas";
import type { Snapshot } from "./shared";
RuntimeLoader.setWasmUrl(new URL("rive.wasm", window.location.href).href);
export function Character({
  state,
  large = false,
}: {
  state: Snapshot;
  large?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    instance = useRef<Rive | null>(null);
  const latest = useRef(state);
  latest.current = state;
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false);
  const apply = () => {
    const vm = (instance.current as any)?.viewModelInstance;
    if (!vm) return;
    const s = latest.current;
    const talking =
      s.busy && !!s.messages.at(-1)?.text && !s.settings.reducedMotion;
    const set = (name: string, value: boolean) => {
      try {
        const p = vm.boolean(name);
        if (p) p.value = value;
      } catch {}
    };
    set("isDragging", s.dragging);
    set("isSleeping", s.sleeping && !s.dragging);
    set("isThinking", s.busy && !talking && !s.sleeping && !s.dragging);
    set("isFocusing", s.focus.running && !s.sleeping && !s.dragging);
    set("isTalking", talking && !s.sleeping && !s.dragging);
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
        apply();
        timer = setTimeout(() => {
          if (alive) {
            setReady(true);
            try {
              (r as any).viewModelInstance?.trigger("wave")?.trigger();
            } catch {}
          }
        }, 1600);
      },
      onLoadError: () => setError(true),
    } as any);
    instance.current = r;
    const resize = new ResizeObserver(() => r.resizeDrawingSurfaceToCanvas());
    resize.observe(canvas.current!);
    return () => {
      alive = false;
      clearTimeout(timer);
      resize.disconnect();
      r.cleanup();
      instance.current = null;
    };
  }, []);
  useEffect(apply, [
    state.busy,
    state.dragging,
    state.sleeping,
    state.focus.running,
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
    )
      r.pause();
    else r.play();
  }, [
    ready,
    state.settings.reducedMotion,
    state.dragging,
    state.busy,
    state.focus.running,
    state.sleeping,
  ]);
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
