// Disposable synthetic preview: no file reads, screenshot capture or network analysis.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { defaultState } from "../../electron/core";
import type { Snapshot } from "../../src/shared";
if (import.meta.env.DEV) {
  const base = {
    ...defaultState(),
    onboarded: true,
    chatOpen: true,
    busy: false,
    dragging: false,
    hasKey: false,
    demoMode: true,
    messages: [],
  } as Snapshot;
  (window as any).bito = {
    getState: async () => base,
    onState: () => () => {},
    onDelta: () => () => {},
    onGaze: () => () => {},
    onDragMotion: () => () => {},
    setHit() {},
    setChatRegions() {},
    command: async () => ({ ok: true }),
    toggleChat() {},
    contextMenu() {},
    dragStart() {},
    dragMove() {},
    dragEnd() {},
  };
  const { DesktopChat } = await import("../../src/DesktopChat");
  const { BitoTheme } = await import("../../src/ui/BitoTheme");
  await import("../../src/style.css");
  await import("../../src/DesktopChat.css");
  await import("../../src/ui/astryx-bito.css");
  await import("../../src/ui/workspace.css");
  await import("../../src/ui/product.css");
  function Fixture() {
    const [state, set] = useState(base);
    async function act(name: string, p: any) {
      if (name === "chat-prepare-files")
        return {
          ok: true,
          value: [
            {
              id: "test-file",
              name: "Bito-reference.png",
              kind: "image",
              preview: {
                name: "Bito-reference.png",
                kind: "image",
                thumbnail: "/icon.png",
              },
            },
          ],
        };
      if (name === "clear-selected-area")
        set((s) => ({ ...s, selectedArea: undefined }));
      if (name === "select-area")
        set((s) => ({
          ...s,
          selectedArea: {
            id: "synthetic",
            width: 100,
            height: 100,
            capturedAt: Date.now(),
            thumbnail: "/icon.png",
          },
        }));
      if (name === "send")
        set((s) => ({
          ...s,
          selectedArea: undefined,
          messages: [
            ...s.messages,
            {
              id: "sent",
              role: "user",
              text: p.text,
              createdAt: Date.now(),
              ...(p.attachmentIds?.length
                ? {
                    attachments: [
                      { name: "Bito-reference.png", kind: "image" as const },
                    ],
                  }
                : {}),
              ...(s.selectedArea
                ? { selectedArea: { id: "synthetic", width: 100, height: 100 } }
                : {}),
            },
          ],
          messagePreviews: {
            sent: [
              {
                name: "Bito-reference.png",
                kind: "image",
                thumbnail: "/icon.png",
              },
            ],
          },
        }));
      return { ok: true };
    }
    return (
      <BitoTheme>
        <DesktopChat
          state={state}
          act={act}
          panels={{ focus: null, tasks: null }}
        />
      </BitoTheme>
    );
  }
  createRoot(document.getElementById("root")!).render(<Fixture />);
}
