import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { CalendarDays, Check, ChevronDown, LoaderCircle } from "lucide-react";
import { BitoCalendar, BitoPopover, type ISODateString } from "./primitives";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "subtle"
  | "danger";

function textLabel(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? textLabel(child.props.children)
          : "",
    )
    .join(" ")
    .trim();
}

export type BitoButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
  label?: string;
  variant?: ButtonVariant;
  isLoading?: boolean;
};

/** Custom accessible button primitive with tactile press state and native form semantics. */
export function BitoButton({
  children,
  label,
  className = "",
  disabled,
  variant,
  isLoading = false,
  type,
  ref,
  onClick,
  ...props
}: BitoButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => buttonRef.current!, []);
  const treatment: ButtonVariant =
    variant ??
    (/(^|\s)([\w-]*primary|auth-google)(\s|$)/.test(className)
      ? "primary"
      : /(^|\s)[\w-]*danger(\s|$)/.test(className)
        ? "danger"
        : /(^|\s)[\w-]*secondary(\s|$)/.test(className)
          ? "secondary"
          : "ghost");
  const computedAriaLabel =
    props["aria-label"] || (!textLabel(children) ? label || props.title : undefined);
  const isDisabled = Boolean(disabled || isLoading);

  return (
    <button
      {...props}
      ref={buttonRef}
      type={type}
      aria-label={computedAriaLabel}
      aria-busy={isLoading || undefined}
      disabled={isDisabled}
      data-bito-variant={treatment}
      className={`bito-button bito-button--${treatment} ${className}`.trim()}
      onClick={(event) => {
        if (isDisabled) {
          event.preventDefault();
          return;
        }
        // If no explicit type was given and this button is NOT inside a <form>,
        // behave safely like type="button"; inside <form>, preserve native submit.
        onClick?.(event);
      }}
    >
      {isLoading && (
        <LoaderCircle size={14} className="bito-button-spinner" aria-hidden="true" />
      )}
      {children !== undefined ? (
        <span className="bito-button-content">{children}</span>
      ) : label ? (
        <span className="bito-button-content">{label}</span>
      ) : null}
    </button>
  );
}
export const MotionBitoButton = motion.create(BitoButton);

type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "onChange" | "value" | "defaultValue" | "size" | "ref"
> & {
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
};

export function BitoSelect({
  children,
  label,
  className = "",
  style,
  value,
  onValueChange,
  disabled,
  required,
  name,
  ...props
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [pos, setPos] = useState({ top: 0, left: 0, width: 180 });

  const options = Children.toArray(children).flatMap((child) =>
    isValidElement<{ value: string; children: ReactNode; disabled?: boolean }>(
      child,
    )
      ? [
          {
            value: String(child.props.value),
            label: textLabel(child.props.children),
            disabled: Boolean(child.props.disabled),
          },
        ]
      : [],
  );

  const selectedOption =
    options.find((opt) => opt.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const width = Math.max(rect.width, 168);
    const estHeight = Math.min(280, options.length * 36 + 12);
    const top =
      rect.bottom + estHeight + 8 > vh && rect.top - estHeight - 6 > 8
        ? rect.top - estHeight - 6
        : rect.bottom + 6;
    const left = Math.max(8, Math.min(rect.left, vw - width - 8));
    setPos({ top, left, width });
    const idx = Math.max(
      0,
      options.findIndex((o) => o.value === value && !o.disabled),
    );
    setActiveIndex(idx);
  }, [open, value, options.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        !target ||
        triggerRef.current?.contains(target) ||
        listboxRef.current?.contains(target)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const commit = (nextVal: string) => {
    onValueChange(nextVal);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      className={`bito-field bito-select-field ${className}`.trim()}
      style={style}
    >
      {name && (
        <input type="hidden" name={name} value={value} required={required} />
      )}
      <button
        {...(props as unknown as ButtonHTMLAttributes<HTMLButtonElement>)}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={label || props["aria-label"] || "Pilih opsi"}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        className="bito-field-control bito-select-trigger"
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
            return;
          }
          if (!open) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const dir = e.key === "ArrowDown" ? 1 : -1;
            let next = activeIndex;
            for (let i = 0; i < options.length; i++) {
              next = (next + dir + options.length) % options.length;
              if (!options[next]?.disabled) {
                setActiveIndex(next);
                break;
              }
            }
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const chosen = options[activeIndex];
            if (chosen && !chosen.disabled) commit(chosen.value);
          }
        }}
      >
        <span className="bito-select-value">{selectedOption?.label ?? ""}</span>
        <ChevronDown size={14} className="bito-select-chevron" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-label={label || props["aria-label"] || "Daftar pilihan"}
            className="bito-select-listbox bito-popover-surface"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              minWidth: pos.width,
            }}
          >
            {options.map((opt, idx) => {
              const selected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={opt.disabled || undefined}
                  data-highlighted={idx === activeIndex || undefined}
                  className={`bito-select-option ${selected ? "is-selected" : ""} ${opt.disabled ? "is-disabled" : ""}`}
                  onMouseEnter={() => {
                    if (!opt.disabled) setActiveIndex(idx);
                  }}
                  onClick={() => {
                    if (!opt.disabled) commit(opt.value);
                  }}
                >
                  <span>{opt.label}</span>
                  {selected && <Check size={14} aria-hidden="true" />}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

type BitoDateProps = {
  id?: string;
  name?: string;
  label?: string;
  "aria-label"?: string;
  className?: string;
  value?: string;
  min?: string;
  max?: string;
  presentation?: "native" | "popover";
  onValueChange?: (value: ISODateString | null) => void;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  ref?: Ref<HTMLInputElement>;
};

function isoDate(value?: string): ISODateString | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? (value as ISODateString)
    : undefined;
}

export function BitoDateInput({
  id,
  name,
  label,
  className = "",
  value,
  min,
  max,
  presentation = "popover",
  onValueChange,
  disabled,
  required,
  autoFocus,
  ref,
  ...props
}: BitoDateProps) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => input.current!, []);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const valid = isoDate(value);
  const validMin = isoDate(min);
  const validMax = isoDate(max);
  const accessibleLabel = label || props["aria-label"] || "Tanggal";

  return (
    <div className={`bito-field bito-date-field ${className}`.trim()}>
      <input
        ref={input}
        id={id}
        name={name}
        type="date"
        aria-label={accessibleLabel}
        className="bito-field-control bito-date-native"
        value={valid ?? ""}
        min={validMin}
        max={validMax}
        disabled={disabled}
        required={required}
        onChange={(e) => {
          const next = e.target.value;
          if (!next) {
            onValueChange?.(null);
            return;
          }
          const parsed = isoDate(next);
          if (parsed) onValueChange?.(parsed);
        }}
      />
      {presentation !== "native" && (
        <BitoPopover
          label={accessibleLabel}
          isOpen={open}
          onOpenChange={setOpen}
          placement="below"
          alignment="end"
          width={284}
          content={
            <BitoCalendar
              value={valid ?? null}
              min={validMin}
              max={validMax}
              weekStartsOn="mon"
              onChange={(picked) => {
                onValueChange?.(picked);
                setOpen(false);
              }}
            />
          }
        >
          <button
            type="button"
            className="bito-date-picker-btn"
            aria-label={open ? "Tutup kalender" : "Buka kalender"}
            disabled={disabled}
          >
            <CalendarDays size={14} />
          </button>
        </BitoPopover>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
  label?: string;
};

export function BitoInput({
  label,
  className = "",
  style,
  type = "text",
  value,
  defaultValue,
  onChange,
  disabled,
  readOnly,
  required,
  autoFocus,
  name,
  size,
  ref,
  ...props
}: InputProps) {
  const [localValue, setLocalValue] = useState(String(defaultValue ?? ""));
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!, []);

  useEffect(() => {
    if (input.current) input.current.required = Boolean(required);
  }, [required, type]);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const accessibleLabel =
    props["aria-label"] ||
    (props["aria-labelledby"]
      ? undefined
      : label || props.placeholder || name || "Isian");

  if (!["text", "email", "password", "search"].includes(type)) {
    return (
      <input
        {...props}
        ref={input}
        size={size}
        aria-label={accessibleLabel}
        className={`bito-native-input bito-field-control ${className}`.trim()}
        style={style}
        type={type}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        autoFocus={autoFocus}
        name={name}
      />
    );
  }

  const isControlled = value !== undefined;
  return (
    <div className={`bito-field ${className}`.trim()} style={style}>
      <input
        {...props}
        ref={input}
        size={size}
        type={type}
        aria-label={accessibleLabel}
        className="bito-field-control"
        value={isControlled ? String(value) : localValue}
        onChange={(event) => {
          if (!isControlled) setLocalValue(event.target.value);
          onChange?.(event);
        }}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        autoFocus={autoFocus}
        name={name}
      />
    </div>
  );
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
  label?: string;
};

export function BitoTextArea({
  label,
  className = "",
  style,
  value,
  defaultValue,
  onChange,
  disabled,
  readOnly,
  required,
  autoFocus,
  name,
  maxLength,
  ref,
  ...props
}: AreaProps) {
  const [localValue, setLocalValue] = useState(String(defaultValue ?? ""));
  const input = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => input.current!, []);

  useEffect(() => {
    if (input.current) input.current.required = Boolean(required);
  }, [required]);

  useEffect(() => {
    if (maxLength === undefined) input.current?.removeAttribute("maxlength");
    else if (input.current) input.current.maxLength = maxLength;
  }, [maxLength]);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const accessibleLabel =
    props["aria-label"] ||
    (props["aria-labelledby"]
      ? undefined
      : label || props.placeholder || name || "Isi catatan");

  const isControlled = value !== undefined;
  return (
    <div className={`bito-field bito-area-field ${className}`.trim()} style={style}>
      <textarea
        {...props}
        ref={input}
        aria-label={accessibleLabel}
        className="bito-field-control bito-textarea-control"
        value={isControlled ? String(value) : localValue}
        maxLength={maxLength}
        onChange={(event) => {
          if (maxLength !== undefined && event.target.value.length > maxLength)
            return;
          if (!isControlled) setLocalValue(event.target.value);
          onChange?.(event);
        }}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        autoFocus={autoFocus}
        name={name}
      />
    </div>
  );
}
