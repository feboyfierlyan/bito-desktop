import { X, Pencil, Info, Check, RotateCcw, MessageCircle } from "lucide-react";
import { Popover } from "@astryxdesign/core/Popover";
import { useEffect, useRef, useState } from "react";
import { BitoButton, BitoInput, BitoTextArea } from "./ui/controls";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { TaskDatePicker } from "./TaskComposer";
import { ProjectSessionBar } from "./ProjectSessionBar";
import { openProjectSession } from "./project-work";
import { taskContentStamp } from "./task-capture";
import type { Reply, Snapshot } from "./shared";
export type TaskSelection = { id: string; projectId: string | null };
export type WorkspaceAct = (name: string, payload?: unknown) => Promise<Reply>;
export function WorkspaceTaskPanel({
  state,
  selection,
  act,
  busy,
  onClose,
  onDirty,
  embedded = false,
  returnLabel = "Kembali ke ringkasan",
  onBusy,
}: {
  embedded?: boolean;
  returnLabel?: string;
  onBusy?: (busy: boolean) => void;
  state: Snapshot;
  selection: TaskSelection;
  act: WorkspaceAct;
  busy: boolean;
  onClose: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const project = state.projects.find((p) => p.id === selection.projectId);
  const group = project?.plan?.milestones.find((m) =>
    m.tasks.some((t) => t.id === selection.id),
  );
  const task = selection.projectId
    ? group?.tasks.find((t) => t.id === selection.id)
    : state.tasks.find((t) => t.id === selection.id);
  const [editing, setEditing] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [title, setTitle] = useState(task?.title || "");
  const [details, setDetails] = useState(task?.details || "");
  const [sessionDirty, setSessionDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const held = useRef(false);
  const baseline = useRef({
    version: project?.version,
    stamp: task ? taskContentStamp(task) : "",
    title: task?.title || "",
    details: task?.details || "",
  });
  const dirty =
    editing &&
    (title !== baseline.current.title || details !== baseline.current.details);
  useEffect(() => {
    onDirty(dirty || sessionDirty);
    return () => onDirty(false);
  }, [dirty, sessionDirty, onDirty]);
  const run: WorkspaceAct = async (name, payload) => {
    if (held.current || busy) return { ok: false };
    held.current = true;
    setPending(true);
    setError("");
    try {
      const r = await act(name, payload);
      if (!r.ok) setError(r.error || "Belum tersimpan. Coba lagi.");
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Belum tersimpan.");
      return { ok: false };
    } finally {
      held.current = false;
      setPending(false);
    }
  };
  const session = project && openProjectSession(project);
  const sameSession = session?.taskId === selection.id;
  const done = task && ("status" in task ? task.status === "done" : task.done);
  const editable =
    !project || !["archived", "completed"].includes(project.status);
  const date = task?.dueDate === undefined ? group?.targetDate : task.dueDate;
  const locked = busy || pending;
  useEffect(() => {
    onBusy?.(pending);
    return () => onBusy?.(false);
  }, [pending, onBusy]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (embedded) {
      const column = heading.current?.closest(".workspace-context-column");
      if (column) column.scrollTop = 0;
      heading.current?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 850px)").matches)
        heading.current?.scrollIntoView({ block: "start", behavior: "auto" });
    }
  }, [embedded]);
  const requestClose = () => {
    if (locked) return;
    if (dirty || sessionDirty) {
      setDiscard(true);
      return;
    }
    onClose();
  };
  const editButton =
    task && !editing ? (
      <BitoButton
        type="button"
        aria-label="Edit tugas"
        title="Edit tugas"
        className="task-edit-action"
        disabled={locked || !editable || sessionDirty}
        onClick={() => {
          baseline.current = {
            version: project?.version,
            stamp: taskContentStamp(task),
            title: task.title,
            details: task.details || "",
          };
          setTitle(task.title);
          setDetails(task.details || "");
          setEditing(true);
        }}
      >
        <Pencil size={16} />
      </BitoButton>
    ) : null;
  const content = (
    <>
      {!task ? (
        <p>Tugas sudah tidak tersedia.</p>
      ) : (
        <div className="workspace-task-panel">
          <small>{project?.name || "Tugas pribadi"}</small>
          {editing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const changes = { title, details };
                const r = await run(
                  project ? "project-task-edit" : "task-update",
                  project
                    ? {
                        id: project.id,
                        taskId: task.id,
                        version: baseline.current.version,
                        changes,
                      }
                    : {
                        id: task.id,
                        expected: baseline.current.stamp,
                        changes,
                      },
                );
                if (r.ok) {
                  setEditing(false);
                  onDirty(false);
                }
              }}
            >
              <BitoInput
                label="Nama tugas"
                value={title}
                maxLength={200}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                disabled={locked}
              />
              <BitoTextArea
                label="Catatan tugas"
                value={details}
                maxLength={1000}
                rows={4}
                onChange={(e) => setDetails(e.target.value)}
                disabled={locked}
              />
              <div className="project-form-actions">
                <BitoButton
                  type="submit"
                  variant="primary"
                  disabled={locked || !title.trim()}
                >
                  Simpan perubahan
                </BitoButton>
                <BitoButton
                  type="button"
                  disabled={locked}
                  onClick={() => setEditing(false)}
                >
                  Batal
                </BitoButton>
              </div>
            </form>
          ) : (
            <>
              <h2>{task.title}</h2>
              {task.details && (
                <div className="task-description">
                  <p
                    className={
                      !descriptionOpen && task.details.length > 240
                        ? "is-collapsed"
                        : ""
                    }
                  >
                    {task.details}
                  </p>
                  {task.details.length > 240 && (
                    <BitoButton
                      type="button"
                      aria-expanded={descriptionOpen}
                      onClick={() => setDescriptionOpen(!descriptionOpen)}
                    >
                      {descriptionOpen ? "Ringkas" : "Baca selengkapnya"}
                    </BitoButton>
                  )}
                </div>
              )}
              <div className="task-panel-properties">
                <TaskDatePicker
                  value={date}
                  max={project?.deadline}
                  completed={!!done}
                  disabled={locked || !editable || sessionDirty}
                  onChange={(dueDate) =>
                    void run(
                      project ? "project-task-date" : "task-update",
                      project
                        ? {
                            id: project.id,
                            taskId: task.id,
                            version: project.version,
                            dueDate,
                          }
                        : {
                            id: task.id,
                            expected: taskContentStamp(task),
                            changes: { title: task.title, dueDate },
                          },
                    )
                  }
                />
                {"doneWhen" in task && task.doneWhen && (
                  <Popover
                    label="Kriteria selesai"
                    placement="below"
                    alignment="end"
                    width={260}
                    content={
                      <div className="task-criteria-content">
                        <strong>Kriteria selesai</strong>
                        <p>{task.doneWhen}</p>
                      </div>
                    }
                  >
                    <BitoButton
                      type="button"
                      className="task-criteria-trigger"
                      aria-label="Kriteria selesai"
                      title="Kriteria selesai"
                    >
                      <Info size={17} />
                    </BitoButton>
                  </Popover>
                )}
                {!embedded && editButton}
              </div>
              {project &&
                !done &&
                (!("status" in task) || task.status !== "blocked") &&
                (!session || sameSession) &&
                editable && (
                  <ProjectSessionBar
                    compact={embedded}
                    project={project}
                    projects={state.projects}
                    taskId={task.id}
                    act={run}
                    busy={locked}
                    onDirty={setSessionDirty}
                    reduced={state.settings.reducedMotion}
                  />
                )}
              {session && !sameSession && (
                <p className="project-hint">
                  Selesaikan sesi “{session.taskTitle}” sebelum memulai tugas
                  lain.
                </p>
              )}
              <div className="task-panel-secondary">
                <BitoButton
                  className={`task-complete-action ${done ? "is-done" : ""}`}
                  disabled={locked || !editable || sameSession || sessionDirty}
                  onClick={() =>
                    void run(
                      project ? "project-task" : "task-toggle",
                      project
                        ? {
                            id: project.id,
                            taskId: task.id,
                            expectedStatus:
                              "status" in task ? task.status : undefined,
                            status: done ? "todo" : "done",
                          }
                        : task.id,
                    )
                  }
                >
                  {done ? <RotateCcw size={16} /> : <Check size={17} />}
                  {done ? "Buka kembali" : "Tandai selesai"}
                </BitoButton>
                {project && !done && editable && (
                  <BitoButton
                    className="task-help-action"
                    disabled={locked || sessionDirty}
                    onClick={() =>
                      void run("project-assist", {
                        id: project.id,
                        taskId: task.id,
                        intent:
                          "status" in task && task.status === "blocked"
                            ? "blocked"
                            : "continue",
                      })
                    }
                  >
                    <MessageCircle size={16} />
                    Minta bantuan Bito
                  </BitoButton>
                )}
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="board-error">
              {error}
            </p>
          )}
          {discard && (
            <div className="task-discard" role="alert">
              <p>Simpan progres atau perubahanmu sebelum menutup.</p>
              <BitoButton onClick={() => setDiscard(false)}>Kembali</BitoButton>
              <BitoButton onClick={onClose}>Abaikan perubahan</BitoButton>
            </div>
          )}
        </div>
      )}
    </>
  );
  if (embedded)
    return (
      <section
        className="task-detail-column"
        aria-label="Detail tugas"
        onKeyDown={(e) => {
          if (
            e.key === "Escape" &&
            !e.defaultPrevented &&
            !(e.target as HTMLElement).closest('[role="dialog"], [role="menu"]')
          ) {
            e.stopPropagation();
            requestClose();
          }
        }}
      >
        <header className="task-detail-header">
          <h2 ref={heading} tabIndex={-1}>
            Detail tugas
          </h2>
          <div className="task-detail-tools">
            {editButton}
            <BitoButton
              type="button"
              aria-label="Tutup detail tugas"
              title={returnLabel}
              disabled={locked}
              onClick={requestClose}
            >
              <X size={17} />
            </BitoButton>
          </div>
        </header>
        {content}
      </section>
    );
  return (
    <WorkspaceDialog
      side
      title="Detail tugas"
      reduced={state.settings.reducedMotion}
      onClose={requestClose}
    >
      {content}
    </WorkspaceDialog>
  );
}
