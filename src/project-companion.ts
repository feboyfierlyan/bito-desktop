import type { AppState, Message } from "./shared";
import type { Project } from "./projects";
import {
  dayKey,
  dayNumber,
  openProjectSession,
  projectDashboard,
  projectWorkEntry,
  recommendProjectWork,
} from "./project-work";

type Coach = NonNullable<Message["notification"]>["coach"];
export type ProjectOffer = {
  key: string;
  projectId: string;
  text: string;
  coach: NonNullable<Coach>;
};
const minute = 60000;
export const companionSessionMinutes = 10;
const shorten = (text: string, length = 72) => {
  const chars = Array.from(text.trim().replace(/\s+/g, " "));
  return chars.length > length
    ? chars.slice(0, length - 1).join("") + "…"
    : chars.join("");
};

export function inCompanionHours(now: number, start: number, end: number) {
  const hour = new Date(now).getHours();
  return start < end
    ? hour >= start && hour < end
    : start > end && (hour >= start || hour < end);
}

export function projectCompanionEnabled(state: AppState, now: number) {
  return (
    state.onboarded &&
    state.settings.projectNudges !== false &&
    state.profile.proactive !== "quiet" &&
    !state.settings.dnd &&
    !state.sleeping &&
    inCompanionHours(
      now,
      state.settings.nudgeStartHour ?? 9,
      state.settings.nudgeEndHour ?? 21,
    ) &&
    now >= (state.projectCompanion?.snoozedUntil || 0)
  );
}

export function engageProjectCompanion(state: AppState, now = Date.now()) {
  state.projectCompanion = {
    snoozedUntil: state.projectCompanion?.snoozedUntil || 0,
    offers: state.projectCompanion?.offers || [],
    lastEngagedAt: now,
  };
}

function offerFor(
  state: AppState,
  p: Project,
  now: number,
): ProjectOffer | null {
  if (
    p.status !== "active" ||
    !p.plan ||
    now < (p.suggestionDeferredUntil || 0)
  )
    return null;
  const dashboard = projectDashboard(p, now);
  const session = openProjectSession(p);
  // A pause is not permission to start another task. Only revisit that same
  // session after an hour, and never interrupt a running session or its review.
  const open = state.projects.flatMap((project) => {
    const work = openProjectSession(project);
    return work ? [{ project, work }] : [];
  });
  if (open.length && (open.length !== 1 || open[0].project.id !== p.id ||
      session?.phase !== "paused" || now - p.updatedAt < 60 * minute)) return null;
  const suggested = session
    ? dashboard.rows.find((r) => r.task.id === session.taskId && ["doing", "todo"].includes(r.task.status))
    : recommendProjectWork(p, companionSessionMinutes, now);
  const entry = suggested && projectWorkEntry(p, suggested.task.id, companionSessionMinutes);
  const checkpoint = p.checkpoint;
  const recent = [...(p.sessions || [])]
    .reverse()
    .find((s) => s.phase === "finished");
  const blocked = dashboard.rows.find(
    (r) => r.task.status === "blocked" && r.task.id === checkpoint?.taskId,
  );
  let reason: NonNullable<Coach>["reason"] = "start";
  let taskId: string | null = suggested?.task.id || null;
  const direct = state.profile.style === "direct";
  let text: string;
  // Only celebrate explicitly reported results. Elapsed timers never imply progress.
  if (
    recent?.outcome === "done" &&
    !session &&
    dashboard.rows.some((r) => r.task.id === recent.taskId && r.task.status === "done") &&
    recent.endedAt &&
    now - recent.endedAt < 4 * 60 * minute
  ) {
    reason = "progress";
    taskId = suggested?.task.id || null;
    text = direct
      ? `“${shorten(recent.taskTitle)}” sudah beres. ${dashboard.done}/${dashboard.total} langkah selesai.`
      : `“${shorten(recent.taskTitle)}” udah beres. ${dashboard.done}/${dashboard.total} langkah selesai.`;
    text += suggested
      ? ` Berikutnya “${shorten(suggested.task.title)}”. Nanti kita cicil, ya?`
      : " Semua langkah di rencana ini selesai. Boleh istirahat dulu :)";
  } else if (!session && blocked && checkpoint?.blocker) {
    reason = "blocked";
    taskId = blocked.task.id;
    text = direct
      ? `Ada hambatan di “${shorten(blocked.task.title)}”. Mau kita urai?`
      : `Tadi kamu mentok di “${shorten(blocked.task.title)}”. Mau kita urai bagian yang bikin nyangkut?`;
  } else if (suggested) {
    const dueSoon =
      dashboard.overdue.length > 0 ||
      (dashboard.daysLeft !== null && dashboard.daysLeft <= 2);
    if (dueSoon) {
      reason = "deadline";
      const date = p.deadline
        ? new Date(`${p.deadline}T12:00:00`).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
          })
        : "";
      const timing =
        dashboard.daysLeft !== null && dashboard.daysLeft < 0
          ? `Tenggat “${shorten(p.name)}” sudah lewat.`
          : date
            ? `“${shorten(p.name)}” tenggatnya ${date}.`
            : `Ada tahap “${shorten(p.name)}” yang lewat target.`;
      text = `${timing} Langkah berikutnya “${shorten(entry!.objective)}”. ${session ? "Mau lanjut sesi yang dijeda?" : "Cicil 10 menit bareng?"}`;
    } else if (
      entry?.continuing
    ) {
      reason = "resume";
      const stopped = entry.checkpoint?.lastStop;
      text = `${stopped ? `Terakhir: ${shorten(stopped, 55)}. ` : ""}Lanjut “${shorten(entry.objective)}”? ${session ? "Sesi tadi masih tersimpan." : "10 menit dulu, nggak harus langsung beres."}`;
    } else {
      text = direct
        ? `Langkah berikutnya: “${shorten(suggested.task.title)}”. Mulai 10 menit?`
        : state.profile.style === "humor"
          ? `“${shorten(suggested.task.title)}” dicicil 10 menit dulu? Nggak harus langsung maraton wkwk.`
          : `Buat “${shorten(p.name)}”, mulai dari “${shorten(suggested.task.title)}”, yuk. 10 menit dulu?`;
    }
  } else return null;
  const anchor = `${p.plan.id}:${p.version}:${checkpoint?.updatedAt || 0}:${recent?.id || ""}:${session?.id || ""}:${session?.phase || ""}`;
  const key = `${p.id}:${reason}:${reason === "progress" ? recent!.id : dayKey(now)}`;
  return { key, projectId: p.id, text, coach: { reason, taskId, anchor } };
}

/** Pure, inexpensive scheduling: no screenshot monitoring or model calls on a timer. */
export function nextProjectOffer(
  state: AppState,
  now: number,
  availableSince: number,
) {
  if (
    !projectCompanionEnabled(state, now) ||
    state.focus.running
  )
    return null;
  const memory = state.projectCompanion;
  if (
    now - availableSince < 45000 ||
    now - (memory?.lastEngagedAt || 0) < 2 * minute
  )
    return null;
  const offers = memory?.offers || [];
  const todayCount = offers.filter((o) => dayKey(o.at) === dayKey(now)).length;
  const balanced = state.settings.nudgeCadence === "balanced";
  if (todayCount >= (balanced ? 3 : 2)) return null;
  const last = offers.reduce((max, o) => Math.max(max, o.at), 0);
  if (last && now - last < (balanced ? 60 : 120) * minute) return null;
  // Give explicit reminders, replies, and the onboarding welcome some breathing room.
  if (
    state.messages.some(
      (m) => m.notification && now - m.createdAt < 10 * minute,
    )
  )
    return null;
  const candidates = [...state.projects].sort(
    (a, b) =>
      Number(b.id === state.activeProjectId) -
        Number(a.id === state.activeProjectId) ||
      (a.deadline ? dayNumber(a.deadline) : Infinity) -
        (b.deadline ? dayNumber(b.deadline) : Infinity) ||
      b.updatedAt - a.updatedAt,
  );
  for (const p of candidates) {
    if (now - p.updatedAt < 2 * minute) continue;
    const offer = offerFor(state, p, now);
    if (offer && !offers.some((o) => o.key === offer.key)) return offer;
  }
  return null;
}

export function rememberProjectOffer(
  state: AppState,
  offer: ProjectOffer,
  now: number,
) {
  engageProjectCompanion(state, state.projectCompanion?.lastEngagedAt || 0);
  state.projectCompanion!.offers = [
    ...state.projectCompanion!.offers.filter((o) => now - o.at < 8 * 86400000),
    { key: offer.key, at: now },
  ].slice(-40);
}

/** Explicit revision preview skips waiting and budget, but never privacy or quiet preferences. */
export function previewProjectOffer(state: AppState, now = Date.now()) {
  if (
    !projectCompanionEnabled(state, now) ||
    state.focus.running
  )
    return null;
  const projects = [...state.projects].sort(
    (a, b) =>
      Number(b.id === state.activeProjectId) -
      Number(a.id === state.activeProjectId),
  );
  return projects.map((p) => offerFor(state, p, now)).find(Boolean) || null;
}

export function projectCoachRelevant(
  state: AppState,
  message: Message,
  now: number,
) {
  if (
    message.notification?.type !== "project-coach" ||
    !message.notification.coach ||
    !projectCompanionEnabled(state, now) ||
    state.focus.running ||
    now - message.createdAt > 10 * minute ||
    now < message.createdAt
  )
    return false;
  const p = state.projects.find((p) => p.id === message.projectId);
  const offer = p && offerFor(state, p, now);
  return (
    !!offer &&
    offer.coach.anchor === message.notification.coach.anchor &&
    offer.coach.reason === message.notification.coach.reason &&
    offer.coach.taskId === message.notification.coach.taskId
  );
}
