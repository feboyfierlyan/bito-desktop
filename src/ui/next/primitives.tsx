import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  loading = false,
  disabled,
  type = "button",
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-variant={variant}
      className={`bx-button ${className}`.trim()}
    >
      {loading && <LoaderCircle size={14} className="bx-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Icon-only button; `label` is required because there is no visible text. */
export function IconButton({
  label,
  tone = "neutral",
  type = "button",
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "neutral" | "primary";
}) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={label}
      data-tone={tone}
      className={`bx-icon-button ${className}`.trim()}
    >
      {children}
    </button>
  );
}

export function TextField({
  label,
  error,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className="bx-field">
      <label className="bx-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`bx-input ${className}`.trim()}
      />
      {error && (
        <span id={`${id}-error`} className="bx-field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="bx-toggle"
      onClick={() => onChange(!checked)}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className="bx-check"
      onClick={() => onChange(!checked)}
    >
      <Check size={13} strokeWidth={3} aria-hidden />
    </button>
  );
}

export type SegmentedOption<T extends string> = { value: T; label: string };

/** Radio group whose pill indicator slides to the active option. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (next: T) => void;
  label: string;
}) {
  const layoutId = useId();
  const reduced = useReducedMotion();
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + step + options.length) % options.length];
    onChange(next.value);
    const buttons = event.currentTarget.querySelectorAll("button");
    buttons[options.indexOf(next)]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="bx-segmented"
      onKeyDown={move}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className="bx-segmented-item"
            onClick={() => onChange(option.value)}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="bx-segmented-thumb"
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 520, damping: 38 }
                }
              />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  image,
  action,
}: {
  title: string;
  text?: string;
  image?: string;
  action?: ReactNode;
}) {
  return (
    <div className="bx-empty">
      {image && <img src={image} alt="" />}
      <div>
        <b>{title}</b>
        {text && <small>{text}</small>}
      </div>
      {action}
    </div>
  );
}
