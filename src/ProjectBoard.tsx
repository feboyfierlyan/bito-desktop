import { BitoDateInput } from "./ui/controls";
import { BitoButton, BitoInput } from "./ui/controls";
import { Popover } from "@astryxdesign/core/Popover";
import { Card } from "@astryxdesign/core/Card";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Diamond,
  Paperclip,
  MoreHorizontal,
  Play,
  Check,
  Clock3,
  CalendarDays,
  Search,
  FolderOpen,
  Flag,
} from "lucide-react";
import type { Project } from "./projects";
import { projectProgress } from "./projects";
import type { Reply, Snapshot } from "./shared";
import { openProjectSession } from "./project-work";
import {
  calendarWeek,
  localDateKey,
  progressSeries,
  projectCalendarItems,
} from "./project-board";
import { ProjectCalendar } from "./ProjectCalendar";
import { ProjectSessionBar } from "./ProjectSessionBar";
import { TaskComposer, TaskDatePicker } from "./TaskComposer";
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

export function ProjectGallery({
  projects,
  onOpen,
  busy,
  archives,
}: {
  projects: Project[];
  onOpen: (p: Project) => void;
  busy: boolean;
  archives: boolean;
}) {
  const [query, setQuery] = useState("");
  const visible = projects.filter(
    (p) =>
      (archives ? p.status === "archived" : p.status !== "archived") &&
      p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="board-gallery">
      <div className="gallery-toolbar">
        <div className="gallery-search">
          <Search size={16} />
          <BitoInput
            label="Cari proyek"
            placeholder="Cari proyek…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span>{visible.length} proyek</span>
      </div>
      {visible.map((p) => {
        const counts = projectProgress(p);
        const progress = {
          ...counts,
          percent: counts.total
            ? Math.round((counts.done / counts.total) * 100)
            : 0,
        };
        return (
          <BitoButton
            className="board-project-card"
            key={p.id}
            disabled={busy}
            onClick={() => onOpen(p)}
          >
            <FolderOpen className="project-list-icon" size={19} />
            <div className="board-project-caption">
              <strong>{p.name}</strong>
              <span>
                {archives
                  ? "Buka dari arsip"
                  : p.status === "completed"
                    ? "Selesai"
                    : progress.total
                      ? `${progress.done}/${progress.total} selesai`
                      : "Belum ada rencana"}
                {p.deadline && ` · ${shortDate(p.deadline)}`}
              </span>
              {progress.total > 0 && (
                <ProgressBar
                  className="bito-gallery-progress"
                  label={`Progres ${p.name}`}
                  value={progress.percent}
                  isLabelHidden
                />
              )}
            </div>
            <ChevronRight className="project-list-chevron" size={16} />
          </BitoButton>
        );
      })}
      {!visible.length && (
        <EmptyState
          className="bito-empty-state"
          title={
            query
              ? "Proyek tidak ditemukan"
              : archives
                ? "Belum ada proyek di arsip"
                : "Belum ada proyek"
          }
          description={
            query
              ? "Coba kata lain atau hapus pencarian."
              : archives
                ? "Proyek yang diarsipkan tetap bisa dilihat dan dipulihkan."
                : "Pilih Tambah proyek di sidebar untuk mulai."
          }
          icon={<FolderOpen size={24} />}
          isCompact
        />
      )}
    </div>
  );
}

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
}: {
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
  const [showCompleted, setShowCompleted] = useState(false);
  const [sessionDirty, setSessionDirty] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [anchor, setAnchor] = useState(() => new Date());
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addingGroup, setAddingGroup] = useState<string | null>(null);
  const [captureDirty, setCaptureDirty] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [targetDate, setTargetDate] = useState("");
  const [initialDate, setInitialDate] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [initialTitle, setInitialTitle] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const [editVersion, setEditVersion] = useState(project.version);
  useEffect(() => {
    setModal(null);
    setAddingGroup(null);
    setCollapsed([]);
    setShowCompleted(false);
    setCalendarOpen(false);
    setError("");
    setAnchor(new Date());
  }, [project.id]);
  const counts = projectProgress(project);
  const progress = {
    ...counts,
    percent: counts.total ? Math.round((counts.done / counts.total) * 100) : 0,
  };
  const milestones = project.plan?.milestones || [];
  const session = openProjectSession(project);
  const editable = !["archived", "completed"].includes(project.status);
  const locked = busy || submitting;
  const week = calendarWeek(anchor);
  const today = localDateKey(new Date());
  const events = projectCalendarItems(project);
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
  const toggle = (id: string) => {
    const t = milestones.flatMap((m) => m.tasks).find((t) => t.id === id);
    if (t)
      void request("project-task", {
        id: project.id,
        taskId: id,
        expectedStatus: t.status,
        status: t.status === "done" ? "todo" : "done",
      });
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
    <div className="project-board-layout">
      <div className="board-view-toolbar">
        <h2 className="board-list-heading">Tugas proyek</h2>
        <div className="board-view-actions">
          {editable && (
            <BitoButton
              disabled={
                locked ||
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
        <ProjectSessionBar
          key={project.id}
          project={project}
          projects={state.projects}
          act={act}
          busy={locked}
          onDirty={setSessionDirty}
          reduced={state.settings.reducedMotion}
        />
        {error && !modal && (
          <p className="board-error" role="alert">
            {error}
          </p>
        )}
        <div className="board-task-groups">
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
              <h2>Susun langkahnya bareng Bito.</h2>
              <BitoButton
                className="project-primary"
                onClick={onSetup}
                disabled={locked}
              >
                Lanjutkan <ChevronRight size={15} />
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
                <section
                  className="board-task-group"
                  key={m.id}
                  aria-label={m.title}
                >
                  <header>
                    <BitoButton
                      disabled={addingGroup === m.id}
                      aria-expanded={!collapsed.includes(m.id)}
                      onClick={() =>
                        setCollapsed((ids) =>
                          ids.includes(m.id)
                            ? ids.filter((id) => id !== m.id)
                            : [...ids, m.id],
                        )
                      }
                    >
                      <ChevronRight
                        size={14}
                        className={
                          collapsed.includes(m.id) ? "" : "section-expanded"
                        }
                      />
                      {m.title}
                      <small title="Tugas belum selesai">
                        {m.tasks.filter((t) => t.status !== "done").length}
                      </small>
                    </BitoButton>
                    <BitoButton
                      className="board-icon"
                      aria-label={`Pengaturan kelompok ${m.title}`}
                      onClick={() => openMilestone(m.id)}
                    >
                      <MoreHorizontal size={16} />
                    </BitoButton>
                  </header>
                  {!collapsed.includes(m.id) && (
                    <>
                      {m.tasks
                        .filter((t) => showCompleted || t.status !== "done")
                        .map((t) => (
                          <div
                            className={`board-task-row ${t.status === "done" ? "is-done" : ""}`}
                            data-priority={t.priority ?? 4}
                            key={t.id}
                          >
                            <CheckboxInput
                              className="bito-task-checkbox"
                              size="sm"
                              value={t.status === "done"}
                              label={`${t.status === "done" ? "Buka kembali" : "Selesaikan"}: ${t.title}`}
                              isLabelHidden
                              isDisabled={
                                locked || !editable || session?.taskId === t.id
                              }
                              onChange={() => toggle(t.id)}
                            />
                            <div className="board-task-content">
                              <BitoButton
                                className="board-task-title"
                                onClick={() => {
                                  setError("");
                                  setModal({ kind: "task", id: t.id });
                                }}
                              >
                                <span>{t.title}</span>
                                {t.status === "blocked" && (
                                  <i
                                    className="task-blocked-dot"
                                    aria-label="Terhambat"
                                  />
                                )}
                                {session?.taskId === t.id && (
                                  <Clock3 size={13} aria-label="Sesi terbuka" />
                                )}
                              </BitoButton>
                              {t.details && (
                                <p className="task-row-description">
                                  {t.details}
                                </p>
                              )}
                              <div className="task-row-metadata">
                                <TaskDatePicker
                                  value={
                                    t.dueDate === undefined
                                      ? m.targetDate
                                      : t.dueDate
                                  }
                                  completed={t.status === "done"}
                                  inherited={t.dueDate === undefined}
                                  max={project.deadline}
                                  disabled={locked || !editable}
                                  label={`Tanggal tugas ${t.title}`}
                                  onChange={(date) =>
                                    void request("project-task-date", {
                                      id: project.id,
                                      taskId: t.id,
                                      version: project.version,
                                      dueDate: date,
                                    })
                                  }
                                />
                                {t.priority && t.priority < 4 && (
                                  <span
                                    className="task-priority"
                                    data-priority={t.priority}
                                  >
                                    <Flag size={12} />P{t.priority}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
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
                    </>
                  )}
                </section>
              ))
          )}
          {editable && milestones.length >= 8 && (
            <p className="project-hint">Maksimal 8 kelompok per proyek.</p>
          )}
        </div>
      </div>
      <aside className="board-insights" aria-label="Ringkasan proyek">
        <Card
          className="board-side-calendar"
          padding={0}
          aria-label="Kalender proyek"
        >
          <header>
            <h2>Kalender</h2>
            <BitoButton
              className="calendar-today"
              onClick={() => setAnchor(new Date())}
            >
              Hari ini
            </BitoButton>
          </header>
          <div className="side-calendar-navigation">
            <strong>
              {week[0].date.toLocaleDateString("id-ID", {
                month: "long",
                year: "numeric",
              })}
            </strong>
            <BitoButton
              className="board-icon"
              aria-label="Minggu sebelumnya"
              onClick={() =>
                setAnchor(
                  (d) =>
                    new Date(
                      d.getFullYear(),
                      d.getMonth(),
                      d.getDate() - 7,
                      12,
                    ),
                )
              }
            >
              <ChevronLeft size={16} />
            </BitoButton>
            <BitoButton
              className="board-icon"
              aria-label="Minggu berikutnya"
              onClick={() =>
                setAnchor(
                  (d) =>
                    new Date(
                      d.getFullYear(),
                      d.getMonth(),
                      d.getDate() + 7,
                      12,
                    ),
                )
              }
            >
              <ChevronRight size={16} />
            </BitoButton>
          </div>
          <div className="side-calendar-week">
            {week.map((day) => (
              <div key={day.key} data-today={day.key === today}>
                <small>
                  {day.date.toLocaleDateString("id-ID", { weekday: "short" })}
                </small>
                <strong>{day.date.getDate()}</strong>
                <i
                  data-event={events.some((event) => event.date === day.key)}
                />
              </div>
            ))}
          </div>
          <div className="side-calendar-agenda">
            {events
              .filter((event) => week.some((day) => day.key === event.date))
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((event) => (
                <BitoButton
                  key={event.id}
                  className={`side-calendar-event ${event.done ? "is-done" : ""}`}
                  onClick={() =>
                    event.kind === "deadline"
                      ? onDetails()
                      : event.kind === "task"
                        ? setModal({ kind: "task", id: event.id })
                        : openMilestone(event.id)
                  }
                >
                  <time>{shortDate(event.date)}</time>
                  <span>{event.title}</span>
                  {event.done && <Check size={12} />}
                </BitoButton>
              ))}
          </div>
          {!events.some((event) =>
            week.some((day) => day.key === event.date),
          ) && <p className="board-empty">Tidak ada target minggu ini.</p>}
          <BitoButton
            className="side-calendar-connect"
            disabled={locked || !editable}
            onClick={() => setCalendarOpen(true)}
          >
            <CalendarDays size={14} />
            Google Calendar
          </BitoButton>
        </Card>
        <ProgressChart project={project} />
      </aside>
      <AnimatePresence>
        {calendarOpen && (
          <ProjectCalendar
            key={project.id}
            project={project}
            connection={state.calendar}
            act={act}
            onClose={() => setCalendarOpen(false)}
            reduced={state.settings.reducedMotion}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {modal && (
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
            {task ? (
              <div className="board-task-detail">
                <h3>{task.title}</h3>
                {task.details && <p>{task.details}</p>}
                {task.doneWhen && (
                  <p className="board-done-when">
                    <Check size={15} />
                    {task.doneWhen}
                  </p>
                )}
                <span className="board-task-estimate">
                  {task.estimateMin === task.estimateMax
                    ? task.estimateMin
                    : `${task.estimateMin}–${task.estimateMax}`}{" "}
                  menit
                </span>
                <div className="project-form-actions">
                  <BitoButton
                    className="project-primary"
                    disabled={locked || !editable || task.status === "done"}
                    onClick={async () => {
                      if (session) {
                        setModal(null);
                        onWork();
                        return;
                      }
                      const r = await request("project-assist", {
                        intent: "start",
                        begin: true,
                        id: project.id,
                        taskId: task.id,
                        minutes: null,
                      });
                      if (r.ok) setModal(null);
                    }}
                  >
                    <Play size={15} />
                    {session ? "Lanjutkan sesi" : "Mulai sesi"}
                  </BitoButton>
                  <BitoButton
                    className="project-secondary"
                    disabled={
                      locked || !editable || session?.taskId === task.id
                    }
                    onClick={() => toggle(task.id)}
                  >
                    {task.status === "done" ? "Buka kembali" : "Tandai selesai"}
                  </BitoButton>
                  <BitoButton
                    className="project-link"
                    disabled={locked || !editable || task.status === "done"}
                    onClick={async () => {
                      const r = await request("project-assist", {
                        id: project.id,
                        taskId: task.id,
                        intent: "blocked",
                      });
                      if (r.ok) setModal(null);
                    }}
                  >
                    Bantu bagian ini
                  </BitoButton>
                </div>
              </div>
            ) : (
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
            )}
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

function ProgressChart({ project }: { project: Project }) {
  const counts = projectProgress(project);
  const progress = {
    ...counts,
    percent: counts.total ? Math.round((counts.done / counts.total) * 100) : 0,
  };
  const history = progressSeries(project);
  const first = history[0]?.at || project.createdAt;
  const last = history.at(-1)?.at || first;
  const point = (row: (typeof history)[number]) => [
    history.length === 1
      ? 150
      : 12 + ((row.at - first) / Math.max(1, last - first)) * 276,
    110 - row.percent * 0.9,
  ];
  const path = history
    .map((row, i) => `${i ? "L" : "M"}${point(row).join(",")}`)
    .join(" ");
  const date = (at: number) =>
    new Date(at).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    });
  return (
    <Card
      className="board-progress-chart"
      padding={0}
      aria-label="Progres proyek"
    >
      <header>
        <h2>Progres</h2>
        <strong>{progress.percent}%</strong>
      </header>
      <div className="board-chart-counts">
        <span>
          <i />
          {progress.total - progress.done} belum selesai
        </span>
        <span>
          <i />
          {progress.done} selesai
        </span>
      </div>
      <ProgressBar
        className="board-progress-meter"
        label="Tugas selesai"
        value={progress.percent}
        isLabelHidden
      />
      {history.length > 1 && (
        <>
          <svg
            viewBox="0 0 300 130"
            role="img"
            aria-label={
              history.length
                ? `Riwayat progres: ${progress.done} dari ${progress.total - progress.done} belum selesai selesai`
                : "Riwayat progres belum tersedia"
            }
          >
            {[20, 65, 110].map((y) => (
              <line key={y} x1="12" x2="288" y1={y} y2={y} stroke="#edf0f4" />
            ))}
            {path && (
              <>
                {history.length > 1 && (
                  <path
                    d={`${path} L${point(history.at(-1)!)[0]},110 L12,110 Z`}
                    fill="#e8efff"
                  />
                )}
                <path
                  d={path}
                  fill="none"
                  stroke="#007aff"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                {history.map((row, i) => (
                  <circle
                    key={i}
                    cx={point(row)[0]}
                    cy={point(row)[1]}
                    r="3"
                    fill="#007aff"
                  >
                    <title>
                      {date(row.at)} · {row.done}/{row.total} selesai
                    </title>
                  </circle>
                ))}
              </>
            )}
            {!history.length && (
              <text
                x="150"
                y="70"
                textAnchor="middle"
                fill="#8c929d"
                fontSize="11"
              >
                Progres dicatat saat langkah berubah.
              </text>
            )}
          </svg>
          <div className="board-chart-dates">
            <span>{date(first)}</span>
            <span>{history.length > 1 ? date(last) : ""}</span>
          </div>
        </>
      )}
    </Card>
  );
}
