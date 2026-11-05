import { z } from "zod";
import type { Message } from "./shared";

const text = (max: number) => z.string().trim().max(max);
export const projectDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Tanggal belum valid.")
  .nullable();
export const projectBriefSchema = z
  .object({
    name: text(100).min(1, "Beri nama proyekmu."),
    brief: text(4000),
    outcome: text(1000),
    deadline: projectDate,
    availability: text(1000),
  })
  .strict();
export const planTaskSchema = z
  .object({
    id: z.string().uuid(),
    title: text(200).min(1),
    details: text(1000),
    doneWhen: text(500),
    estimateMin: z.number().int().min(5).max(2400),
    estimateMax: z.number().int().min(5).max(2400),
    sourceIds: z.array(z.string().uuid()).max(10),
    status: z.enum(["todo", "doing", "blocked", "done"]),
    dueDate: projectDate.optional(),
    priority: z.number().int().min(1).max(4).optional(),
  })
  .strict()
  .refine((v) => v.estimateMax >= v.estimateMin, "Rentang waktu belum sesuai.");
export const planMilestoneSchema = z
  .object({
    id: z.string().uuid(),
    title: text(200).min(1),
    targetDate: projectDate,
    // Manual sections may be empty while the user builds their plan.
    tasks: z.array(planTaskSchema).max(12),
  })
  .strict();
export const projectPlanSchema = z
  .object({
    id: z.string().uuid(),
    summary: text(2000),
    assumptions: z.array(text(400).min(1)).max(8),
    milestones: z.array(planMilestoneSchema).min(1).max(8),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const ids = plan.milestones.flatMap((m) => [
      m.id,
      ...m.tasks.map((t) => t.id),
    ]);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "ID langkah harus unik." });
    if (plan.milestones.flatMap((m) => m.tasks).length > 40)
      ctx.addIssue({
        code: "custom",
        message: "Gunakan maksimal 40 langkah per rencana.",
      });
    const dates = plan.milestones.flatMap((m) =>
      m.targetDate ? [m.targetDate] : [],
    );
    if (dates.some((v, i) => i > 0 && v < dates[i - 1]))
      ctx.addIssue({
        code: "custom",
        message: "Tanggal milestone harus berurutan.",
      });
  });
export type ProjectPlan = z.infer<typeof projectPlanSchema>;
export type ProjectTask = z.infer<typeof planTaskSchema>;
export type ProjectMaterial = {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  kind?: "text" | "pdf" | "image";
  hash?: string;
  warnings?: string[];
};
export const taskUnderstandingSchema = z
  .object({
    summary: text(2000).min(1),
    deliverables: z.array(text(300).min(1)).min(1).max(8),
    requirements: z.array(text(300).min(1)).max(10),
    unknowns: z.array(text(300).min(1)).max(8),
    sourceIds: z.array(z.string().uuid()).max(12),
  })
  .strict();
export type TaskUnderstanding = z.infer<typeof taskUnderstandingSchema> & {
  id: string;
  confirmedAt: number | null;
};
export type Project = z.infer<typeof projectBriefSchema> & {
  id: string;
  version: number;
  status: "planning" | "active" | "completed" | "archived";
  createdAt: number;
  updatedAt: number;
  materials: ProjectMaterial[];
  plan: ProjectPlan | null;
  draft: ProjectPlan | null;
  understanding?: TaskUnderstanding | null;
  sessions?: WorkSession[];
  progressHistory?: { at: number; done: number; total: number }[];
  suggestionDeferredUntil?: number;
  checkpoint: {
    taskId?: string | null;
    lastStop: string;
    nextStep: string;
    blocker: string;
    updatedAt: number;
  } | null;
};
export type WorkSession = {
  id: string;
  taskId: string;
  taskTitle: string;
  objective: string;
  minutes: number | null;
  phase: "running" | "paused" | "review" | "finished";
  startedAt: number;
  resumedAt: number | null;
  elapsedMs: number;
  endedAt: number | null;
  outcome?: "done" | "partial" | "blocked";
  note?: string;
  nextStep?: string;
};
export type ProjectState = {
  projects: Project[];
  activeProjectId: string | null;
};
export function activeProject(state: ProjectState) {
  return state.projects.find(
    (p) => p.id === state.activeProjectId && p.status !== "archived",
  );
}
export function projectMessages(
  messages: Message[],
  projectId?: string | null,
) {
  return messages.filter((m) => (m.projectId || null) === (projectId || null));
}
export function newProject(raw: unknown, now = Date.now()): Project {
  return {
    ...projectBriefSchema.parse(raw),
    id: crypto.randomUUID(),
    version: 1,
    status: "planning",
    createdAt: now,
    updatedAt: now,
    materials: [],
    plan: null,
    draft: null,
    understanding: null,
    checkpoint: null,
  };
}
export function validateProjectPlan(
  project: Project,
  raw: unknown,
): ProjectPlan {
  const plan = projectPlanSchema.parse(raw);
  const sources = new Set(project.materials.map((m) => m.id));
  if (
    plan.milestones.some((m) =>
      m.tasks.some((t) => t.sourceIds.some((id) => !sources.has(id))),
    )
  )
    throw Error("Bahan rujukan tidak ada di proyek ini.");
  if (
    project.deadline &&
    plan.milestones.some(
      (m) =>
        (m.targetDate && m.targetDate > project.deadline!) ||
        m.tasks.some((t) => t.dueDate && t.dueDate > project.deadline!),
    )
  )
    throw Error(
      "Milestone melewati tenggat proyek. Ubah tanggal atau tenggatnya dahulu.",
    );
  return plan;
}
export function approveProjectPlan(
  project: Project,
  draftId: string,
  version: number,
  now = Date.now(),
) {
  if (
    project.version !== version ||
    !project.draft ||
    project.draft.id !== draftId
  )
    throw Error(
      "Draf sudah berubah. Periksa versi terbaru sebelum menyetujui.",
    );
  if (project.status === "archived" || project.status === "completed")
    throw Error("Buka kembali proyek terlebih dahulu.");
  const plan = validateProjectPlan(project, project.draft);
  // Preserve confirmed progress when revising a plan; new tasks must start open.
  const old = new Map(
    project.plan?.milestones
      .flatMap((m) => m.tasks)
      .map((t) => [t.id, t.status]) || [],
  );
  for (const m of plan.milestones)
    for (const t of m.tasks) t.status = old.get(t.id) || "todo";
  if (
    [...old].some(
      ([id, status]) =>
        status === "done" &&
        !plan.milestones.some((m) => m.tasks.some((t) => t.id === id)),
    )
  )
    throw Error("Pertahankan langkah yang sudah selesai di revisi rencana.");
  const openSession = project.sessions?.find((s) => s.phase !== "finished");
  if (
    openSession &&
    !plan.milestones.some((m) =>
      m.tasks.some((t) => t.id === openSession.taskId),
    )
  )
    throw Error(
      "Selesaikan laporan sesi yang masih terbuka sebelum menghapus langkahnya.",
    );
  project.plan = plan;
  project.draft = null;
  project.status = "active";
  recordProjectProgress(project, now);
  touchProject(project, now);
}
/** Observed snapshots only: never backfill a made-up completion curve. */
export function recordProjectProgress(project: Project, now = Date.now()) {
  const { done, total } = projectProgress(project);
  const history = project.progressHistory || [];
  const last = history.at(-1);
  if (!last || last.done !== done || last.total !== total)
    project.progressHistory = [...history, { at: now, done, total }].slice(
      -500,
    );
}
/** A progress chart shows the latest state per local day, not checkbox activity.
 * Keep the raw observations for audit, including legitimate reopenings. */
export function dailyProjectProgress(project: Project) {
  const days = new Map<string, { at: number; done: number; total: number }>();
  for (const row of [...(project.progressHistory || [])].sort(
    (a, b) => a.at - b.at,
  )) {
    const day = new Date(row.at).toLocaleDateString("en-CA");
    days.set(day, row);
  }
  return [...days.values()];
}
export function touchProject(project: Project, now = Date.now()) {
  project.version++;
  project.updatedAt = now;
}
export function projectProgress(project: Project) {
  const tasks = project.plan?.milestones.flatMap((m) => m.tasks) || [];
  return {
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
  };
}
export function nextProjectTask(project: Project, minutes?: number) {
  const tasks = project.plan?.milestones.flatMap((m) => m.tasks) || [];
  const candidates = tasks.filter(
    (t) => t.status === "doing" || t.status === "todo",
  );
  return candidates.find(
    (t) => minutes === undefined || t.estimateMax <= minutes,
  );
}
/** Bounded, explicit project context. Never send other projects or silently truncate a whole file. */
export function projectModelContext(
  state: ProjectState & { tasks?: { done: boolean }[] },
) {
  const savedWorkDirectory = {
    openProjects: state.projects.filter(
      (p) => p.status !== "archived" && p.status !== "completed",
    ).length,
    openQuickTasks: state.tasks?.filter((t) => !t.done).length || 0,
    readTool: "list_saved_work",
  };
  const project = activeProject(state);
  if (!project)
    return JSON.stringify({ activeProject: null, savedWorkDirectory });
  let remaining = 5000;
  const materials = project.materials.map((m) => {
    const excerpt = m.content.slice(0, Math.max(0, Math.min(1800, remaining)));
    remaining -= excerpt.length;
    return {
      id: m.id,
      name: m.name,
      characters: m.content.length,
      excerpt,
      truncated: excerpt.length < m.content.length,
      kind: m.kind || "text",
      warnings: (m.warnings || []).slice(0, 3).map((w) => w.slice(0, 180)),
      warningCount: m.warnings?.length || 0,
    };
  });
  const plan = (p: ProjectPlan | null) =>
    p && {
      id: p.id,
      summary: p.summary.slice(0, 500),
      assumptions: p.assumptions.map((a) => a.slice(0, 150)),
      milestones: p.milestones.map((m) => ({
        id: m.id,
        title: m.title.slice(0, 120),
        targetDate: m.targetDate,
        tasks: m.tasks.map((t) => ({
          id: t.id,
          title: t.title.slice(0, 120),
          status: t.status,
          dueDate: t.dueDate,
          priority: t.priority,
          estimateMin: t.estimateMin,
          estimateMax: t.estimateMax,
          doneWhen: t.doneWhen.slice(0, 80),
          sourceIds: t.sourceIds.slice(0, 3),
        })),
      })),
    };
  const context = {
    savedWorkDirectory,
    id: project.id,
    name: project.name,
    status: project.status,
    brief: project.brief,
    outcome: project.outcome,
    deadline: project.deadline,
    availability: project.availability,
    version: project.version,
    checkpoint: project.checkpoint,
    plan: plan(project.plan),
    draft: plan(project.draft),
    materials,
    understanding: project.understanding || null,
    localToday: (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })(),
    work: {
      current:
        (project.sessions || []).find((s) => s.phase !== "finished") || null,
      recent: (project.sessions || [])
        .filter((s) => s.phase === "finished")
        .slice(-3)
        .map((s) => ({
          taskId: s.taskId,
          outcome: s.outcome,
          endedAt: s.endedAt,
          note: s.note?.slice(0, 300),
          nextStep: s.nextStep?.slice(0, 300),
        })),
    },
  };
  let encoded = JSON.stringify(context);
  if (encoded.length > 28000 && context.draft) {
    context.draft = {
      ...context.draft,
      milestones: context.draft.milestones.map((m) => ({ ...m, tasks: [] })),
    };
    encoded = JSON.stringify({ ...context, draftTasksOmitted: true });
  }
  if (encoded.length > 32000) {
    // Keep every task ID and status usable even for unusually large plans.
    // Escape-heavy source text can take twice its character count in JSON.
    const compact = (p: ReturnType<typeof plan>) =>
      p && {
        ...p,
        summary: p.summary.slice(0, 150),
        assumptions: [],
        milestones: p.milestones.map((m) => ({
          ...m,
          title: m.title.slice(0, 60),
          tasks: m.tasks.map((t) => ({
            ...t,
            title: t.title.slice(0, 60),
            doneWhen: "",
            sourceIds: [],
          })),
        })),
      };
    encoded = JSON.stringify({
      ...context,
      brief: context.brief.slice(0, 1200),
      outcome: context.outcome.slice(0, 400),
      availability: context.availability.slice(0, 400),
      checkpoint: context.checkpoint && {
        ...context.checkpoint,
        lastStop: context.checkpoint.lastStop.slice(0, 300),
        nextStep: context.checkpoint.nextStep.slice(0, 300),
        blocker: context.checkpoint.blocker.slice(0, 300),
      },
      plan: compact(context.plan),
      draft: compact(context.draft),
      materials: materials.map((m) => ({
        ...m,
        excerpt: m.excerpt.slice(0, 100),
        truncated: m.characters > 100,
        warnings: m.warnings.slice(0, 1).map((w) => w.slice(0, 120)),
      })),
      contextCompacted: true,
      understanding: project.understanding && {
        ...project.understanding,
        summary: project.understanding.summary.slice(0, 600),
        requirements: project.understanding.requirements.slice(0, 4),
        unknowns: project.understanding.unknowns.slice(0, 4),
      },
    });
  }
  return encoded;
}

export const projectSetupPrompt =
  "Bantu aku memahami tugas ini dan merencanakan cara mengerjakannya. Pakai brief dan bahan yang benar-benar tersedia. Kalau pemahaman tugas belum dikonfirmasi, simpan ringkasan hasil yang harus dibuat, syarat, dan hal yang belum jelas dengan review_project_task agar bisa aku periksa dulu. Tanyakan hanya satu info penting yang belum ada, jangan ulang pertanyaan yang sudah terjawab. Kalau pemahaman sudah aku konfirmasi, buat draf langkah singkat dan realistis dengan informasi yang tersedia; tenggat yang belum diketahui tetap null, tulis asumsi singkat dan jangan menahan rencana hanya karena belum ada jadwal, lewat propose_project_plan. Tugas kecil cukup beberapa langkah, jangan dibikin ribet. Jangan menebak deadline, level pendidikan, atau menganggap draf timeline sudah disetujui.";
