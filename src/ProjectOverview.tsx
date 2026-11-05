import { BitoDisclosure } from "./ui/BitoDisclosure";
import { BitoSelect } from "./ui/controls";
import { BitoButton, BitoTextArea, BitoInput } from "./ui/controls";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Check,
  Clock3,
  FileText,
  Pause,
  Play,
  RefreshCw,
  Square,
} from "lucide-react";
import type { Project } from "./projects";
import type { Reply, Snapshot } from "./shared";
import {
  openProjectSession,
  projectWorkEntry,
  projectDashboard,
  recommendProjectWork,
  replanProjectPrompt,
  sessionElapsed,
} from "./project-work";
import { ProjectHistory } from "./ProjectVisuals";
import { ProjectRoadmap, ProjectTaskMaterials } from "./ProjectRoadmap";
import { visibleBlocker } from "./project-presentation";
type Act = (name: string, payload?: unknown) => Promise<Reply>;

export function ProjectOverview({
  project,
  state,
  act,
  busy,
  onPlan,
  onMaterials,
  onDirty,
}: {
  project: Project;
  state: Snapshot;
  act: Act;
  busy: boolean;
  onPlan: () => void;
  onMaterials: () => void;
  onDirty: (v: boolean) => void;
}) {
  const [minutes, setMinutes] = useState(25);
  const [timer, setTimer] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [objective, setObjective] = useState("");
  const [outcome, setOutcome] = useState<"done" | "partial" | "blocked">(
    "partial",
  );
  const [note, setNote] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [now, setNow] = useState(Date.now);
  const [feedback, setFeedback] = useState("");
  const [scheduleEditing, setScheduleEditing] = useState(false);
  const uiBusy = busy || scheduleEditing;
  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(""), 6000);
    return () => clearTimeout(timeout);
  }, [feedback]);
  const session = openProjectSession(project);
  useEffect(() => {
    if (
      session?.phase !== "running" &&
      !(
        project.suggestionDeferredUntil &&
        project.suggestionDeferredUntil > Date.now()
      )
    )
      return;
    const i = setInterval(
      () => setNow(Date.now()),
      session?.phase === "running" ? 1000 : 30000,
    );
    return () => clearInterval(i);
  }, [session?.id, session?.phase, project.suggestionDeferredUntil]);
  useEffect(() => {
    setChoosing(false);
    setTaskId("");
    setObjective("");
    setNote("");
    setNextStep("");
    setOutcome("partial");
    onDirty(false);
  }, [session?.id, project.id]);
  const d = projectDashboard(project, now);
  const recommendation = recommendProjectWork(project, minutes, now);
  const task =
    d.rows.find((r) => r.task.id === (session?.taskId || taskId))?.task ||
    recommendation?.task;
  const checkpoint =
    project.checkpoint?.taskId === task?.id ? project.checkpoint : null;
  const otherSession = state.projects.find(
    (p) => p.id !== project.id && openProjectSession(p),
  );
  const finished = d.total > 0 && d.done === d.total;
  const changeDraft = () => {
    setChoosing(true);
    setTaskId(task?.id || "");
    setObjective(task?.title || "");
  };
  const start = async (withBito = true) => {
    if (!task) return;
    const r = await act(withBito ? "project-assist" : "project-work-start", {
      id: project.id,
      ...(withBito
        ? {
            intent: projectWorkEntry(project, task.id)?.continuing
              ? "continue"
              : "start",
            begin: true,
          }
        : {}),
      taskId: task.id,
      objective: choosing
        ? objective
        : projectWorkEntry(project, task.id, timer ? minutes : null)
            ?.objective || task.title,
      minutes: timer ? minutes : null,
    });
    if (r.ok) {
      setChoosing(false);
      onDirty(false);
    }
  };
  const report = async () => {
    if (!session) return;
    const r = await act("project-work-report", {
      id: project.id,
      sessionId: session.id,
      outcome,
      note,
      nextStep,
    });
    if (r.ok) {
      setNote("");
      setNextStep("");
      setFeedback(
        outcome === "done"
          ? "Langkah selesai. Progresmu sudah tersimpan."
          : "Titik terakhirmu tersimpan. Bisa dilanjutkan kapan pun.",
      );
      onDirty(false);
    }
  };
  const help = async () => {
    if (!task) return;
    await act("project-assist", {
      id: project.id,
      taskId: task.id,
      intent:
        outcome === "blocked" || visibleBlocker(checkpoint?.blocker)
          ? "blocked"
          : session
            ? "continue"
            : "start",
      note,
      resume: session?.phase === "paused" && session.taskId === task.id,
    });
  };
  const command = (name: string) =>
    act(`project-work-${name}`, { id: project.id, sessionId: session?.id });
  const blocker = visibleBlocker(checkpoint?.blocker);
  return (
    <div className="project-overview">
      <div className="task-save-feedback" role="status">
        {feedback && (
          <>
            <Check size={14} />
            {feedback}
          </>
        )}
      </div>
      <div className="task-progress-summary">
        <span>
          {d.done} dari {d.total} langkah selesai
        </span>
        <span>{d.percent}%</span>
        <div
          role="progressbar"
          aria-label="Langkah selesai"
          aria-valuenow={d.done}
          aria-valuemin={0}
          aria-valuemax={d.total || 1}
        >
          <i style={{ width: `${d.percent}%` }} />
        </div>
      </div>
      {project.draft && (
        <BitoButton className="pw-draft-banner" onClick={onPlan}>
          <span>
            <RefreshCw size={14} /> Ada draf perubahan untuk ditinjau
          </span>
          <ArrowRight size={14} />
        </BitoButton>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          className="pw-session"
          key={
            session
              ? `${session.id}-${session.phase === "review" ? "review" : "work"}`
              : "recommendation"
          }
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: state.settings.reducedMotion ? 0 : 0.16 }}
        >
          {session ? (
            <>
              <div className="pw-section-label">
                <span className={`pw-live-dot ${session.phase}`} />
                {session.phase === "review"
                  ? "Gimana hasilnya?"
                  : session.phase === "paused"
                    ? "Sesi dijeda"
                    : "Satu hal dulu"}
              </div>
              <h2>{session.objective}</h2>
              <p className="pw-muted">
                {session.taskTitle !== session.objective
                  ? session.taskTitle
                  : "Satu langkah dulu. Kembali ke sini setelah mengerjakannya."}
              </p>
              {session.phase !== "review" ? (
                <>
                  {session.minutes !== null && (
                    <div
                      className="pw-clock"
                      role="timer"
                      aria-label={
                        session.minutes === null ? "Waktu kerja" : "Sisa sesi"
                      }
                    >
                      {(() => {
                        const seconds = Math.max(
                          0,
                          Math.ceil(
                            (session.minutes === null
                              ? sessionElapsed(session, now)
                              : session.minutes * 60000 -
                                sessionElapsed(session, now)) / 1000,
                          ),
                        );
                        return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
                      })()}
                      <small>
                        {session.minutes === null
                          ? "Tanpa batas waktu"
                          : `dari ${session.minutes} menit`}
                      </small>
                    </div>
                  )}
                  <div className="pw-actions">
                    <BitoButton
                      className="project-link"
                      disabled={uiBusy}
                      onClick={() => void help()}
                    >
                      Bantu aku lanjut <ArrowRight size={13} />
                    </BitoButton>
                    <BitoButton
                      className="project-secondary"
                      disabled={uiBusy}
                      onClick={() =>
                        void command(
                          session.phase === "paused" ? "resume" : "pause",
                        )
                      }
                    >
                      {session.phase === "paused" ? (
                        <Play size={13} />
                      ) : (
                        <Pause size={13} />
                      )}
                      {session.phase === "paused" ? "Lanjutkan" : "Jeda"}
                    </BitoButton>
                    <BitoButton
                      className="project-primary"
                      disabled={uiBusy}
                      onClick={() => void command("finish")}
                    >
                      <Square size={12} /> Selesai untuk sekarang
                    </BitoButton>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="pw-outcomes"
                    role="group"
                    aria-label="Hasil sesi"
                  >
                    {(
                      [
                        ["done", "Selesai"],
                        ["partial", "Belum selesai"],
                        ["blocked", "Aku mentok"],
                      ] as const
                    ).map(([value, label]) => (
                      <BitoButton
                        key={value}
                        disabled={uiBusy}
                        aria-pressed={outcome === value}
                        onClick={() => {
                          setOutcome(value);
                          onDirty(true);
                        }}
                      >
                        {value === "done" && <Check size={12} />}
                        {label}
                      </BitoButton>
                    ))}
                  </div>
                  <div className="pw-field bito-form-field">
                    {outcome === "blocked"
                      ? "Mentok di bagian mana?"
                      : "Sampai mana tadi? (opsional)"}
                    <BitoTextArea
                      label={
                        outcome === "blocked"
                          ? "Mentok di bagian mana?"
                          : "Sampai mana tadi? (opsional)"
                      }
                      maxLength={1000}
                      rows={2}
                      disabled={uiBusy}
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value);
                        onDirty(true);
                      }}
                    />
                  </div>
                  <BitoDisclosure className="project-disclosure">
                    <summary>Catat langkah berikutnya (opsional)</summary>
                    <div className="pw-field bito-form-field">
                      Lanjut dari mana nanti?
                      <BitoInput
                        label="Lanjut dari mana nanti?"
                        maxLength={1000}
                        disabled={uiBusy}
                        value={nextStep}
                        onChange={(e) => {
                          setNextStep(e.target.value);
                          onDirty(true);
                        }}
                      />
                    </div>
                  </BitoDisclosure>
                  <div className="pw-actions">
                    <BitoButton
                      className="project-primary"
                      disabled={
                        uiBusy || (outcome === "blocked" && !note.trim())
                      }
                      onClick={() => void report()}
                    >
                      Simpan hasil
                    </BitoButton>
                    {outcome === "blocked" && (
                      <BitoButton
                        className="project-link"
                        disabled={uiBusy}
                        onClick={() => void help()}
                      >
                        Bantu bagian ini
                      </BitoButton>
                    )}
                  </div>
                </>
              )}
            </>
          ) : finished ? (
            <>
              <div className="pw-section-label">
                <Check size={14} /> Semua langkah beres
              </div>
              <h2>Satu tugas terlewati.</h2>
              <p className="pw-muted">
                Periksa hasil akhirnya, lalu tandai tugas ini selesai.
              </p>
              <BitoButton
                className="project-primary"
                disabled={uiBusy || project.status === "completed"}
                onClick={() =>
                  void act("project-status", {
                    id: project.id,
                    status: "completed",
                  })
                }
              >
                {project.status === "completed"
                  ? "Tugas selesai"
                  : "Tandai tugas selesai"}
              </BitoButton>
            </>
          ) : otherSession ? (
            <>
              <h2>Masih mengerjakan tugas lain?</h2>
              <p className="pw-muted">{otherSession.name}</p>
              <BitoButton
                className="project-primary"
                disabled={uiBusy}
                onClick={() => void act("project-open", otherSession.id)}
              >
                Kembali ke langkah itu
              </BitoButton>
            </>
          ) : recommendation ? (
            <>
              <div className="pw-section-label">
                <Play size={13} /> Langkah berikutnya
              </div>
              <h2>{task?.title}</h2>
              {task?.details && (
                <p className="task-action-description">{task.details}</p>
              )}
              {checkpoint && (checkpoint.lastStop || checkpoint.nextStep) && (
                <BitoDisclosure className="task-continuation-note">
                  <summary>Catatan terakhir</summary>
                  {checkpoint.lastStop && <p>{checkpoint.lastStop}</p>}
                  {checkpoint.nextStep && (
                    <p>Rencana lanjut: {checkpoint.nextStep}</p>
                  )}
                </BitoDisclosure>
              )}
              {blocker && (
                <div className="pw-blocker">
                  <span>{blocker}</span>
                  <BitoButton
                    className="project-link"
                    disabled={uiBusy}
                    onClick={() => void help()}
                  >
                    Bantu bagian ini
                  </BitoButton>
                </div>
              )}
              <div className="pw-actions">
                <BitoButton
                  className="project-primary"
                  disabled={
                    uiBusy ||
                    project.status !== "active" ||
                    (timer &&
                      (!Number.isInteger(minutes) ||
                        minutes < 5 ||
                        minutes > 180)) ||
                    (choosing && !objective.trim())
                  }
                  onClick={() => void start()}
                >
                  <Play size={14} /> Mulai bareng Bito
                </BitoButton>
                <BitoButton
                  className="project-link"
                  disabled={uiBusy}
                  onClick={() => void start(false)}
                >
                  Kerjakan sendiri
                </BitoButton>
              </div>
              <BitoDisclosure className="project-disclosure task-session-options">
                <summary>Sesuaikan langkah & waktu</summary>
                <div className="pw-field bito-form-field">
                  Langkah
                  <BitoSelect
                    label="Pilih opsi"
                    value={task?.id || ""}
                    disabled={uiBusy}
                    onValueChange={(e) => {
                      setChoosing(true);
                      setTaskId(e);
                      setObjective(
                        d.rows.find((r) => r.task.id === e)?.task.title || "",
                      );
                    }}
                  >
                    {d.rows
                      .filter((r) => ["todo", "doing"].includes(r.task.status))
                      .map((r) => (
                        <option key={r.task.id} value={r.task.id}>
                          {r.task.title}
                        </option>
                      ))}
                  </BitoSelect>
                </div>
                {choosing && (
                  <div className="pw-field bito-form-field">
                    Targetmu
                    <BitoInput
                      label="Targetmu"
                      maxLength={500}
                      value={objective}
                      disabled={uiBusy}
                      onChange={(e) => {
                        setObjective(e.target.value);
                        onDirty(true);
                      }}
                    />
                  </div>
                )}
                <label className="pw-timer-option">
                  <BitoInput
                    type="checkbox"
                    checked={timer}
                    disabled={uiBusy}
                    onChange={(e) => setTimer(e.target.checked)}
                  />{" "}
                  Pakai timer
                </label>
                {timer && (
                  <div
                    className="pw-time-options"
                    role="group"
                    aria-label="Waktu tersedia"
                  >
                    {[15, 25, 45].map((n) => (
                      <BitoButton
                        key={n}
                        aria-pressed={minutes === n}
                        onClick={() => setMinutes(n)}
                      >
                        {n} mnt
                      </BitoButton>
                    ))}
                    <BitoInput
                      type="number"
                      min={5}
                      max={180}
                      value={minutes}
                      aria-label="Durasi dalam menit"
                      onChange={(e) => setMinutes(Number(e.target.value))}
                    />
                  </div>
                )}
                {task?.doneWhen && (
                  <p className="pw-muted">Selesai kalau: {task.doneWhen}</p>
                )}
              </BitoDisclosure>
            </>
          ) : (
            <>
              <h2>
                {d.blocked
                  ? "Ada langkah yang perlu dibantu."
                  : "Kita susun langkahnya dulu."}
              </h2>
              <p className="pw-muted">
                {d.blocked
                  ? "Pilih langkah yang tertahan untuk melanjutkan atau minta bantuan Bito."
                  : "Pakai rencana yang sudah kita siapkan untuk mulai."}
              </p>
              <BitoButton
                className="project-primary"
                disabled={uiBusy}
                onClick={onPlan}
              >
                Lihat langkah
              </BitoButton>
            </>
          )}
        </motion.section>
      </AnimatePresence>
      {project.plan && (
        <>
          {(d.overdue.length > 0 ||
            (d.daysLeft !== null && d.daysLeft < 0 && !finished)) && (
            <div className="task-schedule-note">
              <span>
                {d.overdue.length
                  ? "Ada target yang sudah lewat."
                  : "Tenggat sudah lewat."}{" "}
                Kita bisa atur ulang.
              </span>
              <BitoButton
                className="project-link"
                disabled={uiBusy || project.status !== "active"}
                onClick={async () => {
                  const r = await act("send", { text: replanProjectPrompt });
                  if (r.ok) onPlan();
                }}
              >
                Sesuaikan rencana
              </BitoButton>
            </div>
          )}
          <ProjectTaskMaterials
            project={project}
            task={task}
            onMaterials={onMaterials}
          />
          <ProjectRoadmap
            key={project.id}
            project={project}
            act={act}
            busy={
              busy ||
              choosing ||
              (session?.phase === "review" && !scheduleEditing)
            }
            reduced={state.settings.reducedMotion}
            onDirty={(v) => {
              setScheduleEditing(v);
              onDirty(v);
            }}
          />
          {(project.progressHistory?.length || 0) > 1 && (
            <BitoDisclosure className="project-disclosure">
              <summary>Riwayat progres</summary>
              <ProjectHistory project={project} />
            </BitoDisclosure>
          )}
        </>
      )}
    </div>
  );
}
