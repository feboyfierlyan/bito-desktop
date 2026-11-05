import { dailyProjectProgress, type Project } from "./projects";

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function calendarWeek(anchor: Date) {
  const start = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate(),
    12,
  );
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return { date, key: localDateKey(date) };
  });
}
export function projectCalendarItems(project: Project) {
  const items = (project.plan?.milestones || [])
    .filter((m) => m.targetDate)
    .map((m) => ({
      id: m.id,
      title: m.title,
      date: m.targetDate!,
      kind: "milestone" as const,
      done: m.tasks.length > 0 && m.tasks.every((t) => t.status === "done"),
    }));
  return [
    ...items,
    ...(project.plan?.milestones || []).flatMap((m) =>
      m.tasks
        .filter((t) => t.dueDate)
        .map((t) => ({
          id: t.id,
          title: t.title,
          date: t.dueDate!,
          kind: "task" as const,
          done: t.status === "done",
        })),
    ),
    ...(project.deadline
      ? [
          {
            id: "deadline",
            title: "Tenggat proyek",
            date: project.deadline,
            kind: "deadline" as const,
            done: project.status === "completed",
          },
        ]
      : []),
  ];
}
export function progressSeries(project: Project) {
  return dailyProjectProgress(project).map((row) => ({
    at: row.at,
    done: row.done,
    total: row.total,
    percent: row.total ? Math.round((row.done / row.total) * 100) : 0,
  }));
}
