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
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [running, state.focus.deadline]);
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
        <div
          className="result-progress"
          role="progressbar"
          aria-label="Waktu fokus yang telah berlalu"
          aria-valuemin={0}
          aria-valuemax={timer.total}
          aria-valuenow={Math.max(0, timer.total - timer.seconds)}
        >
          <span
            style={{
              width: `${timer.total ? Math.max(0, Math.min(100, 100 * (1 - timer.seconds / timer.total))) : 0}%`,
            }}
          />
        </div>
        {live && (
          <div className="result-actions">
            <button
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
            </button>
            <button
              disabled={pending || timer.total >= 10800}
              onClick={() => void action("timer-add")}
            >
              +1 menit
            </button>
            <button
              className="result-icon"
              aria-label="Akhiri sesi fokus"
              disabled={pending}
              onClick={() => void action("timer-end")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {notice}
      </>
    );
  }
  if (card.kind === "checklist") {
    const tasks = card.tasks.map((item) => ({
      ...item,
      live: state.tasks.find((task) => task.id === item.id),
    }));
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
            <label
              key={task.id}
              className="result-task"
              data-done={task.live?.done || false}
            >
              <input
                type="checkbox"
                checked={task.live?.done || false}
                disabled={!task.live || pending}
                onChange={() => void action("task-toggle", { taskId: task.id })}
              />
              <span className="result-checkbox" aria-hidden="true">
                {task.live?.done && <Check size={12} />}
              </span>
              <span>{task.live?.title || task.title}</span>
            </label>
          ))}
        </div>
        <div
          className="result-progress"
          role="progressbar"
          aria-label="Tugas selesai"
          aria-valuemin={0}
          aria-valuemax={tasks.length}
          aria-valuenow={done}
        >
          <span
            style={{
              width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
            }}
          />
        </div>
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
            <button
              disabled={pending}
              onClick={() => {
                setReminderTitle(title);
                setReminderDue(localDateInput(due));
                setEditing(true);
              }}
            >
              Ubah
            </button>
            <button
              disabled={pending}
              onClick={() => void action("reminder-cancel")}
            >
              Batalkan
            </button>
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
              <label>
                Pengingat
                <input
                  maxLength={240}
                  required
                  value={reminderTitle}
                  onChange={(event) => setReminderTitle(event.target.value)}
                />
              </label>
              <label>
                Waktu
                <input
                  type="datetime-local"
                  required
                  value={reminderDue}
                  onChange={(event) => setReminderDue(event.target.value)}
                />
              </label>
              <div className="result-actions">
                <button
                  className="result-primary"
                  disabled={pending}
                  type="submit"
                >
                  Simpan
                </button>
                <button type="button" onClick={() => setEditing(false)}>
                  Batal
                </button>
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
        <button
          className="result-primary"
          disabled={pending}
          onClick={() => void request("file-output", { operation: "open" })}
        >
          Buka file
        </button>
        <button
          className="result-icon"
          disabled={pending}
          aria-label={`Tampilkan ${card.name} di folder`}
          onClick={() => void request("file-output", { operation: "reveal" })}
        >
          <FolderOpen size={16} />
        </button>
        <button
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
        </button>
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

export function ResponseCards(props: Props) {
  return (
    <div className="response-cards">
      {props.message.cards?.map((card) => (
        <motion.section
          key={card.id}
          className={`response-card response-card-${card.kind}`}
          aria-label={
            card.kind === "timer"
              ? "Timer Bito"
              : card.kind === "reminder"
                ? "Pengingat Bito"
                : card.kind === "checklist"
                  ? "Checklist Bito"
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
        </motion.section>
      ))}
    </div>
  );
}
