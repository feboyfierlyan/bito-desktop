import { z } from "zod";
import {
  recordProjectProgress,
  touchProject,
  type Project,
  type ProjectState,
} from "../src/projects";
import { openProjectSession, sessionElapsed } from "../src/project-work";

/** One active work session per account. Persist timestamps, never tick counters. */
export function workCommand(
  state: ProjectState,
  p: Project,
  name: string,
  raw: unknown,
  now = Date.now(),
) {
  if (name === "project-work-defer") {
    p.suggestionDeferredUntil = now + 60 * 60000;
    touchProject(p, now);
    return { ok: true };
  }
  if (p.status !== "active" || !p.plan)
    throw Error("Setujui rencana aktif terlebih dahulu.");
  if (name === "project-work-start") {
    const args = z
      .object({
        taskId: z.string().uuid(),
        objective: z.string().trim().min(1).max(500),
        minutes: z.number().int().min(5).max(180).nullable(),
      })
      .parse(raw);
    if (state.projects.some((p) => openProjectSession(p)))
      throw Error("Masih ada sesi terbuka. Isi laporan sesi tersebut dahulu.");
    const task = p.plan.milestones
      .flatMap((m) => m.tasks)
      .find((t) => t.id === args.taskId);
    if (!task || task.status === "done")
      throw Error("Pilih langkah yang belum selesai di rencana aktif.");
    if (task.status === "blocked")
      throw Error("Selesaikan hambatannya atau ubah status langkah dahulu.");
    recordProjectProgress(p, now);
    task.status = "doing";
    p.suggestionDeferredUntil = 0;
    p.sessions = [
      ...(p.sessions || []).slice(-99),
      {
        id: crypto.randomUUID(),
        taskId: task.id,
        taskTitle: task.title,
        objective: args.objective,
        minutes: args.minutes,
        phase: "running",
        startedAt: now,
        resumedAt: now,
        elapsedMs: 0,
        endedAt: null,
      },
    ];
  } else {
    const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(raw);
    const s = openProjectSession(p);
    if (!s || s.id !== sessionId)
      throw Error("Sesi sudah berubah. Periksa sesi terbaru.");
    if (name === "project-work-pause" || name === "project-work-finish") {
      if (s.phase !== "running" && s.phase !== "paused")
        throw Error("Sesi sudah menunggu laporan.");
      s.elapsedMs = sessionElapsed(s, now);
      s.resumedAt = null;
      s.phase = name === "project-work-pause" ? "paused" : "review";
      if (s.phase === "review") s.endedAt = now;
    } else if (name === "project-work-checkpoint") {
      const args = z
        .object({
          note: z.string().trim().max(1000),
          nextStep: z.string().trim().max(1000),
          expectedCheckpointAt: z.number().nullable(),
        })
        .parse(raw);
      if (s.phase !== "paused")
        throw Error("Jeda sesi sebelum menyimpan titik terakhir.");
      if ((p.checkpoint?.updatedAt ?? null) !== args.expectedCheckpointAt)
        throw Error(
          "Catatan sudah berubah. Buka kembali catatan terbaru dahulu.",
        );
      const task = p.plan.milestones
        .flatMap((m) => m.tasks)
        .find((t) => t.id === s.taskId);
      if (!task || task.status === "done")
        throw Error("Langkah sesi sudah berubah.");
      p.checkpoint = {
        taskId: task.id,
        lastStop: args.note,
        nextStep: args.nextStep,
        blocker: p.checkpoint?.taskId === task.id ? p.checkpoint.blocker : "",
        updatedAt: Math.max(now, (p.checkpoint?.updatedAt ?? 0) + 1),
      };
    } else if (name === "project-work-resume") {
      if (s.phase !== "paused") throw Error("Sesi tidak sedang dijeda.");
      s.phase = "running";
      s.resumedAt = now;
    } else if (name === "project-work-report") {
      const args = z
        .object({
          outcome: z.enum(["done", "partial", "blocked"]),
          note: z.string().trim().max(1000),
          nextStep: z.string().trim().max(1000),
        })
        .parse(raw);
      if (args.outcome === "blocked" && !args.note)
        throw Error("Ceritakan singkat bagian yang membuatmu mentok.");
      const task = p.plan.milestones
        .flatMap((m) => m.tasks)
        .find((t) => t.id === s.taskId);
      if (!task) throw Error("Langkah sesi tidak ditemukan.");
      // Validate the entire report before mutating anything.
      recordProjectProgress(p, now);
      s.elapsedMs = sessionElapsed(s, now);
      s.resumedAt = null;
      s.phase = "finished";
      s.endedAt = now;
      Object.assign(s, args);
      task.status =
        args.outcome === "done"
          ? "done"
          : args.outcome === "blocked"
            ? "blocked"
            : "doing";
      p.checkpoint = {
        taskId: task.id,
        lastStop:
          args.note ||
          `${task.title}: ${args.outcome === "done" ? "selesai" : "belum selesai"}.`,
        nextStep: args.nextStep,
        blocker: args.outcome === "blocked" ? args.note : "",
        updatedAt: now,
      };
      recordProjectProgress(p, now);
    } else throw Error("Tindakan sesi tidak tersedia.");
  }
  touchProject(p, now);
  return {
    ok: true,
    ...(name === "project-work-checkpoint"
      ? { value: { updatedAt: p.checkpoint!.updatedAt } }
      : {}),
  };
}

/** Expiry asks for a report; it never guesses work completion. Runs once, including after restart. */
export function expireProjectSessions(state: ProjectState, now = Date.now()) {
  const expired: { project: Project; sessionId: string }[] = [];
  for (const p of state.projects) {
    const s = openProjectSession(p);
    if (
      p.status !== "active" ||
      !s ||
      s.phase !== "running" ||
      s.minutes === null ||
      sessionElapsed(s, now) < s.minutes * 60000
    )
      continue;
    s.endedAt =
      s.resumedAt === null
        ? now
        : s.resumedAt + Math.max(0, s.minutes * 60000 - s.elapsedMs);
    s.elapsedMs = s.minutes * 60000;
    s.resumedAt = null;
    s.phase = "review";
    touchProject(p, now);
    expired.push({ project: p, sessionId: s.id });
  }
  return expired;
}
