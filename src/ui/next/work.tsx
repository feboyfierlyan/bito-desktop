import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { Button, Checkbox, IconButton } from "./primitives";

export function TaskRow({
  title,
  done,
  onToggle,
  meta,
  due,
  selected,
}: {
  title: string;
  done: boolean;
  onToggle: (next: boolean) => void;
  meta?: string;
  due?: string;
  selected?: boolean;
}) {
  return (
    <div
      className="bx-task"
      data-done={done}
      data-selected={selected || undefined}
    >
      <Checkbox
        checked={done}
        onChange={onToggle}
        label={
          done ? `Tandai belum selesai: ${title}` : `Tandai selesai: ${title}`
        }
      />
      <span className="bx-task-title">{title}</span>
      {due && !done && <span className="bx-due">{due}</span>}
      {meta && <span className="bx-task-meta">{meta}</span>}
    </div>
  );
}

export type NavItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
};

export function SidebarNav({
  items,
  current,
  onSelect,
  label,
}: {
  items: readonly NavItem[];
  current: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  return (
    <nav className="bx-nav" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="bx-nav-item"
          aria-current={item.id === current ? "page" : undefined}
          onClick={() => onSelect(item.id)}
        >
          {item.icon}
          {item.label}
          {item.count !== undefined && (
            <span className="bx-nav-count">{item.count}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

export type SearchItem = { id: string; label: string };

/** Filters as you type; arrow keys move, Enter picks. */
export function Search({
  items,
  onPick,
  placeholder = "Cari tugas atau obrolan…",
  emptyText = "Tidak ada yang cocok.",
}: {
  items: readonly SearchItem[];
  onPick: (item: SearchItem) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("id-ID");
    return needle
      ? items.filter((item) =>
          item.label.toLocaleLowerCase("id-ID").includes(needle),
        )
      : items;
  }, [items, query]);
  const index = Math.min(active, Math.max(results.length - 1, 0));
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index + step + results.length) % results.length);
    } else if (event.key === "Enter" && results[index]) {
      event.preventDefault();
      onPick(results[index]);
    }
  };
  return (
    <div className="bx-search">
      <div className="bx-search-field">
        <SearchIcon size={14} aria-hidden />
        <input
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={
            results[index] ? `${listId}-${results[index].id}` : undefined
          }
          aria-label={placeholder}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={keyDown}
        />
      </div>
      {results.length === 0 ? (
        <p className="bx-search-empty" role="status">
          {emptyText}
        </p>
      ) : (
        <ul id={listId} role="listbox" className="bx-search-list">
          {results.map((item, position) => (
            <li
              key={item.id}
              id={`${listId}-${item.id}`}
              role="option"
              aria-selected={position === index}
              className="bx-search-option"
              onMouseEnter={() => setActive(position)}
              onClick={() => onPick(item)}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Floating bar shown while several items are selected. */
export function SelectionActions({
  count,
  actions,
  onClear,
}: {
  count: number;
  actions: readonly { label: string; onClick: () => void }[];
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      className="bx-selection-bar"
      role="toolbar"
      aria-label="Aksi untuk yang dipilih"
    >
      <span aria-live="polite">{count} dipilih</span>
      {actions.map((action) => (
        <Button key={action.label} variant="ghost" onClick={action.onClick}>
          {action.label}
        </Button>
      ))}
      <IconButton label="Batalkan pilihan" onClick={onClear}>
        <X size={14} aria-hidden />
      </IconButton>
    </div>
  );
}
