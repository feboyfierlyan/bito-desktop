import type { Project } from "./projects";

export type CalendarConnection = {
  configured: boolean;
  status: "disconnected" | "connecting" | "connected" | "expired";
  email?: string;
  error?: string;
  automatic?: boolean;
  syncStatus?: "idle" | "pending" | "syncing" | "synced" | "error";
  syncError?: string;
  lastSyncedAt?: number;
};

/** Only the approved plan is publishable. A replacement draft never leaks out. */
export function automaticCalendarEntries(project: Project): CalendarEntry[] {
  if (!project.plan || !["active", "completed"].includes(project.status))
    return [];
  return [
    ...project.plan.milestones.flatMap((m) =>
      m.targetDate
        ? [
            {
              id: m.id,
              title: `${m.tasks.length > 0 && m.tasks.every((t) => t.status === "done") ? "✓ " : ""}${project.name} · ${m.title}`,
              date: m.targetDate,
              description: `Target dari Bito.\n\n${m.tasks.map((t) => `${t.status === "done" ? "✓" : "•"} ${t.title}`).join("\n")}`,
            },
          ]
        : [],
    ),
    ...project.plan.milestones.flatMap((m) =>
      m.tasks
        .filter((t) => t.dueDate)
        .map((t) => ({
          id: t.id,
          title: `${t.status === "done" ? "✓ " : ""}${project.name} · ${t.title}`,
          date: t.dueDate!,
          description: t.details || "Tugas dari Bito.",
        })),
    ),
    ...(project.deadline
      ? [
          {
            id: "deadline",
            title: `${project.status === "completed" ? "✓ " : ""}${project.name} · Tenggat`,
            date: project.deadline,
            description: "Tenggat tugas dari Bito.",
          },
        ]
      : []),
  ];
}

export function calendarSyncLabel(connection?: CalendarConnection) {
  if (connection?.status === "expired") return "Hubungkan ulang Calendar";
  if (!connection?.automatic) return "Sinkronisasi otomatis nonaktif";
  if (connection.status !== "connected") return "Menunggu koneksi Calendar";
  if (connection.syncStatus === "syncing") return "Menyinkronkan…";
  if (connection.syncStatus === "pending")
    return "Perubahan menunggu sinkronisasi";
  if (connection.syncStatus === "error")
    return connection.syncError || "Belum tersinkron. Akan dicoba lagi.";
  if (connection.syncStatus === "synced")
    return "Tersinkron dengan Google Calendar";
  return "Sinkronisasi otomatis aktif";
}
export type CalendarEntry = {
  id: string;
  title: string;
  date: string;
  description: string;
};
export type CalendarResult = {
  id: string;
  ok: boolean;
  url?: string;
  error?: string;
  recreate?: boolean;
};

// Milestones are date targets, not invented appointments or estimated work blocks.
export function calendarEntries(project: Project): CalendarEntry[] {
  if (!project.plan || project.status !== "active") return [];
  return project.plan.milestones
    .filter((m) => m.targetDate && m.tasks.some((t) => t.status !== "done"))
    .map((m) => ({
      id: m.id,
      title: `${project.name} · ${m.title}`,
      date: m.targetDate!,
      description: `Target dari Bito.\n\n${m.tasks
        .filter((t) => t.status !== "done")
        .map((t) => `• ${t.title}`)
        .join("\n")}`,
    }));
}

export function nextCalendarDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("Tanggal tidak valid.");
  const d = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date)
    throw Error("Tanggal tidak valid.");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function calendarEvent(entry: CalendarEntry) {
  return {
    summary: entry.title,
    description: entry.description,
    start: { date: entry.date },
    end: { date: nextCalendarDate(entry.date) },
    transparency: "transparent",
    reminders: { useDefault: false },
  };
}
