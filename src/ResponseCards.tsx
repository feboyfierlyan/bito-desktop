import { BitoDisclosure } from "./ui/BitoDisclosure";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { BitoInput } from "./ui/controls";
import { Card } from "@astryxdesign/core/Card";
import { BitoButton } from "./ui/controls";
import { SavedWorkDirectory } from "./SavedWorkDirectory";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  Check,
  ChevronDown,
  FileText,
  FolderOpen,
  ListChecks,
  Pause,
  Play,
  Timer,
  X,
} from "lucide-react";
import { timeDigits, timerCardState } from "./result-cards";
import type { Message, Reply, ResponseCard, Snapshot } from "./shared";
import "./ResponseCards.css";
import { ProjectProgressVisual, ProjectTimeline } from "./ProjectVisuals";
import { openProjectSession, projectWorkEntry } from "./project-work";

type Act = (name: string, payload?: unknown) => Promise<Reply>;
type Props = {
  message: Message;
  state: Snapshot;
  act: Act;
  reduced: boolean;
  seen: Set<string>;
};
type CardProps = Omit<Props, "seen"> & { card: ResponseCard };
const dateLabel = (due: number) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(due);
const localDateInput = (due: number) => {
  const date = new Date(due);
  return new Date(due - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

function CardContent({ message, state, act, card, reduced }: CardProps) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [now, setNow] = useState(Date.now),
    [editing, setEditing] = useState(false);
  const [reminderTitle, setReminderTitle] = useState(""),
    [reminderDue, setReminderDue] = useState("");
  const [preview, setPreview] = useState<string | undefined>(),
    [previewOpen, setPreviewOpen] = useState(false);
  const running =
    card.kind === "timer" &&
    state.focus.id === card.timerId &&
    state.focus.running &&
    state.chatOpen;
  const confirmationActive =
    card.kind === "quick-task-removal" &&
    card.status === "pending" &&
    now < card.expiresAt &&
    state.chatOpen;
  useEffect(() => {
    setNow(Date.now());
    if (!running && !confirmationActive) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [running, confirmationActive, state.focus.deadline]);
  const request = async (command: string, extra: Record<string, unknown>) => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await act(command, {
        messageId: message.id,
        cardId: card.id,
        ...extra,
      });
      if (!result.ok)
        setError(result.error || "Belum bisa menyelesaikan tindakan.");
      return result;
    } catch {
      setError("Tindakan belum bisa dijalankan. Coba lagi.");
    } finally {
      setPending(false);
    }
  };
  const action = (operation: string, extra: Record<string, unknown> = {}) =>
    request("rich-action", { operation, ...extra });
  const notice = error && (
    <p className="result-error" role="alert">
      {error}
    </p>
  );
  if (card.kind === "saved-work")
    return (
      <SavedWorkDirectory state={state} act={act} initialView={card.view} />
    );
  if (card.kind === "quick-task-removal") {
    const expired = now >= card.expiresAt;
    return (
      <>
        <h3>
          {card.status === "removed"
            ? `${card.removedCount} tugas singkat dihapus.`
            : card.status === "cancelled"
              ? "Dibatalkan. Tugasmu tetap tersimpan."
              : "Hapus tugas singkat?"}
        </h3>
        {card.status === "pending" && (
          <>
            <p>
              {card.tasks.length} tugas singkat akan dihapus. Proyek dan
              pengingat tetap tersimpan.
            </p>
            <BitoDisclosure>
              <summary>Lihat tugas</summary>
              <ul>
                {card.tasks.map((t) => (
                  <li key={t.id}>{t.title}</li>
                ))}
              </ul>
            </BitoDisclosure>
            <div className="result-actions">
              <BitoButton
                className="result-primary"
                disabled={pending || state.busy || expired}
                onClick={() =>
                  void request("quick-task-removal", { action: "confirm" })
                }
              >
                {pending ? "Memproses…" : `Hapus ${card.tasks.length} tugas`}
              </BitoButton>
              <BitoButton
                disabled={pending || state.busy}
                onClick={() =>
                  void request("quick-task-removal", { action: "cancel" })
                }
              >
                Batal
              </BitoButton>
            </div>
            {expired && <p>Konfirmasi kedaluwarsa. Minta hapus lagi, ya.</p>}
          </>
        )}
        {notice}
      </>
    );
  }
  if (card.kind === "project") {
    const project = state.projects.find((p) => p.id === card.projectId);
    const review =
      card.stage === "understanding" ? project?.understanding : undefined;
    const current = !!card.draftId && project?.draft?.id === card.draftId;
    const status =
      !!project?.plan && !current && card.stage !== "understanding";
    const session = project && openProjectSession(project);
    const next = status
      ? projectWorkEntry(project, session?.taskId, card.minutes ?? null)
      : undefined;
    return (
      <>
        <div className="result-eyebrow">
          <ListChecks size={15} /> Proyek{" "}
          <span className="result-status">
            {card.stage === "understanding"
              ? project?.understanding?.confirmedAt
                ? "Sudah dikonfirmasi"
                : "Pemahaman · perlu diperiksa"
              : current
                ? "Draf · perlu ditinjau"
                : project?.plan
                  ? "Rencana aktif"
                  : "Perencanaan"}
          </span>
        </div>
        <h3>{project?.name || card.title}</h3>
        {status && (
          <>
            <ProjectProgressVisual project={project!} compact />
            <ProjectTimeline project={project!} compact />
            {session ? (
              <p className="result-detail">
                {session.phase === "review"
                  ? "Sesi selesai · isi laporan hasilmu"
                  : session.phase === "paused"
                    ? "Sesi dijeda"
                    : "Sesi berjalan"}{" "}
                · {session.taskTitle}
              </p>
            ) : (
              next && (
                <p className="pw-card-next">
                  <small>LANGKAH BERIKUTNYA</small>
                  {next.objective}
                  <small>{next.estimateLabel}</small>
                </p>
              )
            )}
          </>
        )}
        {review && (
          <div className="result-task-review">
            <p>{review.summary}</p>
            <ul>
              {review.deliverables.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            {review.requirements.length > 0 && (
              <BitoDisclosure>
                <summary>Ketentuan tugas</summary>
                <ul>
                  {review.requirements.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </BitoDisclosure>
            )}
            {review.unknowns.length > 0 && (
              <BitoDisclosure>
                <summary>Yang belum diketahui</summary>
                <ul>
                  {review.unknowns.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </BitoDisclosure>
            )}
          </div>
        )}
        {current && project.draft && (
          <div className="result-task-review">
            <p>{project.draft.summary}</p>
            <ProjectTimeline
              project={{ ...project, plan: project.draft }}
              compact
            />
            <BitoDisclosure>
              <summary>Lihat langkahnya</summary>
              {project.draft.milestones.map((m) => (
                <div key={m.id}>
                  <strong>{m.title}</strong>
                  <ul>
                    {m.tasks.map((t) => (
                      <li key={t.id}>
                        {t.title}
                        <small>
                          {" "}
                          · {t.estimateMin}–{t.estimateMax} mnt
                        </small>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </BitoDisclosure>
            {project.draft.assumptions.length > 0 && (
              <BitoDisclosure>
                <summary>Asumsi rencana</summary>
                <ul>
                  {project.draft.assumptions.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </BitoDisclosure>
            )}
            <small>
              Ini draf. Tanggal target masih bisa diubah sebelum disetujui.
            </small>
          </div>
        )}
        <div className="result-actions">
          {review && !review.confirmedAt && project && (
            <BitoButton
              className="result-primary"
              disabled={pending || state.busy || project.status === "archived"}
              onClick={() =>
                void request("project-confirm-and-plan", {
                  id: project.id,
                  version: project.version,
                  understandingId: review.id,
                  understanding: {
                    summary: review.summary,
                    deliverables: review.deliverables,
                    requirements: review.requirements,
                    unknowns: review.unknowns,
                    sourceIds: review.sourceIds,
                  },
                })
              }
            >
              {pending ? "Menyiapkan…" : "Sudah pas, susun rencana"}
            </BitoButton>
          )}
          {current && project?.draft && (
            <BitoButton
              className="result-primary"
              disabled={
                pending ||
                state.busy ||
                project.status === "archived" ||
                !project.understanding?.confirmedAt
              }
              onClick={() =>
                void request("project-approve", {
                  id: project.id,
                  version: project.version,
                  draftId: project.draft!.id,
                })
              }
            >
              <Check size={13} /> Setujui rencana
            </BitoButton>
          )}

          {status &&
            next &&
            (!session || session.phase === "paused") &&
            project?.status === "active" && (
              <BitoButton
                className="result-primary"
                disabled={
                  pending ||
                  state.busy ||
                  state.projects.some(
                    (p) => p.id !== project.id && openProjectSession(p),
                  )
                }
                onClick={() =>
                  void request("project-assist", {
                    ...next.payload,
                  })
                }
              >
                <Play size={12} />{" "}
                {next.continuing ? "Lanjut bareng Bito" : "Mulai bareng Bito"}
              </BitoButton>
            )}
          <BitoButton
            className="result-primary"
            disabled={
              !project || project.status === "archived" || pending || state.busy
            }
            onClick={() =>
              void act("project-open", {
                id: card.projectId,
                tab:
                  card.stage === "understanding"
                    ? "understanding"
                    : current
                      ? "plan"
                      : "overview",
              })
            }
          >
            {card.stage === "understanding"
              ? "Ubah ringkasan"
              : current
                ? "Ubah rencana"
                : "Lihat timeline"}
          </BitoButton>
        </div>
        {notice}
      </>
    );
  }
  if (card.kind === "timer") {
    const timer = timerCardState(card, state.focus, now);
    const live =
      timer.current &&
      (timer.status === "running" || timer.status === "paused");
    const labels = {
      ended: "Sesi berakhir",
      complete: "Sesi selesai",
      running: "Sedang fokus",
      paused: "Dijeda",
    };
    return (
      <>
        <div className="result-eyebrow">
          <Timer size={15} /> Sesi fokus{" "}
          <span className="result-status">{labels[timer.status]}</span>
        </div>
        <div
          className="result-timer"
          aria-label={`Sisa waktu ${timeDigits(timer.seconds)}`}
          role="timer"
        >
          {timeDigits(timer.seconds)}
        </div>
        <ProgressBar
          className="bito-result-progress"
          label="Waktu fokus yang telah berlalu"
          isLabelHidden
          value={Math.max(0, timer.total - timer.seconds)}
          max={Math.max(1, timer.total)}
        />
        {live && (
          <div className="result-actions">
            <BitoButton
              className="result-primary"
              disabled={pending || timer.seconds <= 0}
              onClick={() =>
                void action(
                  timer.status === "running" ? "timer-pause" : "timer-resume",
                )
              }
            >
              {timer.status === "running" ? (
                <Pause size={14} />
              ) : (
                <Play size={14} />
              )}{" "}
              {timer.status === "running" ? "Jeda" : "Lanjutkan"}
            </BitoButton>
            <BitoButton
              disabled={pending || timer.total >= 10800}
              onClick={() => void action("timer-add")}
            >
              +1 menit
            </BitoButton>
            <BitoButton
              className="result-icon"
              aria-label="Akhiri sesi fokus"
              disabled={pending}
              onClick={() => void action("timer-end")}
            >
              <X size={16} />
            </BitoButton>
          </div>
        )}
        {notice}
      </>
    );
  }
  if (card.kind === "checklist") {
    const tasks = card.tasks
      .map((item) => ({
        ...item,
        live: state.tasks.find((task) => task.id === item.id),
      }))
      .filter((task) => task.live);
    if (!tasks.length)
      return (
        <>
          <h3>{card.title}</h3>
          <p>Tugas ini sudah dihapus.</p>
        </>
      );
    const done = tasks.filter((task) => task.live?.done).length;
    return (
      <>
        <div className="result-eyebrow">
          <ListChecks size={15} /> Checklist{" "}
          <span className="result-status" aria-live="polite">
            {done}/{tasks.length}
          </span>
        </div>
        <h3>{card.title}</h3>
        <div className="result-task-list">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="result-task"
              data-done={task.live?.done || false}
            >
              <CheckboxInput
                label={task.live?.title || task.title}
                value={task.live?.done || false}
                isDisabled={!task.live || pending}
                onChange={() => void action("task-toggle", { taskId: task.id })}
              />
            </div>
          ))}
        </div>
        <ProgressBar
          className="bito-result-progress"
          label="Tugas selesai"
          isLabelHidden
          value={done}
          max={Math.max(1, tasks.length)}
        />
        {notice}
      </>
    );
  }
  if (card.kind === "reminder") {
    const reminder = state.reminders.find((r) => r.id === card.reminderId);
    const title = reminder?.title || card.title,
      due = reminder?.due || card.due;
    const active = !!reminder && !reminder.done;
    return (
      <>
        <div className="result-eyebrow">
          <Bell size={15} /> Pengingat{" "}
          <span className="result-status">
            {!reminder
              ? "Tidak tersedia"
              : reminder.cancelled
                ? "Dibatalkan"
                : reminder.done
                  ? "Selesai"
                  : reminder.notified
                    ? "Sudah diingatkan"
                    : "Terjadwal"}
          </span>
        </div>
        <h3>{title}</h3>
        <p className="result-detail">{dateLabel(due)}</p>
        {active && !editing && (
          <div className="result-actions">
            <BitoButton
              disabled={pending}
              onClick={() => {
                setReminderTitle(title);
                setReminderDue(localDateInput(due));
                setEditing(true);
              }}
            >
              Ubah
            </BitoButton>
            <BitoButton
              disabled={pending}
              onClick={() => void action("reminder-cancel")}
            >
              Batalkan
            </BitoButton>
          </div>
        )}
        <AnimatePresence initial={false}>
          {editing && (
            <motion.form
              className="result-editor"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: reduced ? 0 : 0.2 }}
              onSubmit={(event) => {
                event.preventDefault();
                const due = new Date(reminderDue).getTime();
                if (!Number.isFinite(due)) {
                  setError("Pilih waktu yang valid.");
                  return;
                }
                void action("reminder-update", {
                  title: reminderTitle,
                  due,
                }).then((result) => {
                  if (result?.ok) setEditing(false);
                });
              }}
            >
              <div className="bito-form-field">
                Pengingat
                <BitoInput
                  maxLength={240}
                  required
                  value={reminderTitle}
                  onChange={(event) => setReminderTitle(event.target.value)}
                />
              </div>
              <div className="bito-form-field">
                Waktu
                <BitoInput
                  type="datetime-local"
                  required
                  value={reminderDue}
                  onChange={(event) => setReminderDue(event.target.value)}
                />
              </div>
              <div className="result-actions">
                <BitoButton
                  className="result-primary"
                  disabled={pending}
                  type="submit"
                >
                  Simpan
                </BitoButton>
                <BitoButton type="button" onClick={() => setEditing(false)}>
                  Batal
                </BitoButton>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
        {notice}
      </>
    );
  }
  return (
    <>
      <div className="result-eyebrow">
        <FileText size={15} /> File tersimpan{" "}
        <span className="result-status">{card.format.toUpperCase()}</span>
      </div>
      <h3 className="result-filename">{card.name}</h3>
      <p className="result-detail">
        {card.bytes < 1024
          ? `${card.bytes} byte`
          : `${(card.bytes / 1024).toFixed(1)} KB`}{" "}
        · UTF-8
      </p>
      <div className="result-actions">
        <BitoButton
          className="result-primary"
          disabled={pending}
          onClick={() => void request("file-output", { operation: "open" })}
        >
          Buka file
        </BitoButton>
        <BitoButton
          className="result-icon"
          disabled={pending}
          aria-label={`Tampilkan ${card.name} di folder`}
          onClick={() => void request("file-output", { operation: "reveal" })}
        >
          <FolderOpen size={16} />
        </BitoButton>
        <BitoButton
          className="result-preview-toggle"
          disabled={pending}
          aria-expanded={previewOpen}
          onClick={() => {
            if (previewOpen) {
              setPreviewOpen(false);
              return;
            }
            void request("file-output", { operation: "preview" }).then(
              (result) => {
                if (result?.ok && typeof result.value === "string") {
                  setPreview(result.value);
                  setPreviewOpen(true);
                }
              },
            );
          }}
        >
          Pratinjau{" "}
          <ChevronDown
            size={13}
            style={{ transform: previewOpen ? "rotate(180deg)" : undefined }}
          />
        </BitoButton>
      </div>
      <AnimatePresence initial={false}>
        {previewOpen && (
          <motion.div
            className="result-file-preview"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0 : 0.22 }}
          >
            <pre>{preview || "File kosong"}</pre>
          </motion.div>
        )}
      </AnimatePresence>
      {notice}
    </>
  );
}

const MotionCard = motion.create(Card);

export function ResponseCards(props: Props) {
  return (
    <div className="response-cards">
      {props.message.cards?.map((card) => (
        <MotionCard
          padding={0}
          key={card.id}
          className={`response-card response-card-${card.kind}`}
          aria-label={
            card.kind === "timer"
              ? "Timer Bito"
              : card.kind === "reminder"
                ? "Pengingat Bito"
                : card.kind === "checklist"
                  ? "Checklist Bito"
                  : card.kind === "project"
                    ? `Proyek ${card.title}`
                    : card.kind === "quick-task-removal"
                      ? "Konfirmasi hapus tugas singkat"
                      : card.kind === "saved-work"
                        ? "Tugas tersimpan"
                        : `File ${card.name}`
          }
          initial={
            props.seen.has(card.id) || props.reduced
              ? false
              : { opacity: 0, y: 8, scale: 0.985 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: props.reduced ? 0 : 0.3,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <CardContent {...props} card={card} />
        </MotionCard>
      ))}
    </div>
  );
}
