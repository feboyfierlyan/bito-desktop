import { test } from "node:test";
import assert from "node:assert/strict";
import { anchoredScrollTop, reflowWords } from "../src/chat-reflow";

test("reading anchor follows paragraph reflow and clamps safely at scroll edges", () => {
  assert.equal(anchoredScrollTop(520, 30, 1200), 490);
  assert.equal(anchoredScrollTop(730, 30, 1400), 700);
  assert.equal(anchoredScrollTop(10, 30, 100), 0);
  assert.equal(anchoredScrollTop(900, 20, 600), 600);
  assert.equal(anchoredScrollTop(10, 30, -10), 0);
});

test("word reflow preserves whitespace, emphasis, links and long tokens without modifying code", () => {
  const text = (value: string) => ({ type: "text", value });
  const code = {
    type: "element",
    tagName: "pre",
    children: [
      {
        type: "element",
        tagName: "code",
        children: [text("const x = 1;\n  x++;")],
      },
    ],
  };
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        children: [
          text("Halo  Bito!\n"),
          {
            type: "element",
            tagName: "strong",
            children: [text("Tetap halus")],
          },
          {
            type: "element",
            tagName: "a",
            properties: { href: "https://example.com" },
            children: [text("tautan panjang")],
          },
        ],
      },
      code,
    ],
  };
  const original = structuredClone(tree);
  reflowWords()(tree);
  function flatten(node: { value?: string; children?: unknown[] }): string {
    return (
      node.value ||
      (node.children || [])
        .map((child) => flatten(child as typeof node))
        .join("")
    );
  }
  assert.equal(flatten(tree), flatten(original));
  assert.deepEqual(code, original.children[1]);
  assert.equal(tree.children[0].children?.[2].type, "element");
});
