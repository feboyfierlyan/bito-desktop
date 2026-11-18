import {
  Children,
  isValidElement,
  useId,
  useState,
  type DetailsHTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronRight } from "lucide-react";

/**
 * Accessible disclosure primitive using CSS grid intrinsic height transition
 * (`grid-template-rows: 0fr -> 1fr`, transitions.dev pattern) with zero layout thrash.
 */
export function BitoDisclosure({
  children,
  className = "",
  open,
  ...props
}: DetailsHTMLAttributes<HTMLDivElement>) {
  const [expanded, setExpanded] = useState(Boolean(open));
  const contentId = useId();
  const nodes = Children.toArray(children);
  const summary = nodes.find(
    (node) => isValidElement(node) && node.type === "summary",
  );
  const trigger = isValidElement<{ children?: ReactNode }>(summary)
    ? summary.props.children
    : "Detail";
  const body = nodes.filter((node) => node !== summary);

  return (
    <div
      {...props}
      data-open={expanded}
      className={`bito-disclosure ${expanded ? "is-open" : ""} ${className}`.trim()}
    >
      <button
        type="button"
        className="bito-disclosure-trigger"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <ChevronRight
          size={14}
          className="bito-disclosure-chevron"
          aria-hidden="true"
        />
        <span className="bito-disclosure-title">{trigger}</span>
      </button>
      <div
        id={contentId}
        className="bito-disclosure-grid"
        hidden={!expanded}
      >
        <div className="bito-disclosure-inner">{body}</div>
      </div>
    </div>
  );
}
