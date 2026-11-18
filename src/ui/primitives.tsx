import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

export type ISODateString = `${number}-${number}-${number}`;

/* -------------------------------------------------------------------------- */
/* BitoCard                                                                   */
/* -------------------------------------------------------------------------- */
export function BitoCard({
  children,
  className = "",
  padding,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { padding?: number }) {
  return (
    <div
      {...props}
      className={`bito-card ${className}`.trim()}
      style={{
        ...(padding !== undefined ? { padding: `${padding * 4}px` } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BitoBadge                                                                  */
/* -------------------------------------------------------------------------- */
export function BitoBadge({
  children,
  label,
  tone = "neutral",
  variant,
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  label?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  variant?: "neutral" | "success" | "warning" | "danger" | "accent" | "blue";
}) {
  const resolved = variant === "blue" ? "accent" : variant || tone;
  return (
    <span
      {...props}
      data-tone={resolved}
      className={`bito-badge ${className}`.trim()}
    >
      {children ?? label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* BitoProgressBar                                                            */
/* -------------------------------------------------------------------------- */
export function BitoProgressBar({
  label,
  isLabelHidden = false,
  value,
  max = 100,
  className = "",
}: {
  label: string;
  isLabelHidden?: boolean;
  value: number;
  max?: number;
  className?: string;
}) {
  const safeMax = Math.max(1, max);
  const clamped = Math.max(0, Math.min(safeMax, value));
  const ratio = clamped / safeMax;
  return (
    <div className={`bito-progress ${className}`.trim()}>
      {!isLabelHidden && (
        <div className="bito-progress-header">
          <span>{label}</span>
          <span>{Math.round(ratio * 100)}%</span>
        </div>
      )}
      <div
        className="bito-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={Math.round(safeMax)}
      >
        <span
          className="bito-progress-fill"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BitoCheckbox (Animated stroke checkmark + native checkbox accessibility)   */
/* -------------------------------------------------------------------------- */
export function BitoCheckbox({
  label,
  isLabelHidden = false,
  size = "md",
  value,
  isReadOnly = false,
  isDisabled = false,
  onChange,
  className = "",
}: {
  label: string;
  isLabelHidden?: boolean;
  size?: "sm" | "md";
  value: boolean;
  isReadOnly?: boolean;
  isDisabled?: boolean;
  onChange?: (checked: boolean, event: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      data-size={size}
      className={`bito-checkbox ${value ? "is-checked" : ""} ${isDisabled ? "is-disabled" : ""} ${className}`.trim()}
    >
      <input
        id={id}
        type="checkbox"
        className="bito-checkbox-input"
        checked={value}
        readOnly={isReadOnly}
        aria-readonly={isReadOnly ? "true" : undefined}
        disabled={isDisabled}
        aria-label={isLabelHidden ? label : undefined}
        onChange={(event) => {
          if (isReadOnly) return;
          onChange?.(event.target.checked, event);
        }}
      />
      <span className="bito-checkbox-box" aria-hidden="true">
        <Check size={size === "sm" ? 11 : 12} strokeWidth={3} className="bito-checkbox-mark" />
      </span>
      {!isLabelHidden && <span className="bito-checkbox-label">{label}</span>}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* BitoSwitch                                                                 */
/* -------------------------------------------------------------------------- */
export function BitoSwitch({
  label,
  description,
  value,
  isDisabled = false,
  onChange,
  labelPosition = "start",
  labelSpacing = "spread",
  className = "",
}: {
  label: string;
  description?: string;
  value: boolean;
  isDisabled?: boolean;
  onChange?: (checked: boolean, event: React.ChangeEvent<HTMLInputElement>) => void;
  labelPosition?: "start" | "end";
  labelSpacing?: "spread" | "compact";
  className?: string;
}) {
  const id = useId();
  const descId = useId();
  return (
    <label
      htmlFor={id}
      data-label-position={labelPosition}
      data-label-spacing={labelSpacing}
      className={`bito-switch ${value ? "is-checked" : ""} ${isDisabled ? "is-disabled" : ""} ${className}`.trim()}
    >
      <span className="bito-switch-copy">
        <span className="bito-switch-title">{label}</span>
        {description && (
          <small id={descId} className="bito-switch-desc">
            {description}
          </small>
        )}
      </span>
      <span className="bito-switch-control">
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-checked={value}
          aria-describedby={description ? descId : undefined}
          className="bito-switch-input"
          checked={value}
          disabled={isDisabled}
          onChange={(event) => onChange?.(event.target.checked, event)}
        />
        <span className="bito-switch-track" aria-hidden="true">
          <span className="bito-switch-thumb" />
        </span>
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* BitoSlider                                                                 */
/* -------------------------------------------------------------------------- */
export function BitoSlider({
  label,
  isLabelHidden = false,
  valueDisplay = "auto",
  min = 0,
  max = 100,
  step = 1,
  value,
  disabled = false,
  onChange,
  onChangeEnd,
  onBlur,
  className = "",
}: {
  label: string;
  isLabelHidden?: boolean;
  valueDisplay?: "auto" | "none";
  min?: number;
  max?: number;
  step?: number;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onChangeEnd?: () => void;
  onBlur?: () => void;
  className?: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div
      className={`bito-slider ${className}`.trim()}
      style={{ "--slider-pct": `${Math.max(0, Math.min(100, pct))}%` } as CSSProperties}
    >
      {!isLabelHidden && (
        <div className="bito-slider-header">
          <span>{label}</span>
          {valueDisplay !== "none" && <output>{value}</output>}
        </div>
      )}
      <input
        type="range"
        className="bito-slider-input"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => onChangeEnd?.()}
        onKeyUp={() => onChangeEnd?.()}
        onBlur={onBlur}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BitoSegmentedControl (Sliding pill indicator)                              */
/* -------------------------------------------------------------------------- */
type SegmentedCtx = {
  value: string;
  onChange: (value: string) => void;
  groupId: string;
};
const SegmentedContext = createContext<SegmentedCtx | null>(null);

export function BitoSegmentedControl({
  label,
  value,
  onChange,
  layout = "hug",
  className = "",
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  layout?: "fill" | "hug";
  className?: string;
  children: ReactNode;
}) {
  const groupId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const ctx = useMemo(
    () => ({ value, onChange, groupId }),
    [value, onChange, groupId],
  );
  return (
    <SegmentedContext.Provider value={ctx}>
      <div
        ref={rootRef}
        role="radiogroup"
        aria-label={label}
        data-layout={layout}
        className={`bito-segmented ${className}`.trim()}
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          const items = Array.from(
            rootRef.current?.querySelectorAll<HTMLButtonElement>(
              '[role="radio"]:not(:disabled)',
            ) || [],
          );
          if (!items.length) return;
          e.preventDefault();
          const current = Math.max(
            0,
            items.findIndex((el) => el.getAttribute("aria-checked") === "true"),
          );
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? items.length - 1
                : (current + (e.key === "ArrowLeft" ? -1 : 1) + items.length) %
                  items.length;
          items[next]?.focus();
          items[next]?.click();
        }}
      >
        {children}
      </div>
    </SegmentedContext.Provider>
  );
}

export function BitoSegmentedItem({
  value,
  label,
  disabled = false,
}: {
  value: string;
  label: string;
  disabled?: boolean;
}) {
  const ctx = useContext(SegmentedContext);
  const selected = ctx?.value === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      className={`bito-segmented-item ${selected ? "is-selected" : ""}`}
      onClick={() => ctx?.onChange(value)}
    >
      {selected && (
        <motion.span
          layoutId={`seg-pill-${ctx?.groupId}`}
          className="bito-segmented-pill"
          transition={{ type: "spring", stiffness: 460, damping: 36 }}
        />
      )}
      <span className="bito-segmented-label">{label}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* BitoPopover (Origin-aware floating surface with synchronous focus)         */
/* -------------------------------------------------------------------------- */
export function BitoPopover({
  label,
  role = "dialog",
  className = "",
  isOpen,
  onOpenChange,
  placement = "below",
  alignment = "start",
  width,
  padding,
  content,
  children,
}: {
  label: string;
  role?: "dialog" | "menu" | "listbox" | "none";
  className?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  placement?: "below" | "above";
  alignment?: "start" | "end" | "center";
  width?: number;
  padding?: number;
  content: ReactNode;
  children: ReactElement<any>;
}) {
  const triggerWrapRef = useRef<HTMLSpanElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; origin: string }>({
    top: 0,
    left: 0,
    origin: "top left",
  });

  const updatePosition = () => {
    const triggerEl =
      triggerWrapRef.current?.firstElementChild ?? triggerWrapRef.current;
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const popW = width || surfaceRef.current?.offsetWidth || 220;
    const popH = surfaceRef.current?.offsetHeight || 200;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;

    let left =
      alignment === "end"
        ? rect.right - popW
        : alignment === "center"
          ? rect.left + (rect.width - popW) / 2
          : rect.left;
    left = Math.max(8, Math.min(left, vw - popW - 8));

    const preferAbove =
      placement === "above" ||
      (rect.bottom + popH + 12 > vh && rect.top - popH - 8 >= 8);
    const top = preferAbove
      ? Math.max(8, rect.top - popH - 6)
      : Math.min(vh - popH - 8, rect.bottom + 6);
    const originY = preferAbove ? "bottom" : "top";
    const originX =
      alignment === "end" ? "right" : alignment === "center" ? "center" : "left";
    setCoords({ top, left, origin: `${originY} ${originX}` });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const surface = surfaceRef.current;
    const first = surface?.querySelector<HTMLElement>(
      '[role="menuitemradio"][aria-checked="true"], [role="option"][aria-selected="true"], [role="menuitem"], [role="menuitemradio"], [role="option"], button:not(:disabled), input:not(:disabled)',
    );
    first?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        !target ||
        surfaceRef.current?.contains(target) ||
        triggerWrapRef.current?.contains(target)
      )
        return;
      onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onOpenChange(false);
        const btn = triggerWrapRef.current?.querySelector<HTMLElement>(
          "button, [tabindex]",
        );
        btn?.focus();
      }
    };
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, onOpenChange]);

  const childProps = children.props as Record<string, any>;
  const trigger = isValidElement<Record<string, any>>(children)
    ? cloneElement(children, {
        onClick: (event: ReactMouseEvent) => {
          childProps.onClick?.(event);
          if (!event.defaultPrevented && !childProps.disabled) {
            onOpenChange(!isOpen);
          }
        },
        onKeyDown: (event: ReactKeyboardEvent) => {
          childProps.onKeyDown?.(event);
          if (event.defaultPrevented || childProps.disabled) return;
          if (event.key === "ArrowDown" && !isOpen) {
            event.preventDefault();
            onOpenChange(true);
          }
        },
      })
    : children;

  return (
    <>
      <span ref={triggerWrapRef} className="bito-popover-anchor">
        {trigger}
      </span>
      {isOpen &&
        createPortal(
          <div
            ref={surfaceRef}
            role={role === "none" ? undefined : role}
            aria-label={role === "none" ? undefined : label}
            className={`bito-popover-surface ${className}`.trim()}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: width ? `${width}px` : undefined,
              padding: padding !== undefined ? `${padding * 4}px` : undefined,
              transformOrigin: coords.origin,
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* BitoCalendar (Monday-first Bahasa Indonesia Month Grid)                    */
/* -------------------------------------------------------------------------- */
const ID_WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatKey(year: number, month0: number, day: number): ISODateString {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}` as ISODateString;
}

export function BitoCalendar({
  value,
  min,
  max,
  weekStartsOn = "mon",
  onChange,
}: {
  value?: ISODateString | null;
  min?: ISODateString;
  max?: ISODateString;
  weekStartsOn?: "mon" | "sun";
  onChange: (date: ISODateString) => void;
}) {
  const initial = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split("-").map(Number);
      return { year: y, month: m - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [value]);

  const [cursor, setCursor] = useState(initial);
  const today = useMemo(() => {
    const d = new Date();
    return formatKey(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const firstDow = new Date(cursor.year, cursor.month, 1).getDay(); // 0=Sun..6=Sat
  const offset =
    weekStartsOn === "mon" ? (firstDow + 6) % 7 : firstDow;

  const monthTitle = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(cursor.year, cursor.month, 1));

  const cells: (ISODateString | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++)
    cells.push(formatKey(cursor.year, cursor.month, d));

  return (
    <div className="bito-calendar" role="group" aria-label={monthTitle}>
      <div className="bito-calendar-header">
        <button
          type="button"
          className="bito-calendar-nav"
          aria-label="Bulan sebelumnya"
          onClick={() =>
            setCursor((c) =>
              c.month === 0
                ? { year: c.year - 1, month: 11 }
                : { year: c.year, month: c.month - 1 },
            )
          }
        >
          <ChevronLeft size={15} />
        </button>
        <strong className="bito-calendar-title">{monthTitle}</strong>
        <button
          type="button"
          className="bito-calendar-nav"
          aria-label="Bulan berikutnya"
          onClick={() =>
            setCursor((c) =>
              c.month === 11
                ? { year: c.year + 1, month: 0 }
                : { year: c.year, month: c.month + 1 },
            )
          }
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="bito-calendar-weekdays" aria-hidden="true">
        {ID_WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="bito-calendar-days">
        {cells.map((iso, idx) => {
          if (!iso) return <span key={`empty-${idx}`} className="bito-calendar-empty" />;
          const disabled = Boolean((min && iso < min) || (max && iso > max));
          const selected = value === iso;
          const isToday = today === iso;
          const dayNum = Number(iso.slice(8, 10));
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={new Intl.DateTimeFormat("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date(`${iso}T12:00:00`))}
              className={`bito-calendar-day ${selected ? "is-selected" : ""} ${isToday ? "is-today" : ""}`}
              onClick={() => onChange(iso)}
            >
              {dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BitoAppShell (Warm sidebar + elevated Superlist/Todoist main sheet)        */
/* -------------------------------------------------------------------------- */
export function BitoAppShell({
  sideNav,
  variant: _variant,
  height: _height,
  contentPadding: _contentPadding,
  mobileNav: _mobileNav,
  children,
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  sideNav?: ReactNode;
  variant?: "wash" | "surface";
  height?: "fill" | "auto";
  contentPadding?: number;
  mobileNav?: { breakpoint?: string; hasToggle?: boolean };
  className?: string;
  children: ReactNode;
}) {
  return (
    <div {...rest} className={`bito-app-shell ${className}`.trim()}>
      {sideNav && <div className="bito-app-sidenav">{sideNav}</div>}
      <main className="bito-app-main">{children}</main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BitoChatComposer (Unified Notion/Langdock/BeautifulUI prompt harness)      */
/* -------------------------------------------------------------------------- */
export function BitoChatComposer({
  className = "",
  input,
  footerActions,
  sendButton,
  activeBeam = false,
}: {
  className?: string;
  density?: "compact" | "comfortable";
  elevation?: "none" | "raised";
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  input: ReactNode;
  footerActions?: ReactNode;
  sendButton: ReactNode;
  activeBeam?: boolean;
}) {
  return (
    <div
      data-active-beam={activeBeam ? "true" : undefined}
      className={`bito-composer-box ${className}`.trim()}
    >
      {footerActions && (
        <div className="bito-composer-actions-start">{footerActions}</div>
      )}
      <div className="bito-composer-input-slot">{input}</div>
      <div className="bito-composer-actions-end">{sendButton}</div>
    </div>
  );
}
