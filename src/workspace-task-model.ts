import { savedTaskItems } from "./saved-work";
import type { Snapshot } from "./shared";
import type { Project } from "./projects";

/** Current task counts, not historical snapshots. Completed dates never affect urgency. */
export function workspaceProjectProgress(projects: Project[], today: string) {
  return projects
    .filter((p) => p.status !== "archived")
    .map((project) => {
      const tasks = (project.plan?.milestones || []).flatMap((m) =>
        m.tasks.map((t) => ({
          done: t.status === "done",
          date: t.dueDate === undefined ? m.targetDate : t.dueDate,
        })),
      );
      const done = tasks.filter((t) => t.done).length;
      const dates = tasks.filter((t) => !t.done && t.date).map((t) => t.date!);
      const finished =
        project.status === "completed" ||
        (tasks.length > 0 && done === tasks.length);
      const overdue = !finished && dates.some((date) => date < today);
      const nextDate = finished
        ? null
        : [
            ...dates,
            ...(project.deadline ? [project.deadline] : []),
          ].sort()[0] || null;
      return {
        project,
        done,
        total: tasks.length,
        overdue,
        nextDate,
        finished,
      };
    })
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        Number(a.finished) - Number(b.finished) ||
        (a.nextDate || "9999").localeCompare(b.nextDate || "9999") ||
        a.project.name.localeCompare(b.project.name, "id"),
    );
}
export type TaskSort = "none" | "title" | "date" | "priority";
export type WorkspaceItem = ReturnType<typeof savedTaskItems>[number] & {
  blocked: boolean;
};
export function workspaceTaskInventory(
  state: Pick<Snapshot, "projects" | "activeProjectId" | "tasks">,
): WorkspaceItem[] {
  return savedTaskItems(state)
    .filter(
      (t) =>
        !state.projects.some(
          (p) => p.id === t.projectId && p.status === "completed" && !t.done,
        ),
    )
    .map((t) => ({
      ...t,
      blocked: !!state.projects
        .find((p) => p.id === t.projectId)
        ?.plan?.milestones.some((m) =>
          m.tasks.some((task) => task.id === t.id && task.status === "blocked"),
        ),
    }));
}
export function workspaceTaskGroups(
  items: WorkspaceItem[],
  today: string,
  all: boolean,
  completed: boolean,
  query: string,
  sort: TaskSort,
) {
  const rows = items
    .filter(
      (t) =>
        t.done === completed &&
        (!query ||
          `${t.title} ${t.projectName}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase())) &&
        (all || (!!t.date && (completed ? t.date === today : t.date <= today))),
    )
    .sort((a, b) => {
      if (sort === "none") return 0;
      if (sort === "title") return a.title.localeCompare(b.title, "id");
      return (
        (sort === "priority" ? a.priority - b.priority : 0) ||
        (a.date || "9999").localeCompare(b.date || "9999") ||
        a.priority - b.priority ||
        a.title.localeCompare(b.title, "id")
      );
    });
  if (completed) return [{ key: "done", title: "Selesai", rows }];
  return [
    {
      key: "overdue",
      title: "Terlewat",
      rows: rows.filter((t) => !!t.date && t.date < today),
    },
    {
      key: "today",
      title: "Hari ini",
      rows: rows.filter((t) => t.date === today),
    },
    ...(all
      ? [
          {
            key: "upcoming",
            title: "Mendatang",
            rows: rows.filter((t) => !!t.date && t.date > today),
          },
          {
            key: "undated",
            title: "Tanpa tanggal",
            rows: rows.filter((t) => !t.date),
          },
        ]
      : []),
  ];
}
export function workspaceTaskInsights(items: WorkspaceItem[], today: string) {
  const done = items.filter((t) => t.done).length;
  const overdue = items.filter((t) => !t.done && !!t.date && t.date < today);
  const blocked = items.filter((t) => !t.done && t.blocked);
  const attention = items
    .filter((t) => !t.done && (t.blocked || (!!t.date && t.date < today)))
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  return {
    done,
    total: items.length,
    active: items.length - done,
    overdue,
    blocked,
    attention,
    percent: items.length ? Math.round((done / items.length) * 100) : 0,
  };
}
