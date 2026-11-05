import { useEffect, type ReactNode } from "react";
import { usePresence } from "motion/react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { ArrowLeft } from "lucide-react";
import { BitoButton } from "./ui/controls";

/** Astryx owns dismissal, inertness and focus return; Motion owns mount lifetime. */
export function WorkspaceDialog({
  title,
  children,
  onClose,
  onBack,
  reduced = false,
  wide = false,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  reduced?: boolean;
  wide?: boolean;
  compact?: boolean;
}) {
  const [present, remove] = usePresence();
  useEffect(() => {
    if (present || !remove) return;
    const timer = setTimeout(remove, reduced ? 0 : 240);
    return () => clearTimeout(timer);
  }, [present, remove, reduced]);
  return (
    <Dialog
      isOpen={present}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={wide ? 1000 : 540}
      maxHeight="min(84dvh, 900px)"
      padding={0}
      className={`workspace-dialog bito-dialog ${wide ? "is-wide" : ""} ${compact ? "is-capture" : ""}`}
      aria-label={title}
    >
      {!compact && (
        <DialogHeader
          title={title}
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
          hasDivider
          startContent={
            onBack ? (
              <BitoButton
                type="button"
                className="board-icon"
                aria-label="Kembali ke proyek"
                onClick={onBack}
              >
                <ArrowLeft size={18} />
              </BitoButton>
            ) : undefined
          }
        />
      )}
      <div className="workspace-dialog-body">{children}</div>
    </Dialog>
  );
}
