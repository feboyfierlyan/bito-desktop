import type { Project } from "./projects";
import { openProjectSession, projectWorkEntry } from "./project-work";

export type ProjectFilter = "all" | "ongoing" | "completed";
export function filterWorkspaceProjects(
  projects: Project[],
  query: string,
  filter: ProjectFilter,
  archived = false,
) {
  const term = query.trim().toLocaleLowerCase("id-ID");
  return projects.filter(
    (p) =>
      (archived ? p.status === "archived" : p.status !== "archived") &&
      (archived ||
        filter === "all" ||
        (filter === "completed"
          ? p.status === "completed"
          : p.status !== "completed")) &&
      p.name.toLocaleLowerCase("id-ID").includes(term),
  );
}

/** Continue an open session first; never recommend archived or completed work. */
export function workspaceOverview(
  projects: Project[],
  activeId?: string | null,
) {
  const current = projects.filter((p) => p.status !== "archived");
  const ongoing = current.filter((p) => p.status !== "completed");
  const sessions = ongoing.filter(
    (p) => p.status === "active" && openProjectSession(p),
  );
  const running = sessions.find((p) => p.id === activeId) || sessions[0];
  const candidates = ongoing.filter(
    (p) => p.status === "active" && projectWorkEntry(p),
  );
  const focus =
    running ||
    candidates.find((p) => p.id === activeId) ||
    candidates[0] ||
    ongoing.find((p) => p.status === "planning");
  const session = focus && openProjectSession(focus);
  const entry = focus && projectWorkEntry(focus, session?.taskId);
  // A review is distinct from a work recommendation: blocked/exhausted plans
  // should stay reachable without pretending they have an actionable task.
  const review = !focus
    ? ongoing.find((p) => p.id === activeId) || ongoing[0]
    : undefined;
  return {
    current,
    ongoing,
    completed: current.length - ongoing.length,
    focus,
    session,
    entry,
    review,
  };
}
