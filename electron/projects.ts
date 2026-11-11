import { taskCaptureSchema } from "../src/task-capture";
import { savedWork } from "../src/saved-work";
import { z } from "zod";
import type { AppState, Reply } from "../src/shared";
import {
  activeProject,
  approveProjectPlan,
  newProject,
  projectBriefSchema,
  projectDate,
  projectPlanSchema,
  touchProject,
  validateProjectPlan,
  taskUnderstandingSchema,
  recordProjectProgress,
  type Project,
  type ProjectPlan,
} from "../src/projects";
import type { ToolCall } from "../supabase/functions/_shared/protocol";
import type { ToolReceipt } from "./rich-actions";
import { workCommand } from "./project-work";
import {
  openProjectSession,
  projectDashboard,
  recommendProjectWork,
} from "../src/project-work";

const short = (max: number) => z.string().trim().max(max);
function requireProject(state: AppState, id: string) {
  const p = state.projects.find((p) => p.id === id);
  if (!p) throw Error("Proyek tidak ditemukan di akun ini.");
  return p;
}
function editable(p: Project) {
  if (p.status === "archived" || p.status === "completed")
    throw Error("Buka kembali proyek untuk mengubahnya.");
}
export function projectCommand(
  state: AppState,
  name: string,
  raw: unknown,
): Reply {
  if (name === "project-create") {
    if (state.projects.length >= 100)
      throw Error("Maksimal 100 proyek di perangkat ini.");
    const p = newProject(raw);
    state.projects.unshift(p);
    state.activeProjectId = p.id;
    return { ok: true, value: p.id };
  }
  if (name === "project-select") {
    const id = z.string().uuid().nullable().parse(raw);
    if (id && requireProject(state, id).status === "archived")
      throw Error("Buka kembali proyek dari arsip dahulu.");
    state.activeProjectId = id;
    return { ok: true };
  }
  const p = z.object({ id: z.string().uuid() }).passthrough().parse(raw);
  const project = requireProject(state, p.id);
  if (name.startsWith("project-work-")) {
    editable(project);
    const result = workCommand(state, project, name, raw);
    if (name === "project-work-start") state.activeProjectId = project.id;
    return result;
  }
  if (name === "project-status") {
    const { status } = z
      .object({
        status: z.enum(["planning", "active", "completed", "archived"]),
      })
      .parse(raw);
    if (status !== "active" && openProjectSession(project))
      throw Error("Isi laporan sesi terbuka dahulu sebelum menutup proyek.");
    if (status === "active" && !project.plan)
      throw Error("Setujui rencana terlebih dahulu.");
    if (
      status === "completed" &&
      (!project.plan ||
        !project.plan.milestones.some((m) => m.tasks.length > 0) ||
        project.plan.milestones.some((m) =>
          m.tasks.some((t) => t.status !== "done"),
        ))
    )
      throw Error(
        "Masih ada langkah terbuka. Selesaikan dahulu atau arsipkan proyek.",
      );
    project.status = status;
    if (status === "archived" && state.activeProjectId === project.id)
      state.activeProjectId = null;
    touchProject(project);
    return { ok: true };
  }
  editable(project);
  if (name === "project-brief") {
    const next = projectBriefSchema.parse(
      z.object({ brief: z.unknown() }).parse(raw).brief,
    );
    if (
      next.deadline &&
      [project.plan, project.draft].some((plan) =>
        plan?.milestones.some(
          (m) =>
            (m.targetDate && m.targetDate > next.deadline!) ||
            m.tasks.some((t) => t.dueDate && t.dueDate > next.deadline!),
        ),
      )
    )
      throw Error(
        "Rencana melewati tenggat baru. Sesuaikan tanggal milestone dahulu.",
      );
    const taskChanged =
      project.brief !== next.brief || project.outcome !== next.outcome;
    Object.assign(project, next);
    // Scheduling answers may arrive after task review; do not send users back
    // through the same confirmation just for providing their available time.
    if (project.understanding && taskChanged)
      project.understanding.confirmedAt = null;
  } else if (name === "project-understanding-confirm") {
    const data = z
      .object({
        version: z.number().int(),
        understandingId: z.string().uuid(),
        understanding: taskUnderstandingSchema,
      })
      .parse(raw);
    if (
      project.version !== data.version ||
      project.understanding?.id !== data.understandingId
    )
      throw Error("Tugas sudah berubah. Periksa pemahaman terbaru dahulu.");
    if (
      data.understanding.sourceIds.some(
        (id) => !project.materials.some((m) => m.id === id),
      )
    )
      throw Error("Bahan rujukan tidak ada di tugas ini.");
    project.understanding = {
      ...data.understanding,
      id: data.understandingId,
      confirmedAt: Date.now(),
    };
  } else if (name === "project-draft") {
    const data = z
      .object({ version: z.number().int(), plan: projectPlanSchema })
      .parse(raw);
    if (project.version !== data.version)
      throw Error("Proyek sudah berubah. Muat draf terbaru dahulu.");
    project.draft = validateProjectPlan(project, data.plan);
  } else if (name === "project-approve") {
    if (project.understanding && !project.understanding.confirmedAt)
      throw Error("Konfirmasi pemahaman tugas yang terbaru dahulu.");
    const data = z
      .object({ version: z.number().int(), draftId: z.string().uuid() })
      .parse(raw);
    approveProjectPlan(project, data.draftId, data.version);
    return { ok: true };
  } else if (name === "project-discard-draft") project.draft = null;
  else if (name === "project-material-add") {
    const material = z
      .object({
        name: short(200).min(1),
        content: short(48000).min(1),
        kind: z.enum(["text", "pdf", "image"]).optional(),
        hash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        warnings: z.array(short(300)).max(8).optional(),
      })
      .strict()
      .parse(z.object({ material: z.unknown() }).parse(raw).material);
    if (
      project.materials.length >= 12 ||
      project.materials.reduce((n, m) => n + m.content.length, 0) +
        material.content.length >
        192000
    )
      throw Error(
        "Bahan proyek maksimal 12 file dan 192.000 karakter. Pilih bagian yang relevan.",
      );
    project.materials.push({
      ...material,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    });
    if (project.understanding) project.understanding.confirmedAt = null;
  } else if (name === "project-material-remove") {
    const mid = z
      .object({ materialId: z.string().uuid() })
      .parse(raw).materialId;
    if (
      [project.plan, project.draft].some((plan) =>
        plan?.milestones.some((m) =>
          m.tasks.some((t) => t.sourceIds.includes(mid)),
        ),
      )
    )
      throw Error(
        "Bahan ini masih dirujuk oleh rencana. Hapus rujukannya dari draf dahulu.",
      );
    project.materials = project.materials.filter((m) => m.id !== mid);
    if (project.understanding) {
      project.understanding.confirmedAt = null;
      project.understanding.sourceIds = project.understanding.sourceIds.filter(
        (id) => id !== mid,
      );
    }
  } else if (name === "project-group-add" || name === "project-group-edit") {
    const data = z
      .object({
        version: z.number().int(),
        planId: z.string().uuid().nullable(),
        milestoneId: z.string().uuid().optional(),
        title: short(200).min(1, "Isi nama kelompok tugas."),
        targetDate: projectDate,
      })
      .parse(raw);
    if (
      project.version !== data.version ||
      (project.plan?.id ?? null) !== data.planId
    )
      throw Error("Rencana sudah berubah. Buka kembali kelompok tugasnya.");
    if (project.draft)
      throw Error("Periksa draf rencana sebelum mengubah kelompok tugas.");
    const candidate: ProjectPlan = project.plan
      ? structuredClone(project.plan)
      : {
          id: crypto.randomUUID(),
          summary: project.brief || project.name,
          assumptions: [],
          milestones: [],
        };
    if (name === "project-group-add") {
      if (candidate.milestones.length >= 8)
        throw Error("Maksimal 8 kelompok per proyek.");
      candidate.milestones.push({
        id: crypto.randomUUID(),
        title: data.title,
        targetDate: data.targetDate,
        tasks: [],
      });
    } else {
      const group = candidate.milestones.find((m) => m.id === data.milestoneId);
      if (!group) throw Error("Kelompok tugas tidak ditemukan.");
      group.title = data.title;
      group.targetDate = data.targetDate;
    }
    try {
      validateProjectPlan(project, candidate);
    } catch {
      throw Error(
        "Tanggal kelompok harus berurutan dan tidak melewati tenggat proyek.",
      );
    }
    project.plan = candidate;
    if (project.status === "planning") project.status = "active";
  } else if (name === "project-schedule") {
    const data = z
      .object({
        version: z.number().int(),
        planId: z.string().uuid(),
        milestoneId: z.string().uuid().nullable(),
        targetDate: projectDate,
      })
      .parse(raw);
    if (project.version !== data.version || project.plan?.id !== data.planId)
      throw Error(
        "Rencananya sudah berubah. Buka tanggalnya lagi untuk mengedit.",
      );
    // Validate the entire candidate before writing anything, including a pending draft.
    const candidate = structuredClone(project);
    if (data.milestoneId) {
      const milestone = candidate.plan!.milestones.find(
        (m) => m.id === data.milestoneId,
      );
      if (!milestone) throw Error("Target ini tidak ada di rencana aktif.");
      milestone.targetDate = data.targetDate;
    } else candidate.deadline = data.targetDate;
    try {
      validateProjectPlan(candidate, candidate.plan);
      if (candidate.draft) validateProjectPlan(candidate, candidate.draft);
    } catch {
      throw Error(
        "Tanggal target harus berurutan dan tidak melewati tenggat tugas. Periksa juga draf perubahan jika ada.",
      );
    }
    project.deadline = candidate.deadline;
    project.plan = candidate.plan;
  } else if (name === "project-task-add" || name === "project-task-capture") {
    const capture = name === "project-task-capture";
    const data = taskCaptureSchema
      .extend({
        version: z.number().int(),
        planId: capture ? z.string().uuid().nullable() : z.string().uuid(),
        milestoneId: capture ? z.string().uuid().nullable() : z.string().uuid(),
      })
      .strip()
      .parse(raw);
    if (
      project.version !== data.version ||
      (project.plan?.id ?? null) !== data.planId
    )
      throw Error("Rencananya sudah berubah. Buka lagi untuk menambah tugas.");
    if (project.draft)
      throw Error("Periksa draf rencana sebelum menambah tugas.");
    const candidate: ProjectPlan = project.plan
      ? structuredClone(project.plan)
      : {
          id: crypto.randomUUID(),
          summary: project.brief || project.name,
          assumptions: [],
          milestones: [
            {
              id: crypto.randomUUID(),
              title: "Tugas",
              targetDate: null,
              tasks: [],
            },
          ],
        };
    const milestone = data.milestoneId
      ? candidate.milestones.find((m) => m.id === data.milestoneId)
      : !project.plan
        ? candidate.milestones[0]
        : undefined;
    if (!milestone) throw Error("Pilih kelompok tugas di rencana aktif.");
    if (data.dueDate && project.deadline && data.dueDate > project.deadline)
      throw Error(
        "Tanggal tugas melewati tenggat proyek. Pilih tanggal yang lebih awal.",
      );
    milestone.tasks.push({
      id: crypto.randomUUID(),
      title: data.title,
      details: data.details || "",
      doneWhen: "",
      estimateMin: 25,
      estimateMax: 25,
      sourceIds: [],
      status: "todo",
      ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
    });
    validateProjectPlan(project, candidate);
    recordProjectProgress(project);
    project.plan = candidate;
    if (capture && project.status === "planning") project.status = "active";
    recordProjectProgress(project);
  } else if (name === "project-task-edit") {
    const data = z.object({ taskId: z.string().uuid(), version: z.number().int(), changes: taskCaptureSchema }).parse(raw);
    if (project.version !== data.version) throw Error("Tugas sudah berubah. Buka kembali detailnya.");
    const candidate = structuredClone(project.plan);
    const task = candidate?.milestones.flatMap(m => m.tasks).find(t => t.id === data.taskId);
    if (!task) throw Error("Tugas tidak ditemukan.");
    Object.assign(task, data.changes);
    validateProjectPlan(project, candidate);
    project.plan = candidate;
  } else if (name === "project-task-date") {
    const data = z
      .object({
        taskId: z.string().uuid(),
        version: z.number().int(),
        dueDate: projectDate,
      })
      .parse(raw);
    if (project.version !== data.version)
      throw Error("Tugas sudah berubah. Buka kembali tanggalnya.");
    const task = project.plan?.milestones
      .flatMap((m) => m.tasks)
      .find((t) => t.id === data.taskId);
    if (!task) throw Error("Tugas tidak ditemukan.");
    if (data.dueDate && project.deadline && data.dueDate > project.deadline)
      throw Error("Tanggal tugas melewati tenggat proyek.");
    task.dueDate = data.dueDate;
  } else if (name === "project-task") {
    const data = z
      .object({
        taskId: z.string().uuid(),
        status: z.enum(["todo", "doing", "blocked", "done"]),
        expectedStatus: z.enum(["todo", "doing", "blocked", "done"]).optional(),
      })
      .parse(raw);
    const task = project.plan?.milestones
      .flatMap((m) => m.tasks)
      .find((t) => t.id === data.taskId);
    if (!task) throw Error("Langkah ini tidak ada di rencana aktif.");
    if (data.expectedStatus && task.status !== data.expectedStatus)
      throw Error("Statusnya sudah berubah. Periksa langkah terbaru.");
    if (openProjectSession(project)?.taskId === task.id)
      throw Error("Laporkan hasil lewat sesi yang sedang terbuka.");
    if (task.status === data.status) return { ok: true };
    recordProjectProgress(project);
    task.status = data.status;
    recordProjectProgress(project);
  } else if (name === "project-checkpoint") {
    const data = z
      .object({
        taskId: z.string().uuid().nullable().optional(),
        lastStop: short(1000),
        nextStep: short(1000),
        blocker: short(1000),
      })
      .parse(raw);
    project.checkpoint = { ...data, updatedAt: Date.now() };
  } else throw Error("Tindakan proyek tidak tersedia.");
  touchProject(project);
  return { ok: true };
}

export function applyProjectTool(
  state: AppState,
  call: ToolCall,
  scope: string | null,
): ToolReceipt | undefined {
  if (
    ![
      "create_project",
      "update_project_brief",
      "propose_project_plan",
      "update_project_progress",
      "read_project_material",
      "review_project_task",
      "show_project_status",
      "list_saved_work",
    ].includes(call.name)
  )
    return;
  if (call.name === "list_saved_work") {
    const { offset } = z
      .object({ offset: z.number().int().min(0).max(100000) })
      .strict()
      .parse(call.args);
    const directory = savedWork(state);
    // The backend caps each receipt at 2,000 characters. Paginate by the
    // actual serialized budget so neither long names nor many tasks break JSON.
    const records = [
      ...directory.projects.map((value) => ({
        kind: "project" as const,
        value,
      })),
      ...directory.quickTasks.map((value) => ({
        kind: "task" as const,
        value,
      })),
    ];
    const page = {
      openProjects: directory.openProjects,
      openQuickTasks: directory.openQuickTasks,
      projects: [] as typeof directory.projects,
      quickTasks: [] as typeof directory.quickTasks,
      nextOffset: null as number | null,
      visualCardShown: true,
    };
    let cursor = Math.min(offset, records.length);
    while (cursor < records.length) {
      const row = records[cursor];
      if (row.kind === "project") page.projects.push(row.value);
      else page.quickTasks.push(row.value);
      page.nextOffset = cursor + 1 < records.length ? cursor + 1 : null;
      if (JSON.stringify(page).length > 1900) {
        if (row.kind === "project") page.projects.pop();
        else page.quickTasks.pop();
        page.nextOffset = cursor;
        break;
      }
      cursor++;
    }
    return {
      id: call.id,
      ok: true,
      result: JSON.stringify(page),
      card: { id: call.id, kind: "saved-work" },
    };
  }
  if (call.name === "create_project") {
    if (scope || activeProject(state))
      throw Error(
        "Sudah ada proyek aktif. Gunakan proyek tersebut atau buka obrolan umum untuk proyek baru.",
      );
    const args = z
      .object({
        name: short(100).min(1),
        brief: short(4000),
        outcome: short(1000),
        deadline: projectDate,
        availability: short(1000),
      })
      .strict()
      .parse(call.args);
    const output = projectCommand(state, "project-create", args);
    return {
      id: call.id,
      ok: true,
      result: `Ruang proyek dibuat, ID ${output.value}. Belum ada rencana aktif. Tanyakan info penting yang belum ada sebelum menyusun draf.`,
      card: {
        id: call.id,
        kind: "project",
        projectId: output.value as string,
        title: args.name,
        draftId: null,
      },
    };
  }
  const project = activeProject(state);
  if (!project || project.id !== scope)
    throw Error(
      "Konteks proyek berubah. Minta pengguna mengirim ulang dari proyek yang benar.",
    );
  if (call.name === "show_project_status") {
    const { minutes } = z
      .object({ minutes: z.number().int().min(5).max(180).nullable() })
      .strict()
      .parse(call.args);
    const d = projectDashboard(project);
    const next = recommendProjectWork(project, minutes || 25);
    return {
      id: call.id,
      ok: true,
      result: JSON.stringify({
        done: d.done,
        total: d.total,
        daysLeft: d.daysLeft,
        overdueSteps: d.overdue.length,
        blocked: d.blocked,
        session: d.session?.phase || null,
        nextTask: next && {
          id: next.task.id,
          title: next.task.title,
          objective: next.objective,
          slice: next.slice,
          minutes: next.minutes,
        },
        visualCardShown: true,
      }),
      card: {
        id: call.id,
        kind: "project",
        projectId: project.id,
        title: project.name,
        draftId: null,
        stage: "status",
        minutes: minutes || 25,
      },
    };
  }
  if (call.name === "read_project_material") {
    const args = z
      .object({
        materialId: z.string().uuid(),
        query: short(200),
        offset: z.number().int().min(0).max(48000).nullable(),
      })
      .strict()
      .parse(call.args);
    const m = project.materials.find((m) => m.id === args.materialId);
    if (!m) throw Error("Bahan tidak ditemukan di proyek ini.");
    const match = args.query
      ? m.content.toLocaleLowerCase().indexOf(args.query.toLocaleLowerCase())
      : -1;
    const start = Math.min(
      m.content.length,
      args.offset ?? Math.max(0, match - 180),
    );
    let excerpt = m.content.slice(start, start + 1200);
    const result = () =>
      JSON.stringify({
        materialId: m.id,
        name: m.name,
        offset: start,
        nextOffset: start + excerpt.length,
        total: m.content.length,
        hasMore: start + excerpt.length < m.content.length,
        queryFound: match >= 0,
        excerpt,
      });
    while (result().length > 1900)
      excerpt = excerpt.slice(0, Math.floor(excerpt.length * 0.8));
    return { id: call.id, ok: true, result: result() };
  }
  editable(project);
  if (call.name === "review_project_task") {
    const data = taskUnderstandingSchema.parse(call.args);
    if (
      data.sourceIds.some((id) => !project.materials.some((m) => m.id === id))
    )
      throw Error("Bahan rujukan tidak ada di tugas ini.");
    project.understanding = {
      ...data,
      id: crypto.randomUUID(),
      confirmedAt: null,
    };
    touchProject(project);
    return {
      id: call.id,
      ok: true,
      result:
        "Pemahaman tugas tersimpan untuk diperiksa. Minta pengguna mengoreksi atau menekan ‘Sudah sesuai’. Jangan buat timeline sebelum konfirmasi tersebut.",
      card: {
        id: call.id,
        kind: "project",
        projectId: project.id,
        title: "Cek pemahaman tugas",
        draftId: null,
        stage: "understanding",
      },
    };
  }
  if (call.name === "update_project_brief") {
    const args = projectBriefSchema.parse(call.args);
    projectCommand(state, "project-brief", { id: project.id, brief: args });
    return {
      id: call.id,
      ok: true,
      result:
        "Brief proyek diperbarui sesuai informasi pengguna. Rencana belum diubah.",
    };
  }
  if (call.name === "update_project_progress") {
    const data = z
      .object({
        taskId: z.string().uuid().nullable(),
        status: z.enum(["todo", "doing", "blocked", "done"]).nullable(),
        lastStop: short(1000),
        nextStep: short(1000),
        blocker: short(1000),
      })
      .strict()
      .parse(call.args);
    if ((data.taskId && !data.status) || (!data.taskId && data.status))
      throw Error("Status harus disertai ID langkah yang tepat.");
    const session = openProjectSession(project);
    if (
      data.taskId &&
      session?.taskId === data.taskId &&
      ["done", "doing", "blocked"].includes(data.status!)
    ) {
      workCommand(state, project, "project-work-report", {
        sessionId: session.id,
        outcome:
          data.status === "done"
            ? "done"
            : data.status === "blocked"
              ? "blocked"
              : "partial",
        note: data.blocker || data.lastStop,
        nextStep: data.nextStep,
      });
    } else if (data.taskId)
      projectCommand(state, "project-task", {
        id: project.id,
        taskId: data.taskId,
        status: data.status,
      });
    projectCommand(state, "project-checkpoint", { id: project.id, ...data });
    return {
      id: call.id,
      ok: true,
      result:
        "Titik lanjut tersimpan. Status hanya diperbarui pada langkah yang dipilih pengguna.",
      card: {
        id: call.id,
        kind: "project",
        projectId: project.id,
        title: project.name,
        draftId: null,
        stage: "status",
      },
    };
  }
  if (!project.understanding?.confirmedAt)
    throw Error(
      "Pemahaman tugas belum dikonfirmasi. Gunakan review_project_task dahulu, lalu tunggu pengguna menekan Sudah sesuai.",
    );
  const task = z
    .object({
      existingTaskId: z.string().uuid().nullable(),
      title: short(200).min(1),
      details: short(1000),
      doneWhen: short(500),
      estimateMin: z.number().int().min(5).max(2400),
      estimateMax: z.number().int().min(5).max(2400),
      sourceIds: z.array(z.string().uuid()).max(10),
    })
    .strict();
  const args = z
    .object({
      summary: short(2000),
      assumptions: z.array(short(400)).max(8),
      milestones: z
        .array(
          z
            .object({
              title: short(200).min(1),
              targetDate: projectDate,
              tasks: z.array(task).min(1).max(12),
            })
            .strict(),
        )
        .min(1)
        .max(8),
    })
    .strict()
    .parse(call.args);
  const existing = new Map(
    project.plan?.milestones.flatMap((m) => m.tasks).map((t) => [t.id, t]) ||
      [],
  );
  const plan = validateProjectPlan(project, {
    id: crypto.randomUUID(),
    summary: args.summary,
    assumptions: args.assumptions,
    milestones: args.milestones.map((m) => ({
      ...m,
      id: crypto.randomUUID(),
      tasks: m.tasks.map(({ existingTaskId, ...t }) => {
        if (existingTaskId && !existing.has(existingTaskId))
          throw Error("ID langkah lama tidak ditemukan dalam proyek ini.");
        return {
          ...t,
          ...(existingTaskId &&
          existing.get(existingTaskId)!.dueDate !== undefined
            ? { dueDate: existing.get(existingTaskId)!.dueDate }
            : {}),
          ...(existingTaskId &&
          existing.get(existingTaskId)!.priority !== undefined
            ? { priority: existing.get(existingTaskId)!.priority }
            : {}),
          id: existingTaskId || crypto.randomUUID(),
          status: existingTaskId
            ? existing.get(existingTaskId)!.status
            : "todo",
        };
      }),
    })),
  });
  const planned = new Set(
    plan.milestones.flatMap((m) => m.tasks.map((t) => t.id)),
  );
  if (
    [...existing.values()].some(
      (t) => t.status === "done" && !planned.has(t.id),
    )
  )
    throw Error(
      "Pertahankan langkah yang sudah selesai dengan existingTaskId-nya dalam revisi rencana.",
    );
  project.draft = plan;
  touchProject(project);
  return {
    id: call.id,
    ok: true,
    result:
      "Draf rencana tersimpan untuk ditinjau pengguna. Belum aktif; jangan mengklaim deadline disepakati, kalender dibuat, atau pengingat dijadwalkan. Tombol tinjau tersedia.",
    card: {
      id: call.id,
      kind: "project",
      projectId: project.id,
      title: project.name,
      draftId: plan.id,
    },
  };
}
