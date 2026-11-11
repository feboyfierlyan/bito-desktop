import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  PanelRight,
  X,
} from "lucide-react";
import { BitoButton, BitoSelect } from "./ui/controls";
import { savedTaskItems } from "./saved-work";
import {
  calendarWeek,
  localDateKey,
  projectCalendarItems,
} from "./project-board";
import { taskContentStamp } from "./task-capture";
import { ProjectCalendar } from "./ProjectCalendar";
import {
  WorkspaceTaskPanel,
  type TaskSelection,
  type WorkspaceAct,
} from "./WorkspaceTaskPanel";
import type { Snapshot } from "./shared";
import type { Project } from "./projects";
export function WorkspaceSchedule({
  state,
  act,
  busy,
  onDirty,
  onProject,
}: {
  state: Snapshot;
  act: WorkspaceAct;
  busy: boolean;
  onDirty: (v: boolean) => void;
  onProject: (p: Project) => void;
}) {
  const reduced = useReducedMotion() || state.settings.reducedMotion;
  const viewId = useId();
  const contextToggle = useRef<HTMLButtonElement>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelDirty, setPanelDirty] = useState(false);
  const [panelBusy, setPanelBusy] = useState(false);
  const [pendingPanel, setPendingPanel] = useState<{
    task: TaskSelection | null;
    day: string;
    open: boolean;
  } | null>(null);
  useEffect(() => {
    onDirty(panelDirty);
    return () => onDirty(false);
  }, [panelDirty, onDirty]);
  const [anchor, setAnchor] = useState(() => new Date()),
    [view, setView] = useState<"month" | "week">("month");
  const [day, setDay] = useState(() => localDateKey(new Date())),
    [choice, setChoice] = useState(""),
    [error, setError] = useState("");
  const [task, setTask] = useState<TaskSelection | null>(null),
    [connect, setConnect] = useState(false);
  const applyPanel = (next: {
    task: TaskSelection | null;
    day: string;
    open: boolean;
  }) => {
    setPendingPanel(null);
    setPanelDirty(false);
    setTask(next.task);
    setDay(next.day);
    setPanelOpen(next.open);
    setChoice("");
    setError("");
    if (!next.open) contextToggle.current?.focus({ preventScroll: true });
  };
  const requestPanel = (
    nextTask: TaskSelection | null,
    nextDay = day,
    open = true,
  ) => {
    if (busy || panelBusy) return;
    if (
      nextTask &&
      task?.id === nextTask.id &&
      task.projectId === nextTask.projectId
    )
      return;
    const next = { task: nextTask, day: nextDay, open };
    if (panelDirty) setPendingPanel(next);
    else applyPanel(next);
  };
  const today = localDateKey(new Date());
  const inventory = savedTaskItems(state);
  const agenda = [
    ...state.projects
      .filter((p) => p.status !== "archived")
      .flatMap((p) =>
        projectCalendarItems(p)
          .filter((e) => e.kind !== "task")
          .map((e) => ({ ...e, projectId: p.id, projectName: p.name })),
      ),
    ...inventory
      .filter((t) => t.date)
      .map((t) => ({ ...t, date: t.date!, kind: "task" as const })),
  ];
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const start = calendarWeek(view === "month" ? first : anchor)[0].date;
  const days = Array.from({ length: view === "month" ? 42 : 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return { date: d, key: localDateKey(d) };
  });
  const candidates = inventory.filter(
    (t) =>
      !t.done &&
      !state.projects.some(
        (p) => p.id === t.projectId && p.status === "completed",
      ),
  );
  const connectionProject =
    state.projects.find((p) => p.status === "active") ||
    state.projects.find((p) => p.status !== "archived");
  async function schedule() {
    const t = candidates.find(
      (t) => `${t.projectId || "quick"}:${t.id}` === choice,
    );
    if (!t || !day) return;
    const p = state.projects.find((p) => p.id === t.projectId),
      quick = state.tasks.find((q) => q.id === t.id);
    const r = await act(
      p ? "project-task-date" : "task-update",
      p
        ? { id: p.id, taskId: t.id, version: p.version, dueDate: day }
        : {
            id: t.id,
            expected: taskContentStamp(quick!),
            changes: { title: t.title, dueDate: day },
          },
    );
    if (r.ok) {
      setChoice("");
      setError("");
    } else setError(r.error || "Tanggal belum tersimpan.");
  }
  return (
    <div
      className="workspace-task-columns workspace-schedule-columns"
      data-insights={panelOpen}
      data-reduced-motion={!!reduced}
      data-detail={!!task}
    >
      <div className="workspace-tasks workspace-schedule">
        <header className="tasks-page-header">
          <div>
            <p className="workspace-day">
              {new Date().toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <h1>Jadwal</h1>
          </div>
          <div className="tasks-header-tools">
            <BitoButton
              ref={contextToggle}
              className="insights-toggle"
              aria-label={panelOpen ? "Tutup kolom kanan" : "Buka agenda"}
              title={panelOpen ? "Tutup kolom kanan" : "Buka agenda"}
              aria-expanded={panelOpen}
              aria-controls="schedule-context-column"
              disabled={busy || panelBusy}
              onClick={() => requestPanel(null, day, !panelOpen)}
            >
              <PanelRight size={18} />
            </BitoButton>
          </div>
        </header>
        <div
          className="task-scope-tabs"
          role="tablist"
          aria-label="Tampilan jadwal"
          data-all={view === "month"}
        >
          {(["week", "month"] as const).map((value) => (
            <BitoButton
              key={value}
              role="tab"
              id={`${viewId}-${value}`}
              aria-selected={view === value}
              aria-controls={`${viewId}-calendar`}
              tabIndex={view === value ? 0 : -1}
              onClick={() => setView(value)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "week"
                    : event.key === "End"
                      ? "month"
                      : view === "week"
                        ? "month"
                        : "week";
                setView(next);
                document.getElementById(`${viewId}-${next}`)?.focus();
              }}
            >
              {value === "week" ? "Minggu" : "Bulan"}
            </BitoButton>
          ))}
        </div>
        <div className="schedule-toolbar">
          <div>
            <BitoButton
              aria-label="Periode sebelumnya"
              onClick={() =>
                setAnchor((d) =>
                  view === "month"
                    ? new Date(d.getFullYear(), d.getMonth() - 1, 1, 12)
                    : new Date(
                        d.getFullYear(),
                        d.getMonth(),
                        d.getDate() - 7,
                        12,
                      ),
                )
              }
            >
              <ChevronLeft size={18} />
            </BitoButton>
            <h2>
              {anchor.toLocaleDateString("id-ID", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <BitoButton
              aria-label="Periode berikutnya"
              onClick={() =>
                setAnchor((d) =>
                  view === "month"
                    ? new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)
                    : new Date(
                        d.getFullYear(),
                        d.getMonth(),
                        d.getDate() + 7,
                        12,
                      ),
                )
              }
            >
              <ChevronRight size={18} />
            </BitoButton>
          </div>
          <div>
            <BitoButton
              onClick={() => {
                setAnchor(new Date());
                requestPanel(null, today);
              }}
            >
              Hari ini
            </BitoButton>
          </div>
        </div>
        <div
          className="schedule-layout"
          role="tabpanel"
          id={`${viewId}-calendar`}
          aria-labelledby={`${viewId}-${view}`}
        >
          <div className="schedule-scroll">
            <div className={`schedule-grid ${view}`}>
              {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
                <div className="schedule-weekday" key={d}>
                  {d}
                </div>
              ))}
              {days.map((d) => (
                <div
                  className="schedule-cell"
                  key={d.key}
                  data-outside={
                    view === "month" && d.date.getMonth() !== anchor.getMonth()
                  }
                  data-selected={day === d.key}
                >
                  <BitoButton
                    className="schedule-date"
                    aria-label={d.date.toLocaleDateString("id-ID", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    aria-current={d.key === today ? "date" : undefined}
                    aria-pressed={d.key === day}
                    onClick={() => {
                      requestPanel(null, d.key);
                    }}
                  >
                    {d.date.getDate()}
                  </BitoButton>
                  {agenda
                    .filter((e) => e.date === d.key)
                    .slice(0, 3)
                    .map((e) => (
                      <BitoButton
                        key={`${e.projectId}-${e.kind}-${e.id}`}
                        title={`${e.title} · ${e.projectName}`}
                        className={`schedule-event ${e.done ? "is-done" : ""}`}
                        onClick={() => {
                          if (e.kind === "task")
                            requestPanel(
                              { id: e.id, projectId: e.projectId },
                              d.key,
                            );
                          else {
                            requestPanel(null, d.key);
                          }
                        }}
                      >
                        {e.title}
                      </BitoButton>
                    ))}
                  {agenda.filter((e) => e.date === d.key).length > 3 && (
                    <BitoButton
                      className="schedule-more"
                      onClick={() => requestPanel(null, d.key)}
                    >
                      +{agenda.filter((e) => e.date === d.key).length - 3}{" "}
                      lainnya
                    </BitoButton>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <footer className="schedule-footer">
          <p>
            {candidates.filter((t) => !t.date).length} tugas belum dijadwalkan
          </p>
          <BitoButton
            disabled={busy}
            onClick={() =>
              connectionProject
                ? setConnect(true)
                : void act("show-settings", "ai")
            }
          >
            <CalendarDays size={15} />
            Google Calendar
          </BitoButton>
        </footer>
      </div>
      <div
        className="workspace-context-slot"
        inert={!panelOpen}
        aria-hidden={!panelOpen}
      >
        <AnimatePresence initial={false}>
          {panelOpen && (
            <motion.div
              key="schedule-context"
              className="workspace-context-column"
              id="schedule-context-column"
              initial={{ opacity: 0, x: reduced ? 0 : 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduced ? 0 : 10 }}
              transition={{
                duration: reduced ? 0 : 0.3,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {pendingPanel && (
                <div className="task-switch-confirm" role="alert">
                  <p>Ada perubahan yang belum disimpan.</p>
                  <div>
                    <BitoButton onClick={() => setPendingPanel(null)}>
                      Lanjut mengedit
                    </BitoButton>
                    <BitoButton
                      disabled={busy || panelBusy}
                      onClick={() => applyPanel(pendingPanel)}
                    >
                      Abaikan perubahan
                    </BitoButton>
                  </div>
                </div>
              )}
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  className="workspace-context-content"
                  key={task ? `${task.projectId}-${task.id}` : `agenda-${day}`}
                  initial={{ opacity: 0, x: reduced ? 0 : 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: reduced ? 0 : -4 }}
                  transition={{ duration: reduced ? 0 : 0.14, ease: "easeOut" }}
                >
                  {task ? (
                    <WorkspaceTaskPanel
                      embedded
                      state={state}
                      selection={task}
                      act={act}
                      busy={busy}
                      onDirty={setPanelDirty}
                      onBusy={setPanelBusy}
                      returnLabel="Kembali ke agenda"
                      onClose={() =>
                        applyPanel({ task: null, day, open: true })
                      }
                    />
                  ) : (
                    <aside
                      className="schedule-day"
                      aria-label="Agenda tanggal terpilih"
                    >
                      <header>
                        <div>
                          <p className="schedule-day-label">Agenda</p>
                          <h2>
                            {new Date(`${day}T12:00:00`).toLocaleDateString(
                              "id-ID",
                              {
                                day: "numeric",
                                month: "long",
                              },
                            )}
                          </h2>
                        </div>
                        <BitoButton
                          aria-label="Tutup agenda"
                          onClick={() => requestPanel(null, day, false)}
                        >
                          <X size={16} />
                        </BitoButton>
                      </header>
                      {agenda
                        .filter((e) => e.date === day)
                        .map((e) => (
                          <BitoButton
                            className={`schedule-day-item ${e.done ? "is-done" : ""}`}
                            key={`${e.projectId}-${e.kind}-${e.id}`}
                            onClick={() => {
                              if (e.kind === "task")
                                requestPanel({
                                  id: e.id,
                                  projectId: e.projectId,
                                });
                              else {
                                const p = state.projects.find(
                                  (p) => p.id === e.projectId,
                                );
                                if (p) onProject(p);
                              }
                            }}
                          >
                            <span>{e.title}</span>
                            <small>
                              {e.projectName}
                              {e.kind === "deadline"
                                ? " · Tenggat"
                                : e.kind === "milestone"
                                  ? " · Target kelompok"
                                  : ""}
                            </small>
                          </BitoButton>
                        ))}
                      {!agenda.some((e) => e.date === day) && (
                        <p className="schedule-day-empty">
                          Belum ada agenda untuk tanggal ini.
                        </p>
                      )}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void schedule();
                        }}
                      >
                        <h3>Jadwalkan tugas</h3>
                        <BitoSelect
                          label="Jadwalkan tugas"
                          value={choice}
                          disabled={busy}
                          onValueChange={setChoice}
                        >
                          <option value="">Pilih tugas…</option>
                          {candidates.map((t) => (
                            <option
                              key={`${t.projectId}-${t.id}`}
                              value={`${t.projectId || "quick"}:${t.id}`}
                            >
                              {t.title}
                            </option>
                          ))}
                        </BitoSelect>
                        <BitoButton
                          variant="primary"
                          type="submit"
                          disabled={busy || !choice}
                        >
                          Simpan tanggal
                        </BitoButton>
                      </form>
                      {error && (
                        <p className="board-error" role="alert">
                          {error}
                        </p>
                      )}
                    </aside>
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {connect && connectionProject && (
          <ProjectCalendar
            project={connectionProject}
            connection={state.calendar}
            act={act}
            reduced={state.settings.reducedMotion}
            onClose={() => setConnect(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
