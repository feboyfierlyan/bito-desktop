import {ChatPopover} from "./ui/ChatPopover";
import { BitoButton } from "./ui/controls";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  FolderOpen,
  MessageCircle,
  Plus,
} from "lucide-react";
import type { Reply, Snapshot } from "./shared";

export function ChatProjectSelector({
  state,
  act,
  disabled,
  top,
  reduced,
  onGeometry,
}: {
  state: Snapshot;
  act: (name: string, payload?: unknown) => Promise<Reply>;
  disabled: boolean;
  top: number;
  reduced: boolean;
  onGeometry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = state.projects.filter((p) => p.status !== "archived");
  const selected = items.find((p) => p.id === state.activeProjectId);
  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    const node = menu.current;
    const measure = () => onGeometry();
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, onGeometry]);
  useEffect(() => {
    if (disabled || !state.chatOpen) setOpen(false);
  }, [disabled, state.chatOpen]);
  useEffect(() => {
    if (!open) return;
    menu.current
      ?.querySelector<HTMLButtonElement>(
        '[role="menuitemradio"][aria-checked="true"]',
      )
      ?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [open]);
  async function choose(projectId: string | null, create = false) {
    if (pending || disabled) return;
    setPending(true);
    setError("");
    try {
      const result = await act(
        create ? "new-project" : "project-select",
        create ? undefined : projectId,
      );
      if (!result.ok) throw Error(result.error || "Proyek belum bisa dibuka.");
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div
      ref={root}
      className="desktop-project-picker"
      style={{ top }}
      data-chat-menu
    >
      <BitoButton
        ref={trigger}
        type="button"
        className="desktop-project-context"
        data-chat-hit
        aria-label={`Pilih proyek: ${selected?.name || "Obrolan umum"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || pending}
        onClick={() => {
          setError("");
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {selected ? <FolderOpen size={12} /> : <MessageCircle size={12} />}
        <span>{selected?.name || "Obrolan umum"}</span>
        <ChevronDown size={12} />
      </BitoButton>
      <AnimatePresence onExitComplete={onGeometry}>
        {open && (
          <ChatPopover anchor={trigger} onGeometry={onGeometry}><motion.div
            ref={menu}
            className="desktop-project-menu desktop-popover"
            role="menu"
            aria-label="Pilih proyek"
            data-chat-hit
            initial={{
              opacity: 0,
              y: reduced ? 0 : 5,
              scale: reduced ? 1 : 0.98,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduced ? 0 : 3 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
            onUpdate={onGeometry}
            onAnimationComplete={onGeometry}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                trigger.current?.focus({ preventScroll: true });
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const buttons = [
                ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              ];
              const current = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? buttons.length - 1
                    : (current +
                        (e.key === "ArrowUp" ? -1 : 1) +
                        buttons.length) %
                      buttons.length;
              buttons[next]?.focus({ preventScroll: true });
            }}
          >
            <div className="desktop-project-choices">
              <BitoButton
                type="button"
                role="menuitemradio"
                aria-checked={!selected}
                disabled={pending}
                onClick={() => void choose(null)}
              >
                <MessageCircle size={15} />
                <span>Obrolan umum</span>
                {!selected && <Check size={14} />}
              </BitoButton>
              {items.map((p) => (
                <BitoButton
                  key={p.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={p.id === selected?.id}
                  disabled={pending}
                  onClick={() => void choose(p.id)}
                >
                  <FolderOpen size={15} />
                  <span>{p.name}</span>
                  {p.id === selected?.id && <Check size={14} />}
                </BitoButton>
              ))}
            </div>
            <BitoButton
              type="button"
              role="menuitem"
              className="desktop-project-create"
              disabled={pending}
              onClick={() => void choose(null, true)}
            >
              <Plus size={15} />
              <span>Proyek baru</span>
            </BitoButton>
            {error && <p role="alert">{error}</p>}
          </motion.div></ChatPopover>
        )}
      </AnimatePresence>
    </div>
  );
}
