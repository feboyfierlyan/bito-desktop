type TextNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: TextNode[];
};

// Keep Markdown semantics and selectable text; code retains its own horizontal scroll.
export function reflowWords() {
  return (tree: TextNode) => {
    const visit = (node: TextNode) => {
      if (
        !node.children ||
        ["pre", "code", "svg", "math"].includes(node.tagName || "")
      )
        return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text" || !child.value) {
          visit(child);
          return [child];
        }
        return child.value
          .split(/(\s+)/u)
          .filter(Boolean)
          .map((value): TextNode =>
            /^\s+$/u.test(value)
              ? { type: "text", value }
              : {
                  type: "element",
                  tagName: "span",
                  properties: { className: ["chat-reflow-word"] },
                  children: [{ type: "text", value }],
                },
          );
      });
    };
    visit(tree);
  };
}

export function anchoredScrollTop(
  contentTop: number,
  viewportOffset: number,
  maxScroll: number,
) {
  return Math.max(0, Math.min(maxScroll, contentTop - viewportOffset));
}

function contentTop(node: HTMLElement, viewport: HTMLElement) {
  let top = 0;
  for (
    let el: HTMLElement | null = node;
    el && el !== viewport;
    el = el.offsetParent as HTMLElement | null
  )
    top += el.offsetTop;
  return top;
}

export function createChatReflow(
  viewport: HTMLElement,
  stack: HTMLElement,
  reduced: () => boolean,
  following: () => boolean,
) {
  let anchor: { node: HTMLElement; offset: number } | undefined;
  let width = viewport.clientWidth;
  let positions = new Map<
    HTMLElement,
    { x: number; y: number; animation?: Animation }
  >();
  const visibleWords = () =>
    Array.from(stack.querySelectorAll<HTMLElement>(".desktop-message"))
      .filter((el) => {
        const top = contentTop(el, viewport);
        return (
          top + el.offsetHeight >= viewport.scrollTop - 40 &&
          top <= viewport.scrollTop + viewport.clientHeight + 40
        );
      })
      .flatMap((el) =>
        Array.from(el.querySelectorAll<HTMLElement>(".chat-reflow-word")),
      );
  const capture = () => {
    if (following()) {
      anchor = undefined;
      return;
    }
    const node = visibleWords().find(
      (el) => contentTop(el, viewport) >= viewport.scrollTop + 22,
    );
    if (node)
      anchor = {
        node,
        offset: contentTop(node, viewport) - viewport.scrollTop,
      };
  };
  const reflow = () => {
    if (following()) {
      // Geometry changes should preserve the bottom exactly, without a second scroll chase.
      viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
    } else if (anchor?.node.isConnected) {
      viewport.scrollTop = anchoredScrollTop(
        contentTop(anchor.node, viewport),
        anchor.offset,
        viewport.scrollHeight - viewport.clientHeight,
      );
    }
    const changed = width !== viewport.clientWidth;
    width = viewport.clientWidth;
    const next = new Map<
      HTMLElement,
      { x: number; y: number; animation?: Animation }
    >();
    for (const word of visibleWords()) {
      const previous = positions.get(word);
      const position = {
        x: word.offsetLeft,
        y: word.offsetTop,
        animation: previous?.animation,
      };
      if (
        changed &&
        previous &&
        !reduced() &&
        (previous.x !== position.x || previous.y !== position.y)
      ) {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(word).transform);
        const x = previous.x + matrix.m41 - position.x,
          y = previous.y + matrix.m42 - position.y;
        previous.animation?.cancel();
        position.animation = word.animate(
          [
            { transform: `translate(${x}px, ${y}px)` },
            { transform: "translate(0px, 0px)" },
          ],
          { duration: 150, easing: "cubic-bezier(.22,1,.36,1)" },
        );
      }
      next.set(word, position);
    }
    for (const [word, previous] of positions)
      if (!next.has(word)) previous.animation?.cancel();
    positions = next;
    capture();
  };
  reflow();
  return {
    capture,
    reflow,
    dispose() {
      for (const item of positions.values()) item.animation?.cancel();
      positions.clear();
    },
  };
}
