import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { BitoButton } from "./ui/controls";
import { TaskComposer } from "./TaskComposer";
import { taskDateLabel } from "./task-capture";
import { useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  FolderOpen,
  ListChecks,
  Plus,
  Check,
} from "lucide-react";
import { savedWork, savedTaskItems, type SavedWorkView } from "./saved-work";
import type { Reply, Snapshot } from "./shared";
import "./SavedWorkDirectory.css";
import {
  calendarWeek,
  localDateKey,
  projectCalendarItems,
} from "./project-board";

type Props = {
  state: Snapshot;
  act: (name: string, payload?: unknown) => Promise<Reply>;
  quickOnly?: boolean;
  initialView?: SavedWorkView;
  fixedView?: boolean;
  onDirty?: (dirty: boolean) => void;
};
const labels = {
  planning: "Disiapkan",
  active: "Berjalan",
  completed: "Selesai",
  archived: "Arsip",
};
export function SavedWorkDirectory({
  state,
  act,
  quickOnly = false,
  fixedView = false,
  initialView = "tasks",
  onDirty,
}: Props) {
  const directory = savedWork(state);
  const [showCompleted, setShowCompleted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<SavedWorkView>(initialView);
  const [weekOffset, setWeekOffset] = useState(0);
  const today = localDateKey(new Date());
  const anchor = new Date();
  anchor.setDate(anchor.getDate() + weekOffset * 7);
  const week = calendarWeek(anchor);
  const taskItems = savedTaskItems(state);
  const agenda = [
    ...state.projects
      .filter((p) => p.status !== "archived")
      .flatMap((p) =>
        projectCalendarItems(p).map((item) => ({
          ...item,
          projectId: p.id,
          projectName: p.name,
        })),
      ),
    ...taskItems
      .filter((t) => !t.projectId && t.date)
      .map((t) => ({ ...t, date: t.date!, kind: "task" as const })),
  ];
  const priority = taskItems
    .filter((t) => !t.done)
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        (a.date || "9999").localeCompare(b.date || "9999") ||
        a.title.localeCompare(b.title),
    );
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const run = async (name: string, payload?: unknown) => {
    if (pending || state.busy) return;
    setPending(true);
    setError("");
    try {
      const result = await act(name, payload);
      if (!result.ok) setError(result.error || "Belum bisa dibuka. Coba lagi.");
      return result;
    } catch {
      setError("Belum bisa dibuka. Coba lagi.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div
      className={`saved-work-directory ${quickOnly ? "saved-work-full" : ""}`}
    >
      {!quickOnly && (
        <>
          {!fixedView && (
            <SegmentedControl
              className="bito-work-views"
              label="Tampilan tugas"
              value={view}
              onChange={(next) => setView(next as SavedWorkView)}
              layout="fill"
            >
              {(
                [
                  ["tasks", "Tugas"],
                  ["schedule", "Jadwal"],
                  ["priority", "Prioritas"],
                ] as const
              ).map(([id, label]) => (
                <SegmentedControlItem key={id} value={id} label={label} />
              ))}
            </SegmentedControl>
          )}
          {view === "schedule" && (
            <div className="saved-work-schedule">
              <div className="saved-work-week-nav">
                <strong className="saved-work-week-label">
                  {week[0].date.toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  –{" "}
                  {week[6].date.toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </strong>
                <BitoButton
                  aria-label="Minggu sebelumnya"
                  onClick={() => setWeekOffset((n) => n - 1)}
                >
                  <ChevronLeft size={16} />
                </BitoButton>
                <BitoButton onClick={() => setWeekOffset(0)}>
                  Minggu ini
                </BitoButton>
                <BitoButton
                  aria-label="Minggu berikutnya"
                  onClick={() => setWeekOffset((n) => n + 1)}
                >
                  <ChevronRight size={16} />
                </BitoButton>
              </div>
              <div className="saved-work-week">
                {week.map((day) => (
                  <div key={day.key} data-today={day.key === today}>
                    <small>
                      {day.date.toLocaleDateString("id-ID", {
                        weekday: "short",
                      })}
                    </small>
                    <strong>{day.date.getDate()}</strong>
                    <span>
                      {agenda.filter((a) => a.date === day.key).length
                        ? `${agenda.filter((a) => a.date === day.key).length} agenda`
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
              {agenda
                .filter((a) => a.date >= week[0].key && a.date <= week[6].key)
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((a) => (
                  <BitoButton
                    className="saved-work-row"
                    key={a.id}
                    disabled={pending || state.busy}
                    onClick={() =>
                      void run(
                        a.projectId ? "project-open" : "quick-tasks-open",
                        a.projectId || undefined,
                      )
                    }
                  >
                    <span>
                      <strong>{a.title}</strong>
                      <small>
                        {a.projectName} · {taskDateLabel(a.date)} ·{" "}
                        {a.done
                          ? "Selesai"
                          : a.kind === "deadline"
                            ? "Tenggat"
                            : "Target"}
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </BitoButton>
                ))}
              {!agenda.some(
                (a) => a.date >= week[0].key && a.date <= week[6].key,
              ) && (
                <p className="saved-work-empty">Belum ada target minggu ini.</p>
              )}
              {directory.projects.some((p) => !p.deadline) && (
                <small>
                  Tugas tanpa tanggal tetap ada di proyek atau Tugas singkat.
                </small>
              )}
            </div>
          )}
          {view === "priority" && (
            <div className="saved-work-priority">
              <small>
                Urutan pengerjaan: tinggi, sedang, rendah, lalu tanpa prioritas.
                Tanggal terdekat ditampilkan lebih dulu.
              </small>
              {priority.map((t) => (
                <BitoButton
                  className="saved-work-row"
                  key={t.id}
                  disabled={pending || state.busy}
                  onClick={() =>
                    void run(
                      t.projectId ? "project-open" : "quick-tasks-open",
                      t.projectId || undefined,
                    )
                  }
                >
                  <span className="priority-copy">
                    <strong>{t.title}</strong>
                    <small>
                      <span
                        className="priority-label"
                        data-priority={t.priority}
                      >
                        {
                          ["", "Tinggi", "Sedang", "Rendah", "Tanpa prioritas"][
                            t.priority
                          ]
                        }
                      </span>
                      {" · "}
                      {t.projectName}
                      {t.date
                        ? ` · ${taskDateLabel(t.date)}${t.date < today ? " · Terlewat" : ""}`
                        : ""}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </BitoButton>
              ))}
              {!priority.length && (
                <p className="saved-work-empty">Tidak ada tugas berjalan.</p>
              )}
            </div>
          )}
        </>
      )}
      {!quickOnly && view === "tasks" && (
        <>
          <div className="saved-work-heading">
            <FolderOpen size={16} />
            <strong>Tugas dengan rencana</strong>
            <span>{directory.openProjects} berjalan</span>
          </div>
          {directory.projects.map((project) => (
            <BitoButton
              className="saved-work-row"
              key={project.id}
              disabled={pending || state.busy}
              onClick={() => void run("project-open", project.id)}
            >
              <span>
                <strong>{project.name}</strong>
                <small>
                  {labels[project.status]}
                  {project.total > 0 &&
                    ` · ${project.done}/${project.total} langkah`}
                  {project.deadline &&
                    ` · ${new Date(`${project.deadline}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`}
                </small>
              </span>
              {project.total > 0 && (
                <span
                  className="saved-work-meter"
                  aria-label={`${project.done} dari ${project.total} langkah selesai`}
                >
                  <i
                    style={{
                      width: `${(project.done / project.total) * 100}%`,
                    }}
                  />
                </span>
              )}
              <ChevronRight size={16} />
            </BitoButton>
          ))}
          {!directory.projects.length && (
            <p className="saved-work-empty">Belum ada tugas dengan rencana.</p>
          )}
          <BitoButton
            className="saved-work-row saved-work-quick-link"
            disabled={pending || state.busy}
            onClick={() => void run("quick-tasks-open")}
          >
            <ListChecks size={16} />
            <span>
              <strong>Tugas singkat</strong>
              <small>
                {directory.openQuickTasks} belum selesai ·{" "}
                {directory.quickTasks.length} tersimpan
              </small>
            </span>
            <ChevronRight size={16} />
          </BitoButton>
        </>
      )}
      {quickOnly && (
        <>
          <p className="saved-work-intro">
            {directory.openQuickTasks} belum selesai
          </p>
          {adding ? (
            <TaskComposer
              projects={state.projects}
              act={act}
              inline
              onDirty={onDirty}
              busy={state.busy}
              onSaved={() => setAdding(false)}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <BitoButton
              className="board-add-step"
              onClick={() => setAdding(true)}
            >
              <Plus size={16} />
              Tambah tugas
            </BitoButton>
          )}
          {directory.quickTasks.some((t) => t.done) && (
            <BitoButton
              className="completed-toggle"
              aria-pressed={showCompleted}
              onClick={() => setShowCompleted((v) => !v)}
            >
              {showCompleted ? "Sembunyikan" : "Tampilkan"}{" "}
              {directory.quickTasks.filter((t) => t.done).length} tugas selesai
            </BitoButton>
          )}
          {!directory.openQuickTasks && (
            <div className="board-all-done">
              <Check size={24} />
              <h2>
                {directory.quickTasks.length
                  ? "Semua tugas selesai."
                  : "Ada yang ingin kamu kerjakan?"}
              </h2>
              <p>
                {directory.quickTasks.length
                  ? "Kamu bisa kembali ke proyek atau menambahkan tugas berikutnya."
                  : "Catat tugas kecil yang tidak perlu masuk proyek."}
              </p>
            </div>
          )}
          {directory.quickTasks
            .filter((t) => showCompleted || !t.done)
            .map((task) => (
              <div
                className={`saved-work-task ${task.done ? "is-done" : ""}`}
                key={task.id}
              >
                <CheckboxInput
                  label={task.title}
                  value={task.done}
                  isDisabled={pending || state.busy}
                  onChange={() => void run("task-toggle", task.id)}
                />
                {task.details && (
                  <p className="saved-task-meta">{task.details}</p>
                )}
                {(task.dueDate || (task.priority && task.priority < 4)) && (
                  <div className="saved-task-meta">
                    {task.dueDate && <time>{taskDateLabel(task.dueDate)}</time>}
                    {task.priority && task.priority < 4 && (
                      <span data-priority={task.priority}>
                        P{task.priority}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
        </>
      )}
      {error && (
        <p role="alert" className="saved-work-error">
          {error}
        </p>
      )}
    </div>
  );
}
