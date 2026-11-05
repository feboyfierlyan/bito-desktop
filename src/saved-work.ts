import { projectProgress, type ProjectState } from "./projects";
import type { Task } from "./shared";

/** The workspace and chat directory read the same saved records, never chat prose. */
export function savedWork(state: ProjectState & { tasks: Task[] }) {
  const projects = state.projects
    .filter((p) => p.status !== "archived")
    .map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      deadline: p.deadline,
      ...projectProgress(p),
    }));
  return {
    projects,
    quickTasks: state.tasks.map((t) => ({ ...t })),
    openProjects: projects.filter((p) => p.status !== "completed").length,
    openQuickTasks: state.tasks.filter((t) => !t.done).length,
  };
}

// Only direct inventory requests bypass generation. Advice, edits, screen
// questions and task creation still go through the normal assistant flow.
function legacyInventory(text: string) {
  const t = text
    .toLowerCase()
    .replace(/[?!.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:(?:bito[, ]+)?(?:tugas(?:ku| aku| saya)?|proyek(?:ku| aku| saya)?) (?:ada )?apa (?:aja|saja)(?: sekarang)?|apa (?:aja|saja) (?:tugasku|tugas aku|tugas saya|proyekku)|(?:lihat|tampilkan|cek|daftar)(?:in)? (?:semua )?(?:tugas(?:ku| aku| saya)?|proyek(?:ku| aku| saya)?))$/.test(
    t,
  );
}

export type SavedWorkView = "tasks" | "schedule" | "priority";
export function savedWorkQuery(text: string): SavedWorkView | null {
  const t = text
    .toLowerCase()
    .replace(/[?!.,]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^bito /, "");
  if (
    legacyInventory(t) ||
    /^(?:aku|saya) (?:ada |punya )?tugas apa (?:aja|saja)(?: sekarang)?$/.test(
      t,
    )
  )
    return "tasks";
  if (
    /^(?:(?:lihat|tampilkan|cek) )?(?:jadwal|kalender)(?: tugas(?:ku| aku| saya)?)?(?:ku| aku| saya)?(?: sekarang)?$/.test(
      t,
    )
  )
    return "schedule";
  if (
    /^(?:(?:lihat|tampilkan|cek) )?(?:prioritas tugas(?:ku| aku| saya)?|tugas mana (?:yang )?(?:paling mendesak|perlu didahulukan))$/.test(
      t,
    )
  )
    return "priority";
  return null;
}
export function isSavedWorkQuery(text: string) {
  return savedWorkQuery(text) !== null;
}
export function prioritizedWork(state: ProjectState, today: string) {
  return state.projects
    .filter((p) => !["archived", "completed"].includes(p.status))
    .slice()
    .sort((a, b) => {
      const ad = a.deadline || "9999",
        bd = b.deadline || "9999";
      return ad.localeCompare(bd) || a.name.localeCompare(b.name);
    })
    .map((p) => ({
      project: p,
      reason: !p.deadline
        ? "Belum ada tenggat"
        : p.deadline < today
          ? "Lewat tenggat"
          : p.deadline === today
            ? "Hari ini"
            : "Tenggat terdekat",
    }));
}

/** A single task inventory for priority and schedule surfaces. */
export function savedTaskItems(state: ProjectState & { tasks: Task[] }) {
  return [
    ...state.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      date: t.dueDate ?? null,
      priority: t.priority ?? 4,
      projectId: null as string | null,
      projectName: "Tugas singkat",
    })),
    ...state.projects
      .filter((p) => p.status !== "archived")
      .flatMap((p) =>
        (p.plan?.milestones || []).flatMap((m) =>
          m.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            done: t.status === "done",
            date: t.dueDate === undefined ? m.targetDate : t.dueDate,
            priority: t.priority ?? 4,
            projectId: p.id as string | null,
            projectName: p.name,
          })),
        ),
      ),
  ];
}
