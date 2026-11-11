import { useRef, useState } from "react";
import { ListFilter } from "lucide-react";
import { Popover } from "@astryxdesign/core/Popover";
import { BitoButton } from "./ui/controls";
import type { TaskSort } from "./workspace-task-model";
const choices: { value: TaskSort; label: string }[] = [
  { value: "none", label: "Urutan asli" },
  { value: "title", label: "Abjad" },
  { value: "date", label: "Tanggal tugas" },
  { value: "priority", label: "Prioritas" },
];
export function TaskViewMenu({
  sort,
  completed,
  onSort,
  onCompleted,
}: {
  sort: TaskSort;
  completed: boolean;
  onSort: (value: TaskSort) => void;
  onCompleted: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  return (
    <Popover
      label="Tampilan tugas"
      role="none"
      className="task-view-popover"
      isOpen={open}
      onOpenChange={setOpen}
      placement="below"
      alignment="end"
      width={190}
      padding={0}
      content={
        <div
          ref={menu}
          className="task-view-menu"
          role="menu"
          aria-label="Tampilan tugas"
          onKeyDown={(e) => {
            const items = Array.from(
              menu.current?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitemradio"]',
              ) || [],
            );
            const current = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            let index: number | undefined;
            if (e.key === "ArrowDown") index = (current + 1) % items.length;
            if (e.key === "ArrowUp")
              index = (current + items.length - 1) % items.length;
            if (e.key === "Home") index = 0;
            if (e.key === "End") index = items.length - 1;
            if (index !== undefined) {
              e.preventDefault();
              items[index]?.focus();
            }
          }}
        >
          <div role="group" aria-label="Urutkan tugas">
            <div className="task-menu-label">Urutkan</div>
            {choices.map((option) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={sort === option.value}
                key={option.value}
                onClick={() => {
                  onSort(option.value);
                  setOpen(false);
                }}
              >
                <i aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>
          <div className="task-menu-divider" role="separator" />
          <div role="group" aria-label="Status tugas">
            {[
              { value: false, label: "Tugas aktif" },
              { value: true, label: "Tugas selesai" },
            ].map((option) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={completed === option.value}
                key={option.label}
                onClick={() => {
                  onCompleted(option.value);
                  setOpen(false);
                }}
              >
                <i aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <BitoButton
        className="task-view-trigger"
        type="button"
        aria-label="Atur tampilan"
        title="Atur tampilan"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ListFilter size={18} />
      </BitoButton>
    </Popover>
  );
}
