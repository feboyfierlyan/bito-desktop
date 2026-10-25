import { RiveFile, RuntimeLoader } from "@rive-app/canvas";

export const characterAssetUrl = new URL(
  "bito.riv?render=transparent-v1",
  location.href,
).href;
export const characterPosterUrl = new URL("bito-poster.png", location.href)
  .href;
RuntimeLoader.setWasmUrl(new URL("rive.wasm", location.href).href);

// A cache belongs to one renderer. Never pass WASM objects between windows.
let prepared: Promise<RiveFile> | undefined;
let retained: RiveFile | undefined;
export function warmCharacterAssets(): Promise<RiveFile> {
  if (prepared) return prepared;
  prepared = (async () => {
    const file = new RiveFile({
      src: characterAssetUrl,
      enableRiveAssetCDN: false,
    });
    await Promise.all([RuntimeLoader.awaitInstance(), file.init()]);
    // Hold one owner reference so unmounting the last canvas cannot discard
    // the cached file. Each Rive instance retains/releases its own reference.
    if (!file.getInstance()) throw Error("Character file did not load");
    retained = file;
    return file;
  })().catch((error) => {
    prepared = undefined;
    throw error;
  });
  return prepared;
}

window.addEventListener(
  "pagehide",
  () => {
    retained?.cleanup();
    retained = undefined;
    prepared = undefined;
  },
  { once: true },
);

const surface = new URLSearchParams(location.search).get("surface");
if (!surface || ["pet", "auth", "onboarding", "welcome"].includes(surface))
  void warmCharacterAssets().catch(() => {});
