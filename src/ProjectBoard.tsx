import { BitoDateInput } from "./ui/controls";
import { BitoButton, BitoInput } from "./ui/controls";
import { Popover } from "@astryxdesign/core/Popover";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ChevronRight,
  ArrowLeft,
  PanelRight,
  Ban,
  Plus,
  Paperclip,
  MoreHorizontal,
  Check,
  Clock3,
  CalendarDays,
  Flag,
} from "lucide-react";
import type { Project, ProjectTask } from "./projects";
import { projectProgress } from "./projects";
import type { Reply, Snapshot } from "./shared";
import { openProjectSession } from "./project-work";
import { localDateKey } from "./project-board";
import { WorkspaceInsights } from "./WorkspaceInsights";
import { TaskListGroup, TaskListRowMotion } from "./WorkspaceTaskListMotion";
import { TaskComposer } from "./TaskComposer";
import { WorkspaceTaskPanel } from "./WorkspaceTaskPanel";
import { WorkspaceDialog } from "./WorkspaceDialog";

type Act = (name: string, payload?: unknown) => Promise<Reply>;
type Modal =
  | { kind: "task"; id: string }
  | { kind: "milestone"; id: string }
  | { kind: "new-group" }
  | null;
const shortDate = (value: string | null) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      })
    : "—";

export function ProjectBoard({
  project,
  state,
  act,
  busy,
  onDetails,
  onMaterials,
  onWork,
  onSetup,
  onDirty,
  onBack,
  banner,
}: {
  onBack?: () => void;
  banner?: ReactNode;
  project: Project;
  state: Snapshot;
  act: Act;
  busy: boolean;
  onDetails: () => void;
  onMaterials: () => void;
  onWork: () => void;
  onSetup: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const reduced = useReducedMotion() || state.settings.reducedMotion;
  const today = localDateKey(new Date());
  const [contextOpen, setContextOpen] = useState(true);
  const [panelBusy, setPanelBusy] = useState(false);
  const [pendingPanel, setPendingPanel] = useState<{
    id: string | null;
    open: boolean;
  } | null>(null);
  const contextToggle = useRef<HTMLButtonElement>(null);
  const [pendingTasks, setPendingTasks] = useState<
    Record<string, { task: ProjectTask; confirmed: boolean }>
  >({});
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
  const [showCompleted, setShowCompleted] = useState(
    project.status === "archived" || project.status === "completed",
  );
  const [sessionDirty, setSessionDirty] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addingGroup, setAddingGroup] = useState<string | null>(null);
  const [captureDirty, setCaptureDirty] = useState(false);
  const [targetDate, setTargetDate] = useState("");
  const [initialDate, setInitialDate] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [initialTitle, setInitialTitle] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const [editVersion, setEditVersion] = useState(project.version);
  useEffect(() => {
    setModal(null);
    setAddingGroup(null);
    setShowCompleted(
      project.status === "archived" || project.status === "completed",
    );
    setError("");
  }, [project.id]);
  const counts = projectProgress(project);
  const progress = {
    ...counts,
    percent: counts.total ? Math.round((counts.done / counts.total) * 100) : 0,
  };
  const milestones = project.plan?.milestones || [];
  const session = openProjectSession(project);
  const editable = !["archived", "completed"].includes(project.status);
  const locked = busy || submitting || panelBusy;
  const task =
    modal?.kind === "task"
      ? milestones.flatMap((m) => m.tasks).find((t) => t.id === modal.id)
      : undefined;
  const milestone =
    modal?.kind === "milestone"
      ? milestones.find((m) => m.id === modal.id)
      : undefined;
  useEffect(() => {
    if (
      (modal?.kind === "task" && !task) ||
      (modal?.kind === "milestone" && !milestone)
    ) {
      setModal(null);
      setDiscarding(false);
      setError(
        "Rencana sudah berubah. Pilih langkah atau milestone yang terbaru.",
      );
    }
  }, [modal, task, milestone]);
  const formDirty =
    (modal?.kind === "milestone" || modal?.kind === "new-group") &&
    (targetDate !== initialDate || groupTitle !== initialTitle);
  useEffect(() => {
    onDirty(!!formDirty || sessionDirty || captureDirty);
    return () => onDirty(false);
  }, [formDirty, sessionDirty, captureDirty, onDirty]);
  const closeModal = () => {
    if (submitting) return;
    if (formDirty) setDiscarding(true);
    else setModal(null);
  };
  const request: Act = async (name, payload) => {
    setError("");
    setSubmitting(true);
    try {
      const result = await act(name, payload);
      if (!result.ok) setError(result.error || "Belum tersimpan. Coba lagi.");
      return result;
    } catch {
      setError("Belum tersimpan. Coba lagi.");
      return { ok: false };
    } finally {
      setSubmitting(false);
    }
  };
  const applyPanel = (id: string | null, open = true) => {
    setPendingPanel(null);
    setSessionDirty(false);
    setModal(id ? { kind: "task", id } : null);
    setContextOpen(open);
    if (!open) contextToggle.current?.focus({ preventScroll: true });
  };
  const requestPanel = (id: string | null, open = true) => {
    if (locked || (id && modal?.kind === "task" && modal.id === id)) return;
    if (sessionDirty) setPendingPanel({ id, open });
    else applyPanel(id, open);
  };
  const toggle = async (id: string) => {
    const t = milestones.flatMap((m) => m.tasks).find((t) => t.id === id);
    if (!t || taskLocks.current.has(id) || locked || !editable) return;
    taskLocks.current.add(id);
    setPendingTasks((prev) => ({
      ...prev,
      [id]: { task: t, confirmed: false },
    }));
    const release = () => {
      taskLocks.current.delete(id);
      taskTimers.current.delete(id);
      if (mounted.current)
        setPendingTasks((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
    };
    const result = await request("project-task", {
      id: project.id,
      taskId: id,
      expectedStatus: t.status,
      status: t.status === "done" ? "todo" : "done",
    });
    if (!mounted.current) return;
    if (!result.ok || reduced) {
      release();
      return;
    }
    setPendingTasks((prev) => ({
      ...prev,
      [id]: { task: t, confirmed: true },
    }));
    taskTimers.current.set(id, setTimeout(release, 440));
  };
  const openMilestone = (id: string) => {
    setError("");
    setGroupTitle(milestones.find((m) => m.id === id)?.title || "");
    setInitialTitle(milestones.find((m) => m.id === id)?.title || "");
    setTargetDate(milestones.find((m) => m.id === id)?.targetDate || "");
    setInitialDate(milestones.find((m) => m.id === id)?.targetDate || "");
    setEditVersion(project.version);
    setModal({ kind: "milestone", id });
  };
  const newGroup = () => {
    setError("");
    setGroupTitle("");
    setInitialTitle("");
    setTargetDate("");
    setInitialDate("");
    setEditVersion(project.version);
    setModal({ kind: "new-group" });
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const result = await request(
      modal?.kind === "new-group" ? "project-group-add" : "project-group-edit",
      {
        id: project.id,
        version: editVersion,
        planId: project.plan?.id ?? null,
        milestoneId: milestone?.id,
        title: groupTitle.trim(),
        targetDate: targetDate || null,
      },
    );
    if (result.ok) setModal(null);
  };
  const [menu, setMenu] = useState(false);

  return (
    <div
      className="workspace-task-columns workspace-project-columns"
      data-insights={contextOpen}
      data-reduced-motion={!!reduced}
    >
      <div className="workspace-tasks project-task-canvas">
        <header className="tasks-page-header">
          <div>
            <p className="workspace-day">
              {project.status === "archived" ? "Arsip proyek" : "Proyek"}
            </p>
            <h1>{project.name}</h1>
          </div>
          <div className="tasks-header-tools">
            {onBack && (
              <BitoButton
                aria-label="Kembali ke semua proyek"
                title="Kembali"
                onClick={onBack}
              >
                <ArrowLeft size={18} />
              </BitoButton>
            )}
            <BitoButton
              ref={contextToggle}
              className="insights-toggle"
              aria-label={contextOpen ? "Tutup kolom kanan" : "Buka ringkasan"}
              aria-expanded={contextOpen}
              aria-controls="project-context-column"
              disabled={locked}
              onClick={() => requestPanel(null, !contextOpen)}
            >
              <PanelRight size={18} />
            </BitoButton>
          </div>
        </header>
        {banner}
        <div className="board-view-toolbar">
          <h2 className="board-list-heading">Tugas proyek</h2>
          <div className="board-view-actions">
            {editable && (
              <BitoButton
                disabled={
                  locked ||
                  sessionDirty ||
                  captureDirty ||
                  !!project.draft ||
                  milestones.length >= 8
                }
                onClick={newGroup}
              >
                <Plus size={15} />
                Tambah kelompok
              </BitoButton>
            )}
            <BitoButton onClick={onMaterials}>
              <Paperclip size={15} /> Bahan
              {project.materials.length ? ` (${project.materials.length})` : ""}
            </BitoButton>{" "}
            <Popover
              label="Pilihan proyek"
              isOpen={menu}
              onOpenChange={setMenu}
              placement="below"
              alignment="end"
              width={210}
              content={
                <div className="board-project-menu">
                  <BitoButton
                    onClick={() => {
                      setMenu(false);
                      onDetails();
                    }}
                  >
                    Detail proyek
                  </BitoButton>
                  <BitoButton
                    disabled={!editable}
                    onClick={() => {
                      setMenu(false);
                      onSetup();
                    }}
                  >
                    Edit rencana
                  </BitoButton>
                </div>
              }
            >
              <BitoButton
                type="button"
                className="board-icon"
                aria-label="Pilihan proyek"
                aria-expanded={menu}
              >
                <MoreHorizontal size={17} />
              </BitoButton>
            </Popover>
          </div>
        </div>
        <div className="board-project-summary">
          <span>
            {progress.done} dari {progress.total} tugas selesai
          </span>
          {project.deadline && (
            <span>
              <CalendarDays size={13} /> Tenggat {shortDate(project.deadline)}
            </span>
          )}
        </div>
        <div className="board-main-column">
          {session && (
            <BitoButton
              className="board-open-session"
              onClick={() => requestPanel(session.taskId)}
            >
              <Clock3 size={15} />{" "}
              {session.phase === "running" ? "Sesi berjalan" : "Lanjutkan sesi"}
              : {session.taskTitle}
            </BitoButton>
          )}
          {error && !modal && (
            <p className="board-error" role="alert">
              {error}
            </p>
          )}
          <div className="board-task-groups">
            {progress.total > 0 &&
              progress.done === progress.total &&
              !showCompleted && (
                <div className="board-all-done">
                  <Check size={24} />
                  <h2>Semua tugas selesai.</h2>
                  <p>
                    Kerja bagus. Kamu bisa melihat kembali tugasmu kapan saja.
                  </p>
                </div>
              )}
            {!project.plan ? (
              <div className="board-empty-setup">
                <h2>Mulai dari satu tugas.</h2>
                {editable &&
                  (addingGroup === "new" ? (
                    <TaskComposer
                      key={project.id}
                      projects={[project]}
                      initialProjectId={project.id}
                      act={act}
                      busy={busy}
                      inline
                      onDirty={setCaptureDirty}
                      onSaved={() => {
                        setCaptureDirty(false);
                        setAddingGroup(null);
                      }}
                      onCancel={() => setAddingGroup(null)}
                    />
                  ) : (
                    <BitoButton
                      className="board-add-step"
                      onClick={() => setAddingGroup("new")}
                    >
                      <Plus size={16} />
                      Tambah tugas pertama
                    </BitoButton>
                  ))}
                <BitoButton
                  onClick={onSetup}
                  disabled={locked || captureDirty || !editable}
                >
                  Bantu susun langkah bersama Bito <ChevronRight size={15} />
                </BitoButton>
              </div>
            ) : (
              milestones
                .filter(
                  (m) =>
                    showCompleted ||
                    editable ||
                    m.tasks.some((t) => t.status !== "done"),
                )
                .map((m) => (
                  <TaskListGroup
                    key={m.id}
                    groupKey={m.id}
                    title={m.title}
                    count={
                      m.tasks.filter(
                        (t) => showCompleted || t.status !== "done",
                      ).length
                    }
                    reduced={!!reduced}
                    disabled={addingGroup === m.id}
                    headerAction={
                      <BitoButton
                        className="board-icon group-settings"
                        aria-label={`Pengaturan kelompok ${m.title}`}
                        disabled={
                          locked || !editable || sessionDirty || captureDirty
                        }
                        onClick={() => openMilestone(m.id)}
                      >
                        <MoreHorizontal size={16} />
                      </BitoButton>
                    }
                  >
                    <AnimatePresence initial={false}>
                      {m.tasks
                        .map((t) => pendingTasks[t.id]?.task ?? t)
                        .filter((t) => showCompleted || t.status !== "done")
                        .map((t, index) => {
                          const pending = pendingTasks[t.id];
                          const done = pending?.confirmed
                            ? t.status !== "done"
                            : t.status === "done";
                          const date =
                            t.dueDate === undefined ? m.targetDate : t.dueDate;
                          return (
                            <TaskListRowMotion
                              key={t.id}
                              index={index}
                              reduced={!!reduced}
                            >
                              <div
                                className={`workspace-task-row board-task-row ${done ? "is-done" : ""} ${modal?.kind === "task" && modal.id === t.id ? "is-selected" : ""}`}
                                data-checked={done}
                                data-completing={!!pending?.confirmed}
                                aria-busy={!!pending && !pending.confirmed}
                              >
                                <CheckboxInput
                                  size="sm"
                                  value={done}
                                  label={`${t.status === "done" ? "Buka kembali" : "Selesaikan"}: ${t.title}`}
                                  isLabelHidden
                                  isReadOnly={!!pending}
                                  isDisabled={
                                    locked ||
                                    !editable ||
                                    session?.taskId === t.id
                                  }
                                  onChange={() => void toggle(t.id)}
                                />
                                <BitoButton
                                  type="button"
                                  className="workspace-task-open board-task-title"
                                  aria-pressed={
                                    modal?.kind === "task" && modal.id === t.id
                                  }
                                  aria-controls="project-context-column"
                                  onClick={() => requestPanel(t.id)}
                                >
                                  <span className="task-row-title">
                                    <span className="task-row-title-text">
                                      {t.title}
                                    </span>
                                  </span>
                                  <span className="task-row-meta">
                                    {date && (
                                      <time
                                        dateTime={date}
                                        className={
                                          date < today && !done && editable
                                            ? "is-overdue"
                                            : ""
                                        }
                                      >
                                        <CalendarDays size={12} />
                                        {date === today
                                          ? "Hari ini"
                                          : shortDate(date)}
                                      </time>
                                    )}
                                    {t.priority === 1 && !done && (
                                      <span className="task-important">
                                        <Flag size={12} />
                                        Penting
                                      </span>
                                    )}
                                    {t.status === "blocked" && (
                                      <span className="task-blocked">
                                        <Ban size={12} />
                                        Terhambat
                                      </span>
                                    )}
                                    {session?.taskId === t.id && (
                                      <span className="task-running">
                                        <Clock3 size={12} />
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
                    {addingGroup === m.id ? (
                      <TaskComposer
                        projects={[project]}
                        initialProjectId={project.id}
                        initialMilestoneId={m.id}
                        act={act}
                        busy={busy}
                        inline
                        onDirty={setCaptureDirty}
                        onSaved={() => {
                          setAddingGroup(null);
                          setError("");
                        }}
                        onCancel={() => {
                          setAddingGroup(null);
                          setError("");
                        }}
                      />
                    ) : (
                      editable && (
                        <BitoButton
                          className="board-add-step"
                          aria-label={`Tambah tugas ke ${m.title}`}
                          disabled={
                            locked ||
                            addingGroup !== null ||
                            progress.total >= 40 ||
                            m.tasks.length >= 12
                          }
                          onClick={() => setAddingGroup(m.id)}
                        >
                          <Plus size={16} />
                          Tambah tugas
                        </BitoButton>
                      )
                    )}
                  </TaskListGroup>
                ))
            )}
            {progress.done > 0 && (
              <BitoButton
                className="completed-toggle"
                aria-pressed={showCompleted}
                onClick={() => setShowCompleted((v) => !v)}
              >
                {showCompleted ? "Sembunyikan" : "Tampilkan"} {progress.done}{" "}
                tugas selesai
              </BitoButton>
            )}
            {editable && milestones.length >= 8 && (
              <p className="project-hint">Maksimal 8 kelompok per proyek.</p>
            )}
          </div>
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
              className="workspace-context-column"
              id="project-context-column"
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
                      disabled={locked}
                      onClick={() =>
                        applyPanel(pendingPanel.id, pendingPanel.open)
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
                  key={modal?.kind === "task" ? modal.id : "summary"}
                  initial={{ opacity: 0, x: reduced ? 0 : 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: reduced ? 0 : -4 }}
                  transition={{ duration: reduced ? 0 : 0.14, ease: "easeOut" }}
                >
                  {modal?.kind === "task" ? (
                    <WorkspaceTaskPanel
                      embedded
                      selection={{ id: modal.id, projectId: project.id }}
                      state={state}
                      act={act}
                      busy={busy}
                      onDirty={setSessionDirty}
                      onBusy={setPanelBusy}
                      onClose={() => applyPanel(null)}
                    />
                  ) : (
                    <section aria-label="Progres proyek">
                      <WorkspaceInsights
                        items={milestones.flatMap((m) =>
                          m.tasks.map((t) => ({
                            id: t.id,
                            title: t.title,
                            date:
                              t.dueDate === undefined
                                ? m.targetDate
                                : t.dueDate,
                            done: t.status === "done",
                            blocked: t.status === "blocked",
                            priority: t.priority ?? 4,
                            projectId: project.id,
                            projectName: project.name,
                          })),
                        )}
                        today={today}
                        projects={[project]}
                        scope={project.name}
                        showProjects={false}
                        showCondition={project.status !== "archived"}
                        reduced={!!reduced}
                        onSelect={(selection) => requestPanel(selection.id)}
                        onClose={() => requestPanel(null, false)}
                        onProject={onDetails}
                        onAllProjects={onBack || onDetails}
                        busy={locked}
                      />
                    </section>
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {modal && modal.kind !== "task" && (
          <WorkspaceDialog
            key={modal.kind + ("id" in modal ? modal.id : "")}
            title={
              task
                ? "Detail langkah"
                : milestone
                  ? "Edit kelompok"
                  : "Tambah kelompok"
            }
            reduced={state.settings.reducedMotion}
            onClose={closeModal}
          >
            {error && (
              <p role="alert" className="board-error">
                {error}
              </p>
            )}
            <form className="project-form" onSubmit={save}>
              <div className="bito-form-field">
                Nama kelompok
                <BitoInput
                  label="Nama kelompok"
                  placeholder="Misalnya, Penyusunan Esai Komparatif"
                  value={groupTitle}
                  maxLength={200}
                  autoFocus
                  disabled={locked || !editable}
                  onChange={(e) => setGroupTitle(e.target.value)}
                />
              </div>
              <div className="bito-form-field">
                Tanggal kelompok
                <BitoDateInput
                  label="Tanggal target"
                  value={targetDate}
                  max={project.deadline || undefined}
                  disabled={locked || !editable}
                  onValueChange={(e) => setTargetDate(e ?? "")}
                />
              </div>
              <p className="project-hint">
                Tugas yang punya tanggal sendiri tidak ikut berubah.
              </p>
              <div className="project-form-actions">
                <BitoButton
                  className="project-primary"
                  disabled={locked || !editable || !groupTitle.trim()}
                >
                  {submitting
                    ? "Menyimpan…"
                    : modal?.kind === "new-group"
                      ? "Tambah kelompok"
                      : "Simpan"}
                </BitoButton>
                <BitoButton
                  className="project-link"
                  type="button"
                  disabled={submitting}
                  onClick={closeModal}
                >
                  Batal
                </BitoButton>
              </div>
            </form>
          </WorkspaceDialog>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {discarding && (
          <WorkspaceDialog
            title="Abaikan perubahan?"
            reduced={state.settings.reducedMotion}
            onClose={() => setDiscarding(false)}
          >
            <div className="project-form-actions">
              <BitoButton
                className="project-primary"
                onClick={() => setDiscarding(false)}
              >
                Lanjut edit
              </BitoButton>
              <BitoButton
                className="project-link"
                onClick={() => {
                  setDiscarding(false);
                  setModal(null);
                }}
              >
                Abaikan
              </BitoButton>
            </div>
          </WorkspaceDialog>
        )}
      </AnimatePresence>
    </div>
  );
}
