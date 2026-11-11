import { useEffect, useState, useRef, useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Plus,
  Play,
  Search,
  CalendarDays,
  PanelRight,
  Flag,
  Ban,
  List,
} from "lucide-react";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { BitoButton, BitoInput } from "./ui/controls";
import { BitoMascot } from "./ui/BitoMascot";
import { TaskComposer } from "./TaskComposer";
import {
  WorkspaceTaskPanel,
  type TaskSelection,
  type WorkspaceAct,
} from "./WorkspaceTaskPanel";
import {
  workspaceTaskInventory,
  workspaceTaskGroups,
  type TaskSort,
  type WorkspaceItem,
} from "./workspace-task-model";
import { TaskViewMenu } from "./TaskViewMenu";
import { WorkspaceInsights } from "./WorkspaceInsights";
import { workspaceOverview } from "./workspace-overview";
import { openProjectSession } from "./project-work";
import { taskDateLabel } from "./task-capture";
import { localDateKey } from "./project-board";
import type { Snapshot } from "./shared";
import type { Project } from "./projects";

import { TaskListGroup, TaskListRowMotion } from "./WorkspaceTaskListMotion";

type PendingTask = { task: WorkspaceItem; confirmed: boolean };
const taskKey = (task: WorkspaceItem) =>
  JSON.stringify([task.projectId, task.id]);

export function WorkspaceTasks({
  state,
  act,
  busy,
  onDirty,
  onProject,
  onAllProjects,
  onCreate,
  all = false,
  onViewChange,
}: {
  state: Snapshot;
  act: WorkspaceAct;
  busy: boolean;
  onDirty: (v: boolean) => void;
  onProject: (p: Project) => void;
  onAllProjects: () => void;
  onCreate: () => void;
  all?: boolean;
  onViewChange?: (all: boolean) => void;
}) {
  const reduced = useReducedMotion() || state.settings.reducedMotion;
  const contextToggle = useRef<HTMLButtonElement>(null);
  const viewId = useId();
  const [selection, setSelection] = useState<TaskSelection | null>(null);
  const [adding, setAdding] = useState(false),
    [completed, setCompleted] = useState(false),
    [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [captureDate, setCaptureDate] = useState<string | null>(null);
  const [captureDirty, setCaptureDirty] = useState(false),
    [panelDirty, setPanelDirty] = useState(false);
  useEffect(() => {
    onDirty(captureDirty || panelDirty);
    return () => onDirty(false);
  }, [captureDirty, panelDirty, onDirty]);
  const [today, setToday] = useState(() => localDateKey(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setToday(localDateKey(new Date())), 60000);
    return () => clearInterval(timer);
  }, []);
  const [insights, setInsights] = useState(() => {
    try {
      return window.localStorage.getItem("bito-task-panel-open") !== "false";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("bito-task-panel-open", String(insights));
    } catch {
      /* Panel interaction does not depend on storage. */
    }
  }, [insights]);
  const [sort, setSort] = useState<TaskSort>("date");
  const [panelBusy, setPanelBusy] = useState(false);
  const [pendingPanel, setPendingPanel] = useState<{
    next: TaskSelection | null;
    hide: boolean;
  } | null>(null);
  const lastTaskTrigger = useRef<HTMLElement | null>(null);
  const applyPanel = (next: TaskSelection | null, hide = false) => {
    setPendingPanel(null);
    setPanelDirty(false);
    setSelection(next);
    setInsights(!hide);
    if (hide) contextToggle.current?.focus({ preventScroll: true });
    else if (!next && lastTaskTrigger.current?.isConnected)
      lastTaskTrigger.current.focus({ preventScroll: true });
  };
  const requestPanel = (next: TaskSelection | null, hide = false) => {
    if (panelBusy || busy) return;
    if (
      next &&
      selection?.id === next.id &&
      selection.projectId === next.projectId
    )
      return;
    if (next && document.activeElement instanceof HTMLElement)
      lastTaskTrigger.current = document.activeElement;
    if (panelDirty) {
      setPendingPanel({ next, hide });
      return;
    }
    applyPanel(next, hide);
  };
  const openTask = (next: TaskSelection) => requestPanel(next);
  const contextOpen = insights || !!selection;
  const overview = workspaceOverview(state.projects, state.activeProjectId);
  const inventory = workspaceTaskInventory(state);
  // Persist immediately, then retain the row in its original group while the
  // confirmed checkmark and strike-through play. A failed save never shows done.
  const [pendingTasks, setPendingTasks] = useState<Record<string, PendingTask>>(
    {},
  );
  const taskLocks = useRef(new Set<string>());
  const taskTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      taskTimers.current.forEach(clearTimeout);
      taskTimers.current.clear();
    };
  }, []);
  const displayInventory = inventory.map(
    (task) => pendingTasks[taskKey(task)]?.task ?? task,
  );
  const focus =
    (overview.session || overview.entry?.continuing) &&
    overview.entry &&
    overview.focus
      ? { id: overview.entry.task.id, projectId: overview.focus.id }
      : null;
  const groups = workspaceTaskGroups(
    displayInventory,
    today,
    all,
    completed,
    all ? query : "",
    sort,
  );
  const rowCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
  useEffect(() => {
    setQuery("");
    setCompleted(false);
  }, [all]);
  const toggle = async (t: WorkspaceItem) => {
    const key = taskKey(t);
    if (taskLocks.current.has(key)) return;
    taskLocks.current.add(key);
    setError("");
    setPendingTasks((previous) => ({
      ...previous,
      [key]: { task: t, confirmed: false },
    }));
    const release = () => {
      taskLocks.current.delete(key);
      taskTimers.current.delete(key);
      if (mounted.current)
        setPendingTasks((previous) => {
          const next = { ...previous };
          delete next[key];
          return next;
        });
    };
    const p = state.projects.find((p) => p.id === t.projectId);
    const task = p?.plan?.milestones
      .flatMap((m) => m.tasks)
      .find((x) => x.id === t.id);
    try {
      const result = await act(
        p ? "project-task" : "task-toggle",
        p
          ? {
              id: p.id,
              taskId: t.id,
              expectedStatus: task?.status,
              status: t.done ? "todo" : "done",
            }
          : t.id,
      );
      if (!mounted.current) return;
      if (!result.ok) {
        release();
        setError(result.error || "Tugas belum diperbarui.");
        return;
      }
      if (reduced) {
        release();
        return;
      }
      setPendingTasks((previous) => ({
        ...previous,
        [key]: { task: t, confirmed: true },
      }));
      taskTimers.current.set(key, setTimeout(release, 440));
    } catch {
      release();
      if (mounted.current) setError("Tugas belum diperbarui. Coba lagi.");
    }
  };
  return (
    <div
      className="workspace-task-columns"
      data-insights={contextOpen}
      data-reduced-motion={!!reduced}
      data-detail={!!selection}
    >
      <div className="workspace-tasks">
        <header className="tasks-page-header">
          <div>
            <p className="workspace-day">
              {new Date().toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <h1>Tugas</h1>
          </div>
          <div className="tasks-header-tools">
            <TaskViewMenu
              sort={sort}
              completed={completed}
              onSort={setSort}
              onCompleted={setCompleted}
            />
            <BitoButton
              ref={contextToggle}
              className="insights-toggle"
              title={
                selection
                  ? "Tutup kolom kanan"
                  : insights
                    ? "Tutup ringkasan"
                    : "Buka ringkasan"
              }
              aria-label={
                selection
                  ? "Tutup kolom kanan"
                  : insights
                    ? "Tutup ringkasan"
                    : "Buka ringkasan"
              }
              aria-expanded={insights || !!selection}
              aria-controls="workspace-context-column"
              disabled={busy || panelBusy}
              onClick={() => requestPanel(null, insights || !!selection)}
            >
              <PanelRight size={18} />
            </BitoButton>
          </div>
        </header>
        {onViewChange && (
          <div
            className="task-scope-tabs"
            role="tablist"
            aria-label="Tampilan tugas"
            data-all={all}
            data-reduced-motion={!!reduced}
          >
            {[false, true].map((value) => (
              <BitoButton
                key={String(value)}
                type="button"
                role="tab"
                id={`${viewId}-${value ? "all" : "today"}`}
                aria-selected={all === value}
                aria-controls={`${viewId}-tasks`}
                tabIndex={all === value ? 0 : -1}
                disabled={busy || panelBusy}
                onClick={() => {
                  onViewChange(value);
                  setCompleted(false);
                }}
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
                      ? false
                      : event.key === "End"
                        ? true
                        : !all;
                  onViewChange(next);
                  setCompleted(false);
                  document
                    .getElementById(`${viewId}-${next ? "all" : "today"}`)
                    ?.focus();
                }}
              >
                {value ? "Semua" : "Hari ini"}
              </BitoButton>
            ))}
          </div>
        )}
        <div
          id={`${viewId}-tasks`}
          role={onViewChange ? "tabpanel" : undefined}
          aria-labelledby={
            onViewChange ? `${viewId}-${all ? "all" : "today"}` : undefined
          }
        >
          {!all && focus && (
            <section
              className="workspace-focus compact-focus"
              aria-label="Sesi yang belum selesai"
            >
              <BitoMascot />
              <div>
                <small>Lanjutkan yang tadi</small>
                <h3>{overview.entry?.objective}</h3>
                <p>
                  {overview.entry?.checkpoint?.lastStop
                    ? `Terakhir: ${overview.entry.checkpoint.lastStop}`
                    : overview.focus?.name}
                </p>
              </div>
              <BitoButton onClick={() => openTask(focus)}>
                <Play size={14} />
                Lanjutkan
              </BitoButton>
            </section>
          )}
          {all && (
            <div className="workspace-task-search">
              <Search size={16} />
              <BitoInput
                label="Cari tugas"
                placeholder="Cari tugas atau proyek…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          <BitoButton
            type="button"
            className="workspace-add task-add-top"
            aria-expanded={adding}
            disabled={busy || adding}
            onClick={() => {
              setCaptureDate(all ? null : today);
              setAdding(true);
            }}
          >
            <Plus size={18} />
            Tambah tugas
          </BitoButton>
          {adding && (
            <TaskComposer
              projects={state.projects}
              initialDueDate={captureDate}
              act={act}
              busy={busy}
              onDirty={setCaptureDirty}
              onSaved={() => {
                setAdding(false);
                setCompleted(false);
              }}
              onCancel={() => setAdding(false)}
            />
          )}
          {error && (
            <p role="alert" className="board-error">
              {error}
            </p>
          )}
          <div className="workspace-task-list">
            <AnimatePresence initial={false} key={all ? "all" : "today"}>
              {groups
                .filter(
                  (g) =>
                    g.rows.length || (!all && !completed && g.key === "today"),
                )
                .map((group) => (
                  <TaskListGroup
                    key={group.key}
                    groupKey={group.key}
                    title={group.title}
                    count={group.rows.length}
                    reduced={!!reduced}
                    defaultExpanded={all || group.key !== "overdue"}
                    reviewHint={!all && group.key === "overdue"}
                  >
                    {!group.rows.length && (
                      <div className="task-group-empty">
                        <p>Belum ada tugas untuk hari ini.</p>
                        {onViewChange && (
                          <BitoButton
                            className="task-pick-existing"
                            onClick={() => onViewChange(true)}
                          >
                            Pilih dari semua tugas
                          </BitoButton>
                        )}
                      </div>
                    )}
                    <AnimatePresence initial={false}>
                      {group.rows.map((t, index) => {
                        const pending = pendingTasks[taskKey(t)];
                        const visualDone = pending?.confirmed
                          ? !t.done
                          : t.done;
                        const p = state.projects.find(
                          (p) => p.id === t.projectId,
                        );
                        const session = p && openProjectSession(p);
                        return (
                          <TaskListRowMotion
                            key={taskKey(t)}
                            index={index}
                            reduced={!!reduced}
                          >
                            <div
                              data-checked={visualDone}
                              data-completing={!!pending?.confirmed}
                              aria-busy={!!pending && !pending.confirmed}
                              className={`workspace-task-row ${visualDone ? "is-done" : ""} ${selection?.id === t.id && selection?.projectId === t.projectId ? "is-selected" : ""}`}
                            >
                              <CheckboxInput
                                label={`${t.done ? "Buka kembali" : "Selesaikan"}: ${t.title}`}
                                isLabelHidden
                                size="sm"
                                value={visualDone}
                                isReadOnly={!!pending}
                                isDisabled={
                                  busy ||
                                  session?.taskId === t.id ||
                                  p?.status === "completed"
                                }
                                onChange={() => void toggle(t)}
                              />
                              <BitoButton
                                type="button"
                                className="workspace-task-open"
                                aria-pressed={
                                  selection?.id === t.id &&
                                  selection?.projectId === t.projectId
                                }
                                aria-controls="workspace-context-column"
                                onClick={() =>
                                  openTask({ id: t.id, projectId: t.projectId })
                                }
                              >
                                <span className="task-row-title">
                                  <span className="task-row-title-text">
                                    {t.title}
                                  </span>
                                </span>
                                <span className="task-row-meta">
                                  {t.date && (
                                    <time
                                      dateTime={t.date}
                                      aria-label={`${t.date < today && !t.done ? "Terlewat · " : ""}${t.date === today ? "Hari ini" : taskDateLabel(t.date)}`}
                                      className={
                                        t.date < today && !t.done
                                          ? "is-overdue"
                                          : ""
                                      }
                                    >
                                      <CalendarDays size={12} />
                                      {t.date === today
                                        ? "Hari ini"
                                        : taskDateLabel(t.date)}
                                    </time>
                                  )}
                                  <span>
                                    <List size={12} aria-hidden="true" />
                                    {t.projectId ? t.projectName : "Pribadi"}
                                  </span>
                                  {t.priority === 1 && !t.done && (
                                    <span className="task-important">
                                      <Flag size={12} />
                                      Penting
                                    </span>
                                  )}
                                  {t.blocked && !t.done && (
                                    <span className="task-blocked">
                                      <Ban size={12} />
                                      Terhambat
                                    </span>
                                  )}
                                  {session?.taskId === t.id && (
                                    <span className="task-running">
                                      <Play size={11} />
                                      Sesi terbuka
                                    </span>
                                  )}
                                </span>
                              </BitoButton>
                            </div>
                          </TaskListRowMotion>
                        );
                      })}
                    </AnimatePresence>
                  </TaskListGroup>
                ))}
            </AnimatePresence>
          </div>
          {!rowCount && (all || completed) && (
            <p className="workspace-empty">
              {query
                ? "Tidak ada tugas yang cocok."
                : completed
                  ? "Belum ada tugas selesai."
                  : "Belum ada tugas. Mulai dari satu hal kecil."}
            </p>
          )}
          {!inventory.length && (
            <BitoButton
              className="tasks-create-project"
              disabled={busy}
              onClick={onCreate}
            >
              Atau buat proyek
            </BitoButton>
          )}
          {!all && !focus && overview.review && (
            <BitoButton
              className="tasks-create-project"
              onClick={() => onProject(overview.review!)}
            >
              Tinjau proyek {overview.review.name}
            </BitoButton>
          )}
        </div>
      </div>
      <div
        className="workspace-context-slot"
        inert={!contextOpen}
        aria-hidden={!contextOpen}
      >
        <AnimatePresence initial={false}>
          {contextOpen && (
            <motion.div
              key="context-column"
              className="workspace-context-column"
              id="workspace-context-column"
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
                      disabled={panelBusy || busy}
                      onClick={() =>
                        applyPanel(pendingPanel.next, pendingPanel.hide)
                      }
                    >
                      Abaikan perubahan
                    </BitoButton>
                  </div>
                </div>
              )}
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  className="workspace-context-content"
                  key={
                    selection
                      ? `${selection.projectId}-${selection.id}`
                      : "insights"
                  }
                  initial={{ opacity: 0, x: reduced ? 0 : 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: reduced ? 0 : -4 }}
                  transition={{
                    duration: reduced ? 0 : 0.14,
                    ease: "easeOut",
                  }}
                >
                  {selection ? (
                    <WorkspaceTaskPanel
                      embedded
                      selection={selection}
                      state={state}
                      act={act}
                      busy={busy}
                      onDirty={setPanelDirty}
                      onBusy={setPanelBusy}
                      onClose={() => applyPanel(null)}
                    />
                  ) : (
                    <WorkspaceInsights
                      reduced={!!reduced}
                      items={inventory}
                      today={today}
                      projects={state.projects}
                      onProject={onProject}
                      onAllProjects={onAllProjects}
                      busy={busy || panelBusy}
                      onSelect={openTask}
                      onClose={() => requestPanel(null, true)}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
