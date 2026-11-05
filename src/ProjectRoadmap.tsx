import { BitoDisclosure } from "./ui/BitoDisclosure";
import { BitoDateInput } from "./ui/controls";
import { BitoButton, BitoInput } from "./ui/controls";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Flag,
  Paperclip,
  ArrowUpRight,
} from "lucide-react";
import type { Project, ProjectPlan, ProjectTask } from "./projects";
import type { Reply } from "./shared";
import { dayKey, dayNumber, openProjectSession } from "./project-work";
import { projectDateLabel } from "./ProjectVisuals";

type Act = (name: string, payload?: unknown) => Promise<Reply>;

export function ProjectRoadmap({
  project,
  plan = project.plan,
  act,
  busy = false,
  reduced = false,
  onDirty,
  preview = false,
}: {
  project: Project;
  plan?: ProjectPlan | null;
  act?: Act;
  busy?: boolean;
  reduced?: boolean;
  onDirty?: (v: boolean) => void;
  preview?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    id: string | null;
    date: string;
    version: number;
    planId: string;
  } | null>(null);
  const [saved, setSaved] = useState("");
  const [undo, setUndo] = useState<{
    id: string;
    status: ProjectTask["status"];
    after: ProjectTask["status"];
  } | null>(null);
  if (!plan) return null;
  const today = dayKey();
  const dates = [
    today,
    project.deadline,
    ...plan.milestones.map((m) => m.targetDate),
  ].filter((v): v is string => !!v);
  const start = Math.min(...dates.map(dayNumber));
  const end = Math.max(...dates.map(dayNumber), start + 1);
  const position = (date: string) =>
    `${Math.max(0, Math.min(100, ((dayNumber(date) - start) / (end - start)) * 100))}%`;
  const editable = !!act && project.status === "active" && !preview;
  const session = openProjectSession(project);
  const milestoneIndex = editor?.id
    ? plan.milestones.findIndex((m) => m.id === editor.id)
    : -1;
  const earlierDates = plan.milestones
    .slice(0, milestoneIndex)
    .map((m) => m.targetDate)
    .filter((v): v is string => !!v);
  const laterDates = plan.milestones
    .slice(milestoneIndex + 1)
    .map((m) => m.targetDate)
    .filter((v): v is string => !!v);
  const minDate = editor?.id
    ? earlierDates.at(-1)
    : plan.milestones
        .map((m) => m.targetDate)
        .filter((v): v is string => !!v)
        .at(-1);
  const maxDate = editor?.id
    ? laterDates[0] || project.deadline || undefined
    : undefined;
  const closeEditor = () => {
    setEditor(null);
    onDirty?.(false);
  };
  const editDate = (id: string | null, date: string | null) => {
    setSaved("");
    setUndo(null);
    setEditor({
      id,
      date: date || "",
      version: project.version,
      planId: plan.id,
    });
    onDirty?.(true);
  };
  return (
    <section
      className={`task-roadmap ${preview ? "is-preview" : ""}`}
      aria-label={preview ? "Pratinjau rencana" : "Rencana tugas"}
    >
      <div className="task-roadmap-heading">
        <h3>{preview ? "Rencana sampai selesai" : "Rencanamu"}</h3>
        <BitoButton
          className="task-date-button"
          disabled={busy || !editable || !!editor}
          onClick={() => editDate(null, project.deadline)}
          aria-label="Ubah tenggat tugas"
        >
          <Flag size={13} />{" "}
          {project.deadline
            ? projectDateLabel(project.deadline)
            : "Tambah tenggat"}
        </BitoButton>
      </div>
      <div className="task-roadmap-axis" aria-hidden="true">
        <span>{projectDateLabel(dates.slice().sort()[0])}</span>
        <span>{projectDateLabel(dates.slice().sort().at(-1)!)}</span>
      </div>
      <div className="task-roadmap-rows">
        {plan.milestones.map((m, index) => {
          const done = m.tasks.filter((t) => t.status === "done").length;
          const complete = m.tasks.length > 0 && done === m.tasks.length;
          const active =
            !complete &&
            !plan.milestones
              .slice(0, index)
              .some((v) => v.tasks.some((t) => t.status !== "done"));
          const open = expanded === m.id;
          return (
            <div
              className={`task-roadmap-row ${complete ? "is-done" : active ? "is-current" : ""}`}
              key={m.id}
            >
              <span className="task-roadmap-node" aria-hidden="true">
                {complete ? <Check size={11} /> : index + 1}
              </span>
              <div className="task-roadmap-main">
                <div className="task-roadmap-row-heading">
                  <BitoButton
                    className="task-roadmap-title"
                    aria-expanded={open}
                    aria-controls={`milestone-${m.id}`}
                    disabled={!!editor}
                    onClick={() => setExpanded(open ? null : m.id)}
                  >
                    <span>{m.title}</span>
                    <ChevronDown size={13} className={open ? "is-open" : ""} />
                  </BitoButton>
                  <BitoButton
                    className="task-date-button"
                    disabled={busy || !editable || !!editor}
                    onClick={() => editDate(m.id, m.targetDate)}
                    aria-label={`Ubah tanggal ${m.title}`}
                  >
                    <CalendarDays size={12} />{" "}
                    {m.targetDate
                      ? projectDateLabel(m.targetDate)
                      : "Tanpa tanggal"}
                  </BitoButton>
                </div>
                <div className="task-roadmap-track" aria-hidden="true">
                  <i
                    className="task-roadmap-today"
                    style={{ left: position(today) }}
                  />
                  {m.targetDate && (
                    <i
                      className="task-roadmap-duration"
                      style={{ width: position(m.targetDate) }}
                    >
                      <span
                        style={{ width: `${m.tasks.length ? (done / m.tasks.length) * 100 : 0}%` }}
                      />
                    </i>
                  )}
                  {!m.targetDate && (
                    <i
                      className="task-roadmap-duration"
                      style={{ width: "100%" }}
                    >
                      <span
                        style={{ width: `${m.tasks.length ? (done / m.tasks.length) * 100 : 0}%` }}
                      />
                    </i>
                  )}
                </div>
                <small>
                  {done}/{m.tasks.length} langkah selesai
                  {active && !preview ? " · Berikutnya" : ""}
                </small>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      id={`milestone-${m.id}`}
                      className="task-roadmap-expansion"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        duration: reduced ? 0 : 0.24,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      <ul className="task-roadmap-tasks">
                        {m.tasks.map((t) => (
                          <li key={t.id}>
                            <BitoInput
                              type="checkbox"
                              aria-label={`Tandai selesai: ${t.title}`}
                              checked={t.status === "done"}
                              disabled={
                                busy ||
                                !editable ||
                                !!editor ||
                                session?.taskId === t.id
                              }
                              onChange={async () => {
                                const result = await act?.("project-task", {
                                  id: project.id,
                                  taskId: t.id,
                                  status: t.status === "done" ? "todo" : "done",
                                  expectedStatus: t.status,
                                });
                                if (result?.ok) {
                                  setUndo({
                                    id: t.id,
                                    status: t.status,
                                    after:
                                      t.status === "done" ? "todo" : "done",
                                  });
                                  setSaved(
                                    t.status === "done"
                                      ? "Langkah dibuka kembali."
                                      : "Langkah ditandai selesai.",
                                  );
                                }
                              }}
                            />
                            <BitoDisclosure className="task-step-detail">
                              <summary>
                                <span
                                  className={
                                    t.status === "done"
                                      ? "task-finished-title"
                                      : ""
                                  }
                                >
                                  {t.title}
                                </span>
                              </summary>
                              {t.details && <p>{t.details}</p>}
                              <small>
                                {t.estimateMin}–{t.estimateMax} menit
                                {t.doneWhen && ` · Selesai saat ${t.doneWhen}`}
                              </small>
                              {t.status === "blocked" && (
                                <p className="task-roadmap-blocked">
                                  Perlu bantuan
                                </p>
                              )}
                              {session?.taskId === t.id && (
                                <p>
                                  Sesi sedang terbuka. Laporkan hasil di bagian
                                  atas.
                                </p>
                              )}
                              {!preview && editable && t.status !== "done" && (
                                <BitoButton
                                  className="project-link"
                                  disabled={busy || !!editor}
                                  onClick={() =>
                                    void act?.("project-assist", {
                                      id: project.id,
                                      taskId: t.id,
                                      intent:
                                        t.status === "blocked"
                                          ? "blocked"
                                          : "continue",
                                    })
                                  }
                                >
                                  Bantu aku di langkah ini{" "}
                                  <ArrowUpRight size={12} />
                                </BitoButton>
                              )}
                            </BitoDisclosure>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {editor && (
          <motion.form
            className="task-date-editor"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await act?.("project-schedule", {
                id: project.id,
                version: editor.version,
                planId: editor.planId,
                milestoneId: editor.id,
                targetDate: editor.date || null,
              });
              if (result?.ok) {
                closeEditor();
                setSaved("Tanggal tersimpan.");
              }
            }}
          >
            <div className="bito-form-field">
              {editor.id ? "Tanggal target" : "Tenggat tugas"}
              <BitoDateInput
                label={editor.id ? "Tanggal target" : "Tenggat tugas"}
                autoFocus
                value={editor.date}
                disabled={busy}
                min={minDate}
                max={maxDate}
                onValueChange={(e) => setEditor({ ...editor, date: e ?? "" })}
              />
            </div>
            <div className="pw-actions">
              <BitoButton className="project-primary" disabled={busy}>
                Simpan tanggal
              </BitoButton>
              <BitoButton
                type="button"
                className="project-link"
                disabled={busy}
                onClick={closeEditor}
              >
                Batal
              </BitoButton>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
      <div className="task-roadmap-feedback" role="status">
        {saved}
        {undo && (
          <BitoButton
            className="project-link"
            disabled={busy || !!editor}
            onClick={async () => {
              const result = await act?.("project-task", {
                id: project.id,
                taskId: undo.id,
                status: undo.status,
                expectedStatus: undo.after,
              });
              if (result?.ok) {
                setUndo(null);
                setSaved("Perubahan dibatalkan.");
              }
            }}
          >
            Urungkan
          </BitoButton>
        )}
      </div>
    </section>
  );
}

export function ProjectTaskMaterials({
  project,
  task,
  onMaterials,
}: {
  project: Project;
  task?: ProjectTask;
  onMaterials: () => void;
}) {
  const sources = task?.sourceIds.length
    ? project.materials.filter((m) => task.sourceIds.includes(m.id))
    : project.materials.slice(0, 3);
  if (!sources.length) return null;
  return (
    <section className="task-relevant-materials" aria-label="Bahan pendukung">
      <div>
        <h3>
          {task?.sourceIds.length ? "Bahan untuk langkah ini" : "Bahan tugasmu"}
        </h3>
        <BitoButton className="project-link" onClick={onMaterials}>
          Lihat semua <ArrowUpRight size={12} />
        </BitoButton>
      </div>
      {sources.map((m) => (
        <BitoDisclosure
          className="project-disclosure task-source-preview"
          key={m.id}
        >
          <summary>
            <Paperclip size={13} />
            <span>{m.name}</span>
            <ChevronDown size={13} />
          </summary>
          <pre>{m.content}</pre>
          {m.warnings?.map((warning, index) => (
            <p key={index} className="project-material-warning">
              {warning}
            </p>
          ))}
        </BitoDisclosure>
      ))}
    </section>
  );
}
