import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { animatePetRelease, releaseTransform, type PetRelease } from "../src/pet-release";

test("release scales a fixed canvas with no fade or layout frames, and waits for paint before acknowledging", () => {
  const dom = new JSDOM("<div id='pet'></div>");
  const element = dom.window.document.querySelector<HTMLElement>("#pet")!;
  const release: PetRelease = { id: "release", width: 282, height: 282, duration: 560,
    target: { x: 35, y: 70, width: 212, height: 212 } };
  let keyframes: Keyframe[] = [];
  let options: KeyframeAnimationOptions | undefined;
  let cancelled = false;
  const animation = { onfinish: null as (() => void) | null, cancel() { cancelled = true; } };
  element.animate = ((frames: Keyframe[], config: KeyframeAnimationOptions) => {
    keyframes = frames; options = config; return animation;
  }) as HTMLElement["animate"];
  let paint: (() => void) | undefined;
  globalThis.requestAnimationFrame = callback => { paint = () => callback(0); return 1; };
  globalThis.cancelAnimationFrame = () => { paint = undefined; };
  const acknowledgements: string[] = [];
  const cleanup = animatePetRelease(element, release, id => acknowledgements.push(id));
  assert.equal(element.style.width, "282px");
  assert.equal(element.style.height, "282px");
  assert.deepEqual(keyframes.map(frame => Object.keys(frame)), [["transform"], ["transform"]]);
  assert.equal(keyframes[1].transform, `translate3d(50px, 70px, 0) scale(${182 / 282})`);
  assert.equal(options?.fill, "forwards");
  assert.equal(options?.duration, 560);
  animation.onfinish!();
  assert.deepEqual(acknowledgements, [], "completion must follow the final composited frame");
  paint!();
  assert.deepEqual(acknowledgements, ["release"]);
  cleanup();
  assert.equal(cancelled, true);
  assert.equal(element.style.width, "", "handoff restores natural desktop layout");
  assert.equal(element.style.height, "");
  dom.window.close();
});

test("release endpoint includes the desktop dock and centers the same art for different onboarding sizes", () => {
  for (const width of [250, 282, 360]) {
    const result = releaseTransform({id:"test",width,height:width,duration:560,
      target:{x:(width-212)/2,y:width-212,width:212,height:212}});
    assert.equal(result, `translate3d(${(width-182)/2}px, ${width-212}px, 0) scale(${182/width})`);
  }
});
