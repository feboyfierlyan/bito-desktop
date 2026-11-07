import {
  Children,
  isValidElement,
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { motion } from "motion/react";
import { Button, type ButtonVariant } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { DateInput, type DateInputProps } from "@astryxdesign/core/DateInput";
import { Selector } from "@astryxdesign/core/Selector";
import type { ISODateString } from "@astryxdesign/core/Calendar";

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

/** Keeps native form, pointer and ref contracts while sharing Astryx behaviour. */
export function BitoButton({
  children,
  label,
  className = "",
  disabled,
  variant,
  isLoading,
  type = "submit",
  ...props
}: BitoButtonProps) {
  const treatment =
    variant ??
    (/(^|\s)([\w-]*primary|auth-google)(\s|$)/.test(className)
      ? "primary"
      : /(^|\s)[\w-]*secondary(\s|$)/.test(className)
        ? "secondary"
        : "ghost");
  return (
    <Button
      {...props}
      type={type}
      label={
        label ||
        props["aria-label"] ||
        props.title ||
        textLabel(children) ||
        "Bito"
      }
      variant={treatment}
      data-bito-variant={treatment}
      isDisabled={disabled}
      isLoading={isLoading}
      className={`bito-button ${className}`}
    >
      {children === undefined ? undefined : (
        <span className="bito-button-content">{children}</span>
      )}
    </Button>
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
  const options = Children.toArray(children).flatMap((child) =>
    isValidElement<{ value: string; children: ReactNode; disabled?: boolean }>(
      child,
    )
      ? [
          {
            value: String(child.props.value),
            label: textLabel(child.props.children),
            disabled: child.props.disabled,
          },
        ]
      : [],
  );
  return (
    <Selector
      {...props}
      label={label || props["aria-label"] || "Pilih opsi"}
      isLabelHidden
      containerClassName={`bito-field bito-select-field ${className}`}
      containerStyle={style}
      controlClassName="bito-field-control"
      options={options}
      value={value}
      onChange={onValueChange}
      isDisabled={disabled}
      isRequired={required}
      htmlName={name}
    />
  );
}

type BitoDateProps = Omit<
  DateInputProps,
  "label" | "onChange" | "value" | "min" | "max"
> & {
  label?: string;
  className?: string;
  value?: string;
  min?: string;
  max?: string;
  onValueChange?: DateInputProps["onChange"];
  disabled?: boolean;
  autoFocus?: boolean;
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
  label,
  className = "",
  value,
  min,
  max,
  onValueChange,
  disabled,
  autoFocus,
  ref,
  ...props
}: BitoDateProps) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!, []);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  return (
    <DateInput
      {...props}
      ref={input}
      label={label || props["aria-label"] || "Tanggal"}
      isLabelHidden
      containerClassName={`bito-field bito-date-field ${className}`}
      controlClassName="bito-field-control"
      value={isoDate(value)}
      min={isoDate(min)}
      max={isoDate(max)}
      onChange={onValueChange}
      isDisabled={disabled}
      weekStartsOn="mon"
      format="date"
    />
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
  // isRequired provides accessible semantics; retain native form validation too.
  useEffect(() => {
    if (input.current) input.current.required = Boolean(required);
  }, [required, type]);
  // Date, time, file and range controls keep their native platform semantics.
  if (!["text", "email", "password"].includes(type))
    return (
      <input
        {...props}
        ref={input}
        size={size}
        className={`bito-native-input ${className}`}
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
  return (
    <TextInput
      {...props}
      ref={input}
      type={type as "text" | "email" | "password"}
      label={
        label || props["aria-label"] || props.placeholder || name || "Isi teks"
      }
      isLabelHidden
      containerClassName={`bito-field ${className}`}
      containerStyle={style}
      controlClassName="bito-field-control"
      value={String(value ?? localValue)}
      onChange={(next, event) => {
        if (value === undefined) setLocalValue(next);
        onChange?.(event);
      }}
      isDisabled={disabled}
      isReadOnly={readOnly}
      isRequired={required}
      hasAutoFocus={autoFocus}
      htmlName={name}
    />
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
  return (
    <TextArea
      {...props}
      ref={input}
      label={
        label ||
        props["aria-label"] ||
        props.placeholder ||
        name ||
        "Isi catatan"
      }
      isLabelHidden
      containerClassName={`bito-field bito-area-field ${className}`}
      containerStyle={style}
      controlClassName="bito-field-control"
      value={String(value ?? localValue)}
      onChange={(next, event) => {
        if (maxLength !== undefined && next.length > maxLength) return;
        if (value === undefined) setLocalValue(next);
        onChange?.(event);
      }}
      isDisabled={disabled}
      isReadOnly={readOnly}
      isRequired={required}
      hasAutoFocus={autoFocus}
      htmlName={name}
    />
  );
}
