import {
  Sun,
  CircleCheck,
  CalendarDays,
  Folder,
  LayoutGrid,
  Archive,
  SlidersHorizontal,
  ChevronsLeft,
  Plus,
  Check,
} from "lucide-react";

const icons = {
  today: Sun,
  tasks: CircleCheck,
  calendar: CalendarDays,
  project: Folder,
  projects: LayoutGrid,
  archive: Archive,
  settings: SlidersHorizontal,
  sidebar: ChevronsLeft,
  add: Plus,
  done: Check,
} as const;

export function SidebarIcon({
  name,
  className = "",
}: {
  name: keyof typeof icons;
  className?: string;
}) {
  const Icon = icons[name];
  return (
    <Icon
      className={`sidebar-icon ${className}`}
      size={18}
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
    />
  );
}
