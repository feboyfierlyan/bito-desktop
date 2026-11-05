import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
/** Menus float outside the animated chat mask; opening one never grows the chat. */
export function ChatPopover({
  anchor,
  children,
  onGeometry,
  width = 232,
}: {
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  onGeometry: () => void;
  width?: number;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const host = anchor.current?.closest(".desktop-chat");
  useLayoutEffect(() => {
    const node = layer.current,
      target = anchor.current;
    if (!node || !target) return;
    const place = () => {
      const a = target.getBoundingClientRect();
      const w = Math.min(width, innerWidth - 32);
      node.style.width = `${w}px`;
      node.style.left = `${Math.max(16, Math.min(a.left, innerWidth - w - 16))}px`;
      const space = Math.max(60, a.top - 22);
      node.style.maxHeight = `${space}px`;
      node.style.top = `${Math.max(12, a.top - node.offsetHeight - 6)}px`;
      onGeometry();
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(node);
    resize.observe(target);
    window.addEventListener("resize", place);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchor, onGeometry, width]);
  return host
    ? createPortal(
        <div ref={layer} className="desktop-chat-overlay" data-chat-overlay>
          {children}
        </div>,
        host,
      )
    : null;
}
