import {
  Children,
  isValidElement,
  useRef,
  useState,
  type DetailsHTMLAttributes,
  type ReactNode,
} from "react";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { useAnimatedLayout } from "@astryxdesign/core/hooks";

/** Keeps existing disclosure content, with Astryx focus, semantics and measured motion. */
export function BitoDisclosure({
  children,
  className = "",
  open,
  ...props
}: DetailsHTMLAttributes<HTMLDivElement>) {
  const root = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLElement | null>(null);
  const animatedLayout = useAnimatedLayout({ containerRef: container });
  const [expanded, setExpanded] = useState(open ?? false);
  const nodes = Children.toArray(children);
  const summary = nodes.find(
    (node) => isValidElement(node) && node.type === "summary",
  );
  const trigger = isValidElement<{ children?: ReactNode }>(summary)
    ? summary.props.children
    : "Detail";
  return (
    <Collapsible
      {...props}
      ref={(node) => {
        root.current = node;
        container.current =
          node?.closest<HTMLElement>(
            ".workspace-dialog-body, .project-content, .project-board-main, .desktop-messages",
          ) ??
          node?.parentElement ??
          null;
      }}
      className={`bito-disclosure ${className}`}
      isOpen={expanded}
      onOpenChange={setExpanded}
      data-open={expanded}
      trigger={trigger}
      animatedLayout={animatedLayout}
    >
      {nodes.filter((node) => node !== summary)}
    </Collapsible>
  );
}
