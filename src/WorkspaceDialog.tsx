import { useEffect, useRef, type ReactNode } from "react";
import { usePresence } from "motion/react";
import { ArrowLeft, X } from "lucide-react";
import { BitoButton } from "./ui/controls";

/**
 * Native <dialog> modal primitive: preserves Escape cancellation, backdrop
 * dismissal, focus containment/return, and smooth scale/opacity transitions.
 */
export function WorkspaceDialog({
  title,
  children,
  onClose,
  onBack,
  reduced = false,
  wide = false,
  compact = false,
  side = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  reduced?: boolean;
  wide?: boolean;
  compact?: boolean;
  side?: boolean;
}) {
  const [present, remove] = usePresence();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const el = dialogRef.current;
    if (el && !el.open) {
      try {
        el.showModal();
      } catch {
        el.setAttribute("open", "");
      }
    }
    return () => {
      if (el?.open) {
        try {
          el.close();
        } catch {
          el.removeAttribute("open");
        }
      }
      previousFocus.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (present || !remove) return;
    const timer = setTimeout(remove, reduced ? 0 : 180);
    return () => clearTimeout(timer);
  }, [present, remove, reduced]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      data-closing={!present || undefined}
      className={`workspace-dialog bito-dialog ${wide ? "is-wide" : ""} ${compact ? "is-capture" : ""} ${side ? "is-side-panel" : ""}`.trim()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="workspace-dialog-panel bito-dialog-surface">
        {!compact && (
          <header className="workspace-dialog-header bito-dialog-header">
            <div className="bito-dialog-header-start">
              {onBack && (
                <BitoButton
                  type="button"
                  className="board-icon"
                  aria-label="Kembali ke proyek"
                  onClick={onBack}
                >
                  <ArrowLeft size={18} />
                </BitoButton>
              )}
              <h2>{title}</h2>
            </div>
            <BitoButton
              type="button"
              className="bito-dialog-close board-icon"
              aria-label="Tutup"
              onClick={onClose}
            >
              <X size={17} />
            </BitoButton>
          </header>
        )}
        <div className="workspace-dialog-body">{children}</div>
      </div>
    </dialog>
  );
}
