import { z } from "zod";
import { projectDate, type Project } from "./projects";

export const taskCaptureSchema = z
  .object({
    title: z.string().trim().min(1, "Isi nama tugas dulu.").max(200),
    details: z.string().trim().max(1000).optional(),
    dueDate: projectDate.optional(),
    priority: z.number().int().min(1).max(4).optional(),
  })
  .strict();
export type TaskCapture = z.infer<typeof taskCaptureSchema>;
export function parseQuickTask(value: unknown) {
  return taskCaptureSchema.parse(
    typeof value === "string" ? { title: value } : value,
  );
}
export function taskDateLabel(date?: string | null) {
  return date
    ? new Date(`${date}T12:00:00`).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      })
    : "Tanggal";
}
export function taskCaptureCommand(
  draft: TaskCapture,
  project?: Project,
  milestoneId?: string,
) {
  const data = taskCaptureSchema.parse(draft);
  return project
    ? {
        name: "project-task-capture",
        payload: {
          id: project.id,
          version: project.version,
          planId: project.plan?.id ?? null,
          milestoneId: milestoneId || null,
          ...data,
        },
      }
    : { name: "task-add", payload: data };
}
