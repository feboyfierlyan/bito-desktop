import { useEffect, useRef, useState } from "react";
import { Rive, Layout, Fit, Alignment } from "@rive-app/canvas";
import type { Snapshot } from "./shared";
import { api, isDesktop } from "./bridge";
import { canTrackGaze, neutralGaze } from "./gaze";
import { createEyeRig } from "./eye-rig";
import { warmCharacterAssets, characterPosterUrl } from "./character-assets";
import { paintedCharacterFrame, type CharacterFrame } from "./character-frame";
export function Character({
  state,
  large = false,
  stableResolution = false,
  nativeSurface = false,
  onReady,
}: {
  state: Snapshot;
  large?: boolean;
  stableResolution?: boolean;
  nativeSurface?: boolean;
  onReady?: (frame: CharacterFrame) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    instance = useRef<Rive | null>(null);
  const latest = useRef(state);
  const fixedResolution = useRef(stableResolution);
  fixedResolution.current = stableResolution;
  const gaze = useRef(neutralGaze);
  const eyeRig = useRef<ReturnType<typeof createEyeRig>>(null);
  latest.current = state;
  const readyCallback = useRef(onReady);
  const playedWave = useRef({ desktop: 0, onboarding: 0 });
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
        : s.greeting?.talking ||
          (s.busy &&
            (s.replyActivity
              ? s.replyActivity.phase === "talking"
              : !!s.messages.at(-1)?.text))) && !s.settings.reducedMotion;
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
    let paintFrame = 0;
    let painting = false;
    let loaded = false;
    let r: Rive | undefined;
    let lastReadySize = "";
    let loadedAt = 0;
    let densityQuery: MediaQueryList | undefined;
    const verifyPaint = () => {
      if (!alive || !loaded || !r || painting) return;
      painting = true;
      // onAdvance precedes Rive's draw/flush. Verify in the next animation
      // frame, after that draw completed, rather than guessing a timeout.
      paintFrame = requestAnimationFrame(() => {
        painting = false;
        const target = canvas.current;
        if (!alive || !target || !r) return;
        const context = target.getContext("2d");
        if (!context || !target.width || !target.height) return;
        const pixels = context.getImageData(
          0,
          0,
          target.width,
          target.height,
        ).data;
        if (!paintedCharacterFrame(pixels)) return;
        const frame = { width: innerWidth, height: innerHeight };
        const key = `${frame.width}:${frame.height}`;
        if (key === lastReadySize) return;
        lastReadySize = key;
        setReady(true);
        setError(false);
        performance.mark("bito:character-painted");
        console.debug(
          "Bito character painted",
          Math.round(performance.now() - loadedAt),
          "ms",
          nativeSurface ? "desktop" : "setup",
        );
        readyCallback.current?.(frame);
      });
    };
    const resizeFor = (rive: Rive) => {
      if (!alive || !canvas.current) return;
      let density = window.devicePixelRatio || 1;
      if (fixedResolution.current) {
        // Rive measures the transformed DOM bounds. Render at the unscaled
        // resolution so growing the same canvas never magnifies a small buffer.
        const width = canvas.current.getBoundingClientRect().width;
        if (width > 0) density *= canvas.current.offsetWidth / width;
      }
      rive.resizeDrawingSurfaceToCanvas(density);
    };
    const resizeSurface = () => {
      if (instance.current) {
        resizeFor(instance.current);
        lastReadySize = "";
        instance.current.drawFrame();
        verifyPaint();
      }
    };
    const watchDensity = () => {
      densityQuery?.removeEventListener("change", watchDensity);
      resizeSurface();
      densityQuery = matchMedia(
        `(resolution: ${window.devicePixelRatio || 1}dppx)`,
      );
      densityQuery.addEventListener("change", watchDensity);
    };
    void warmCharacterAssets()
      .then((file) => {
        if (!alive) return;
        r = new Rive({
          riveFile: file,
          canvas: canvas.current!,
          autoplay: true,
          stateMachine: "State Machine 1",
          autoBind: true,
          layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
          onLoad: () => {
            if (!alive) return;
            if (!r) return;
            loaded = true;
            loadedAt = performance.now();
            resizeFor(r);
            eyeRig.current = createEyeRig(r);
            if (!eyeRig.current)
              console.error(
                "Bito eye rig: named pupils missing from the Rive asset",
              );
            apply();
            verifyPaint();
          },
          onLoadError: () => setError(true),
          onAdvance: (event: { data: number }) => {
            eyeRig.current?.advance(
              gaze.current,
              event.data,
              canTrackGaze(latest.current),
            );
            if (!lastReadySize) verifyPaint();
          },
        } as any);
        instance.current = r;
      })
      .catch(() => {
        if (alive) setError(true);
      });
    const resize = new ResizeObserver(resizeSurface);
    resize.observe(canvas.current!);
    window.addEventListener("resize", resizeSurface);
    watchDensity();
    return () => {
      alive = false;
      cancelAnimationFrame(paintFrame);
      resize.disconnect();
      window.removeEventListener("resize", resizeSurface);
      densityQuery?.removeEventListener("change", watchDensity);
      eyeRig.current?.restore();
      eyeRig.current = null;
      r?.cleanup();
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
    state.greeting?.talking,
    state.replyActivity?.phase,
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
    const source = state.presentation ? "onboarding" : "desktop";
    const request = state.presentation
      ? state.presentation.wave
      : state.chatWave;
    if (!ready || !r || !request || playedWave.current[source] === request)
      return;
    playedWave.current[source] = request;
    // The parked native renderer must not queue the login wave for step 3.
    if (nativeSurface && state.presentation) return;
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
  }, [ready, state.presentation?.wave, !!state.presentation, state.chatWave]);
  return (
    <div
      className={`character ${large ? "character-large" : ""}`}
      data-character-ready={ready}
    >
      <img
        className={`character-poster ${ready ? "ready" : ""}`}
        src={characterPosterUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <canvas
        ref={canvas}
        className={ready ? "ready" : ""}
        aria-label="Karakter Bito"
      />
      {error && (
        <span className="sr-only" role="status">
          Animasi Bito belum bisa dimuat.
        </span>
      )}
    </div>
  );
}
