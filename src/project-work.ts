import { projectProgress, type Project, type WorkSession } from "./projects";

export const dayKey = (at = Date.now()) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Calendar arithmetic, independent of daylight-saving changes and UTC parsing.
export const dayNumber = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
export function sessionElapsed(s: WorkSession, now = Date.now()) {
  const elapsed =
    s.elapsedMs +
    (s.phase === "running" && s.resumedAt !== null
      ? Math.max(0, now - s.resumedAt)
      : 0);
  return s.minutes === null ? elapsed : Math.min(elapsed, s.minutes * 60000);
}
export function openProjectSession(p: Project) {
  return p.sessions?.find((s) => s.phase !== "finished");
}
export function projectDashboard(p: Project, now = Date.now()) {
  const today = dayKey(now);
  const rows = (p.plan?.milestones || []).flatMap((m, index) =>
    m.tasks.map((task) => ({
      task,
      milestone: m,
      index,
    })),
  );
  const remaining = rows.filter((r) => r.task.status !== "done");
  const overdue = remaining.filter(
    (r) => r.milestone.targetDate && r.milestone.targetDate < today,
  );
  const daysLeft = p.deadline ? dayNumber(p.deadline) - dayNumber(today) : null;
  const stats = projectProgress(p);
  return {
    ...stats,
    today,
    rows,
    overdue,
    daysLeft,
    percent: stats.total ? Math.round((stats.done / stats.total) * 100) : 0,
    remainingMin: remaining.reduce((n, r) => n + r.task.estimateMin, 0),
    remainingMax: remaining.reduce((n, r) => n + r.task.estimateMax, 0),
    session: openProjectSession(p),
    recent: (p.sessions || []).filter((s) => s.phase === "finished").at(-1),
  };
}
export function recommendProjectWork(
  p: Project,
  minutes = 25,
  now = Date.now(),
) {
  const d = projectDashboard(p, now);
  const candidates = d.rows
    .filter((r) => ["doing", "todo"].includes(r.task.status))
    .sort((a, b) => {
      if (a.task.status !== b.task.status)
        return a.task.status === "doing" ? -1 : 1;
      if (a.task.status === "doing" && p.checkpoint?.taskId) {
        const saved =
          Number(b.task.id === p.checkpoint.taskId) -
          Number(a.task.id === p.checkpoint.taskId);
        if (saved) return saved;
      }
      return (
        (a.milestone.targetDate || "9999").localeCompare(
          b.milestone.targetDate || "9999",
        ) || a.index - b.index
      );
    });
  const row = candidates[0];
  if (!row) return;
  // Keep the next milestone in order; offer a slice rather than skipping hard work.
  const slice = row.task.estimateMax > minutes;
  return {
    ...row,
    minutes,
    slice,
    objective: slice
      ? `Mulai bagian pertama: ${row.task.title}`
      : row.task.title,
    continuationNote:
      p.checkpoint?.taskId === row.task.id && row.task.status === "doing"
        ? p.checkpoint.nextStep.slice(0, 500)
        : "",
    reason:
      row.task.status === "doing"
        ? "Lanjutkan yang sudah dimulai"
        : row.milestone.targetDate && row.milestone.targetDate < d.today
          ? "Target milestone sudah lewat"
          : row.milestone.targetDate
            ? "Langkah terbuka dari milestone terdekat"
            : "Langkah berikutnya dalam rencana",
  };
}
/** Same task, stopping point and target in the board, chat cards and the assistant. */
export function projectWorkEntry(
  p: Project,
  taskId?: string,
  minutes: number | null = null,
) {
  const row = taskId
    ? projectDashboard(p).rows.find((r) => r.task.id === taskId)
    : recommendProjectWork(p);
  if (!row || row.task.status === "done") return;
  const { task } = row;
  const checkpoint =
    task.status !== "todo" && p.checkpoint?.taskId === task.id
      ? p.checkpoint
      : null;
  const session = openProjectSession(p);
  const sameSession = session?.taskId === task.id ? session : undefined;
  const continuing = !!sameSession || task.status === "doing";
  const objective = (
    checkpoint?.nextStep ||
    sameSession?.objective ||
    (minutes !== null && task.estimateMax > minutes
      ? `${continuing ? "Lanjutkan" : "Mulai"} bagian pertama: ${task.title}`
      : task.title)
  ).slice(0, 500);
  const estimate =
    task.estimateMin === task.estimateMax
      ? `${task.estimateMin}`
      : `${task.estimateMin}–${task.estimateMax}`;
  return {
    ...row,
    checkpoint,
    objective,
    continuing,
    estimateLabel: `Perkiraan langkah: ${estimate} menit`,
    payload: {
      id: p.id,
      taskId: task.id,
      intent: continuing ? "continue" : "start",
      ...(sameSession?.phase === "paused"
        ? { resume: true }
        : { begin: !sameSession }),
      minutes,
    },
  };
}
export function planDateChanges(p: Project) {
  if (!p.plan || !p.draft) return [];
  // AI revisions may regenerate milestone IDs. Match by retained task IDs.
  return p.draft.milestones
    .map((m) => {
      const old =
        p.plan!.milestones.find((o) => o.id === m.id) ||
        p.plan!.milestones.find((o) =>
          o.tasks.some((t) => m.tasks.some((n) => n.id === t.id)),
        );
      return {
        title: m.title,
        before: old?.targetDate || null,
        after: m.targetDate,
        added: !old,
      };
    })
    .filter((m) => m.added || m.before !== m.after);
}
export const replanProjectPrompt =
  "Tolong usulkan revisi timeline dari progres nyata, tanggal hari ini, tenggat, dan waktu luangku. Kalau waktu luang atau target belum jelas, tanya satu hal dulu. Pertahankan langkah selesai dengan ID yang sama. Simpan sebagai draf, jangan terapkan otomatis. Tampilkan kartu rencana agar aku bisa membandingkan dan menyetujuinya.";
