import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { Button, IconButton } from "./primitives";

/** Two leaves that sway while Bito works; decorative. */
export function Sprout({ still = false }: { still?: boolean }) {
  return (
    <span className="bx-sprout" data-still={still} aria-hidden>
      <i />
      <i />
    </span>
  );
}

const seconds = (value: number) =>
  `${value.toLocaleString("id-ID", { maximumFractionDigits: 1 })} dtk`;

/** Busy line with a label and elapsed time. */
export function Loader({
  label,
  elapsedSeconds,
}: {
  label: string;
  elapsedSeconds?: number;
}) {
  return (
    <span className="bx-loader" role="status">
      <Sprout />
      <span className="bx-shimmer">{label}</span>
      {elapsedSeconds !== undefined && (
        <span className="bx-loader-time">{seconds(elapsedSeconds)}</span>
      )}
    </span>
  );
}

/** Collapsible trace of what Bito did before answering. */
export function Thinking({
  durationSeconds,
  steps,
  defaultOpen = false,
}: {
  durationSeconds: number;
  steps: readonly string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        className="bx-thinking-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <Sprout still />
        Berpikir {seconds(durationSeconds)}
        <ChevronDown size={13} aria-hidden />
      </button>
      <div id={id} className="bx-thinking-body" data-open={open} inert={!open}>
        <ol>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function Message({
  from,
  children,
}: {
  from: "user" | "bito";
  children: ReactNode;
}) {
  return (
    <div className="bx-message" data-from={from}>
      <div className="bx-message-body">{children}</div>
    </div>
  );
}

/** Streamed answer exposed as one paragraph so screen readers read it whole. */
export function StreamingText({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  return (
    <p aria-busy={streaming || undefined}>
      {text}
      {streaming && <span className="bx-stream-caret" aria-hidden />}
    </p>
  );
}

export function Source({ domain, href }: { domain: string; href?: string }) {
  const content = (
    <>
      <Globe size={10} aria-hidden />
      {domain}
    </>
  );
  return href ? (
    <a className="bx-source" href={href}>
      {content}
    </a>
  ) : (
    <span className="bx-source">{content}</span>
  );
}

export type ToolStatus = "running" | "done" | "error";

export function ToolChip({
  status,
  label,
  onRetry,
}: {
  status: ToolStatus;
  label: string;
  onRetry?: () => void;
}) {
  return (
    <span className="bx-chip" data-status={status} role="status">
      <span className="bx-chip-dot">
        {status === "running" ? (
          <LoaderCircle size={11} className="bx-spin" aria-hidden />
        ) : status === "done" ? (
          <Check size={11} strokeWidth={3} aria-hidden />
        ) : (
          <TriangleAlert size={12} aria-hidden />
        )}
      </span>
      {label}
      {status === "error" && onRetry && (
        <button type="button" className="bx-chip-action" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </span>
  );
}

export function Suggestions({
  items,
  onPick,
}: {
  items: readonly string[];
  onPick: (item: string) => void;
}) {
  return (
    <div className="bx-suggestions">
      {items.slice(0, 2).map((item) => (
        <button
          key={item}
          type="button"
          className="bx-suggestion"
          onClick={() => onPick(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

/** Chat input: Enter sends, Shift+Enter adds a line, IME composition is respected. */
export function Composer({
  value,
  onChange,
  onSubmit,
  placeholder = "Tulis ke Bito…",
  context,
  actions,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (text: string) => void;
  placeholder?: string;
  context?: string;
  actions?: ReactNode;
  maxLength?: number;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = value.trim();
  const over = maxLength !== undefined && value.length > maxLength;
  const canSend = !disabled && text.length > 0 && !over;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    if (canSend) onSubmit(text);
  };
  const nearLimit = maxLength !== undefined && value.length >= maxLength * 0.8;
  return (
    <form
      className="bx-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit(text);
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={keyDown}
      />
      <div className="bx-composer-bar">
        {actions}
        {context && <span className="bx-composer-context">{context}</span>}
        {nearLimit && (
          <span
            className="bx-composer-count"
            data-over={over}
            aria-live="polite"
          >
            {maxLength! - value.length}
          </span>
        )}
        <IconButton
          label="Kirim pesan"
          tone="primary"
          type="submit"
          disabled={!canSend}
          className={nearLimit ? "" : "bx-composer-send"}
        >
          <ArrowUp size={15} strokeWidth={2.6} aria-hidden />
        </IconButton>
      </div>
    </form>
  );
}

/** Ask before an action that saves something. */
export function ApprovalCard({
  title,
  description,
  detail,
  confirmLabel,
  onConfirm,
  onCancel,
  onEdit,
  editLabel = "Ubah",
  busy = false,
}: {
  title: string;
  description?: string;
  detail?: {
    badge?: { top: string; main: string };
    title: string;
    text?: string;
  };
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  editLabel?: string;
  busy?: boolean;
}) {
  const id = useId();
  return (
    <section className="bx-card" role="group" aria-labelledby={id}>
      <h3 id={id} className="bx-card-title">
        {title}
      </h3>
      {description && <p className="bx-card-text">{description}</p>}
      {detail && (
        <div className="bx-approval-detail">
          {detail.badge && (
            <div className="bx-datebadge" aria-hidden>
              <span>{detail.badge.top}</span>
              <b>{detail.badge.main}</b>
            </div>
          )}
          <div>
            <b>{detail.title}</b>
            {detail.text && <small>{detail.text}</small>}
          </div>
        </div>
      )}
      <div className="bx-card-actions">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Batal
        </Button>
        {onEdit && (
          <Button onClick={onEdit} disabled={busy}>
            {editLabel}
          </Button>
        )}
        <Button variant="primary" onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </section>
  );
}

const confidenceLabel = {
  low: "Kurang yakin",
  medium: "Cukup yakin",
  high: "Yakin",
} as const;

/** A suggested next step with how sure Bito is about it. */
export function RecommendationCard({
  title,
  children,
  confidence,
  acceptLabel,
  onAccept,
  onAlternatives,
}: {
  title: string;
  children?: ReactNode;
  confidence: keyof typeof confidenceLabel;
  acceptLabel: string;
  onAccept: () => void;
  onAlternatives?: () => void;
}) {
  const id = useId();
  const level = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
  return (
    <section className="bx-card" role="group" aria-labelledby={id}>
      <h3 id={id} className="bx-card-title">
        {title}
      </h3>
      {children && <p className="bx-card-text">{children}</p>}
      <div className="bx-card-actions">
        <span className="bx-confidence">
          <span className="bx-confidence-bars" aria-hidden>
            {[1, 2, 3].map((bar) => (
              <i key={bar} data-on={bar <= level} />
            ))}
          </span>
          {confidenceLabel[confidence]}
        </span>
        {onAlternatives && (
          <Button onClick={onAlternatives}>Pilihan lain</Button>
        )}
        <Button variant="primary" onClick={onAccept}>
          {acceptLabel}
        </Button>
      </div>
    </section>
  );
}

export type Insight = {
  text: string;
  metrics?: readonly { label: string; value: string; tone?: "good" | "warn" }[];
};

/** Paged summaries; one insight is shown at a time. */
export function InsightCards({
  title,
  insights,
}: {
  title: string;
  insights: readonly Insight[];
}) {
  const [index, setIndex] = useState(0);
  if (insights.length === 0) return null;
  const current = insights[Math.min(index, insights.length - 1)];
  return (
    <section className="bx-card" aria-label={title}>
      <div className="bx-insight-head">
        <span>
          {title} · {index + 1}/{insights.length}
        </span>
        <IconButton
          label="Sebelumnya"
          disabled={index === 0}
          onClick={() => setIndex((value) => value - 1)}
        >
          <ChevronLeft size={13} aria-hidden />
        </IconButton>
        <IconButton
          label="Berikutnya"
          disabled={index >= insights.length - 1}
          onClick={() => setIndex((value) => value + 1)}
        >
          <ChevronRight size={13} aria-hidden />
        </IconButton>
      </div>
      <p className="bx-card-title" aria-live="polite">
        {current.text}
      </p>
      {current.metrics && (
        <div className="bx-insight-metrics">
          {current.metrics.map((metric) => (
            <div
              key={metric.label}
              className="bx-metric"
              data-tone={metric.tone}
            >
              <small>{metric.label}</small>
              <b>{metric.value}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** A piece of material Bito is using: an attachment or a captured screen area. */
export function ContextCard({
  title,
  meta,
  excerpt,
  source,
}: {
  title: string;
  meta?: string;
  excerpt: string;
  source?: string;
}) {
  return (
    <article className="bx-card">
      <div className="bx-context-head">
        <FileText size={14} aria-hidden />
        <b>{title}</b>
        {meta && <small>{meta}</small>}
      </div>
      <p className="bx-context-excerpt">{excerpt}</p>
      {source && <span className="bx-source">{source}</span>}
    </article>
  );
}
