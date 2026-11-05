import { createHash } from "node:crypto";
import {
  containsScreenRect,
  resolveGroundingTarget,
  type GroundingResult,
  type GuideContext,
  type ScreenRect,
  type ScreenElement,
} from "../src/grounding";
import { interfaceSignature } from "./guide-observation";
import type { ExternalWindow, InterfaceObservation } from "./screen-context";

type Observation = {
  window: ExternalWindow;
  view: InterfaceObservation | null;
  frame: ScreenRect;
  pixels: Uint8Array;
  context: GuideContext;
  style: string;
};
/** Exact, short-lived, per-guide memoization. No images, UI text or routes are
 * persisted. A hit still requires this observation's enabled native target. */
export class GuideResultCache {
  private entries = new Map<string, { at: number; result: GroundingResult }>();
  private key(o: Observation) {
    return createHash("sha256")
      .update(
        JSON.stringify([
          o.window,
          o.frame,
          o.style,
          o.context.goal,
          o.context.previous,
          interfaceSignature(o.view),
        ]),
      )
      .update(o.pixels)
      .digest("hex");
  }
  get(o: Observation, now = Date.now()) {
    const key = this.key(o),
      entry = this.entries.get(key);
    if (!entry) return null;
    if (now - entry.at > 120000) {
      this.entries.delete(key);
      return null;
    }
    const id = entry.result.guide?.elementId;
    if (
      !o.view?.accessible ||
      o.view.frontPid !== o.window.pid ||
      !o.view.elements.some((e) => e.id === id && e.enabled && e.hitVerified) ||
      !resolveGroundingTarget(entry.result, o.frame, o.view.elements)
    )
      return null;
    return structuredClone(entry.result);
  }
  put(o: Observation, result: GroundingResult, now = Date.now()) {
    if (
      result.status !== "found" ||
      result.confidence < 0.9 ||
      !result.guide?.elementId ||
      !["initial", "advanced"].includes(result.guide.progress) ||
      result.explanation?.length
    )
      return;
    const key = this.key(o);
    this.entries.delete(key);
    this.entries.set(key, { at: now, result: structuredClone(result) });
    while (this.entries.size > 12)
      this.entries.delete(this.entries.keys().next().value!);
  }
}
export type MenuContinuation = {
  hint: NonNullable<NonNullable<GroundingResult["guide"]>["nextMenu"]>;
  trigger: Pick<ScreenElement, "id" | "name" | "role">;
  windowId: string;
  pid: number;
};
/** The model may propose an intent, never hidden coordinates. Only a unique,
 * OS hit-tested menu item beneath the same visible trigger can use this path.
 * Unsupported AX/UIA trees, disabled/occluded items and ambiguity fall back. */
export function menuContinuation(
  result: GroundingResult,
  window: ExternalWindow,
  view: InterfaceObservation | null,
): MenuContinuation | undefined {
  const hint = result.guide?.nextMenu;
  const trigger = view?.elements.find(
    (e) => e.id === result.guide?.elementId && e.enabled && e.hitVerified,
  );
  if (
    !hint ||
    result.status !== "found" ||
    result.confidence < 0.9 ||
    !trigger ||
    !["AXMenuBarItem", "AXPopUpButton"].includes(trigger.role) ||
    !trigger.name.trim()
  )
    return;
  return {
    hint,
    trigger: { id: trigger.id, name: trigger.name, role: trigger.role },
    windowId: window.id,
    pid: window.pid,
  };
}
export function resolveMenuContinuation(
  plan: MenuContinuation | undefined,
  window: ExternalWindow,
  view: InterfaceObservation | null,
  frame: ScreenRect,
): GroundingResult | null {
  if (
    !plan ||
    !view?.accessible ||
    view.frontPid !== window.pid ||
    plan.pid !== window.pid ||
    plan.windowId !== window.id
  )
    return null;
  const trigger = view.elements.find(
    (e) =>
      e.id === plan.trigger.id &&
      e.name === plan.trigger.name &&
      e.role === plan.trigger.role &&
      e.enabled,
  );
  if (!trigger) return null;
  const normalize = (s: string) =>
    s.normalize("NFKC").trim().toLocaleLowerCase();
  const candidates = view.elements.filter(
    (e) =>
      e.role === "AXMenuItem" &&
      e.id.startsWith(trigger.id + ".") &&
      normalize(e.name) === normalize(plan.hint.name),
  );
  if (candidates.length !== 1) return null;
  const e = candidates[0],
    b = e.bounds;
  if (!e.enabled || !e.hitVerified || !containsScreenRect(frame, b))
    return null;
  return {
    status: "found",
    answer: plan.hint.instruction,
    label: e.name,
    confidence: 1,
    box: [
      ((b.y - frame.y) / frame.height) * 1000,
      ((b.x - frame.x) / frame.width) * 1000,
      ((b.y + b.height - frame.y) / frame.height) * 1000,
      ((b.x + b.width - frame.x) / frame.width) * 1000,
    ],
    guide: {
      progress: "advanced",
      expected: plan.hint.expected,
      evidence: `Visible menu item under ${trigger.name}: ${e.name}`,
      elementId: e.id,
    },
  };
}
export class GuideTimings {
  private samples: { stage: string; milliseconds: number; source?: string }[] =
    [];
  record(stage: string, started: number, source?: string) {
    this.samples.push({
      stage,
      milliseconds: Math.round((performance.now() - started) * 10) / 10,
      ...(source ? { source } : {}),
    });
    this.samples = this.samples.slice(-80);
  }
  async measure<T>(stage: string, run: () => Promise<T>) {
    const start = performance.now();
    try {
      return await run();
    } finally {
      this.record(stage, start);
    }
  }
  snapshot() {
    return this.samples.map((s) => ({ ...s }));
  }
}
