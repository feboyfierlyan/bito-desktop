import { z } from "zod";
import type { AppState } from "../src/shared";
import {
  engageProjectCompanion,
  projectCoachRelevant,
  companionSessionMinutes,
} from "../src/project-companion";
import { openProjectSession, projectWorkEntry } from "../src/project-work";
import { prepareProjectAssistance } from "./project-assist";

/** All buttons revalidate the current account and plan before changing any work. */
export function projectCoachAction(
  state: AppState,
  raw: unknown,
  now = Date.now(),
) {
  const args = z
    .object({
      messageId: z.string().uuid(),
      action: z.enum(["start", "open", "later", "rest"]),
    })
    .strict()
    .parse(raw);
  const message = state.messages.find((m) => m.id === args.messageId);
  if (!message || !projectCoachRelevant(state, message, now))
    throw Error(
      "Saran ini sudah berubah. Buka tugas untuk melihat langkah terbaru.",
    );
  const project = state.projects.find((p) => p.id === message.projectId)!;
  let assistance: ReturnType<typeof prepareProjectAssistance> | undefined;
  if (args.action === "start") {
    if (message.notification!.coach!.reason === "blocked" || !message.notification!.coach!.taskId)
      throw Error("Periksa tugas ini dahulu sebelum mulai sesi.");
    const entry = projectWorkEntry(project, message.notification!.coach!.taskId, companionSessionMinutes);
    if (!entry)
      throw Error("Langkah sudah berubah. Periksa rencana terbaru.");
    // The same resolver owns board, notification and chat context. Prepare all
    // context before mutating the session so a failed validation leaves it intact.
    const session = openProjectSession(project);
    assistance = prepareProjectAssistance(state, {
      ...entry.payload,
      minutes: session ? session.minutes : companionSessionMinutes,
    }, now);
  } else if (args.action === "later") {
    engageProjectCompanion(state, now);
    state.projectCompanion!.snoozedUntil = now + 60 * 60000;
    project.suggestionDeferredUntil = now + 60 * 60000;
  } else if (args.action === "rest") {
    engageProjectCompanion(state, now);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    state.projectCompanion!.snoozedUntil = tomorrow.getTime();
    project.suggestionDeferredUntil = tomorrow.getTime();
  } else state.activeProjectId = project.id;
  engageProjectCompanion(state, now);
  message.notification!.handledAt = now;
  return { projectId: project.id, action: args.action, assistance };
}
