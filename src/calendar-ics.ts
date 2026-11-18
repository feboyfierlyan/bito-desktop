import type { Project } from "./projects";
import type { Task } from "./shared";

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldIcsLine(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    chunks.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return chunks.join("\r\n");
}

function isoDateCompact(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function nextIsoDateCompact(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function utcStamp(now = new Date()): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Generates an RFC 5545 compliant .ics calendar file for active projects and
 * dated quick tasks so users can import schedules into Apple/Google/Outlook
 * Calendar with zero OAuth friction (DEC-006 / TASK-E01).
 */
export function buildBitoIcsCalendar(options: {
  projects: Project[];
  tasks: Task[];
  now?: Date;
}): { ics: string; eventCount: number } {
  const stamp = utcStamp(options.now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bito Companion//Ruang Kerja v1.0//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Jadwal Tugas Bito",
  ];
  let eventCount = 0;

  const pushAllDayEvent = (
    uid: string,
    date: string,
    summary: string,
    description?: string,
  ) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    eventCount++;
    lines.push("BEGIN:VEVENT");
    lines.push(foldIcsLine(`UID:${uid}@bito.app`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${isoDateCompact(date)}`);
    lines.push(`DTEND;VALUE=DATE:${nextIsoDateCompact(date)}`);
    lines.push(foldIcsLine(`SUMMARY:${escapeIcsText(summary)}`));
    if (description?.trim()) {
      lines.push(
        foldIcsLine(`DESCRIPTION:${escapeIcsText(description.trim())}`),
      );
    }
    lines.push("END:VEVENT");
  };

  for (const project of options.projects) {
    if (project.status === "archived") continue;
    if (project.deadline && project.status !== "completed") {
      pushAllDayEvent(
        `project-${project.id}`,
        project.deadline,
        `[Tenggat Proyek] ${project.name}`,
        project.outcome || project.brief,
      );
    }
    for (const group of project.plan?.milestones || []) {
      if (group.targetDate) {
        pushAllDayEvent(
          `group-${project.id}-${group.id}`,
          group.targetDate,
          `[${project.name}] Kelompok: ${group.title}`,
        );
      }
      for (const task of group.tasks) {
        if (task.status === "done") continue;
        const due = task.dueDate ?? group.targetDate;
        if (!due) continue;
        pushAllDayEvent(
          `task-${project.id}-${task.id}`,
          due,
          `[${project.name}] ${task.title}`,
          task.details || `Kelompok: ${group.title}`,
        );
      }
    }
  }

  for (const task of options.tasks) {
    if (task.done || !task.dueDate) continue;
    pushAllDayEvent(
      `quick-${task.id}`,
      task.dueDate,
      `[Tugas singkat] ${task.title}`,
      task.details,
    );
  }

  lines.push("END:VCALENDAR");
  return { ics: `${lines.join("\r\n")}\r\n`, eventCount };
}
