import { BitoMascot } from "./ui/BitoMascot";
import { BitoButton, BitoTextArea, BitoInput } from "./ui/controls";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Pause, Play, Square, LoaderCircle } from "lucide-react";
import type { Project, WorkSession } from "./projects";
import type { Reply } from "./shared";
import {
  openProjectSession,
  projectWorkEntry,
  sessionElapsed,
} from "./project-work";

type Act = (name: string, payload?: unknown) => Promise<Reply>;
export function ProjectSessionBar({
  project,
  projects,
  act,
  busy,
  onDirty,
  reduced,
  taskId,
  compact = false,
}: {
  project: Project;
  projects: Project[];
  act: Act;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  reduced: boolean;
  taskId?: string;
  compact?: boolean;
}) {
  const session = openProjectSession(project);
  const entry = projectWorkEntry(project, session?.taskId || taskId);
  const other = projects.find(
    (p) => p.id !== project.id && openProjectSession(p),
  );
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const held = useRef(false);
  useEffect(() => {
    setNow(Date.now());
    if (session?.phase !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.id, session?.phase, session?.minutes]);
  const perform = async (operation: () => Promise<Reply>) => {
    if (held.current || busy) return;
    held.current = true;
    setPending(true);
    setError("");
    try {
      const reply = await operation();
      if (!reply.ok) setError(reply.error || "Belum berhasil. Coba lagi.");
    } catch {
      setError("Belum berhasil. Coba lagi.");
    } finally {
      held.current = false;
      setPending(false);
    }
  };
  if (project.status !== "active" || !project.plan || (!session && !entry))
    return null;
  const locked = busy || pending;
  const elapsed = session ? Math.floor(sessionElapsed(session, now) / 1000) : 0;
  return (
    <motion.section
      className={`board-work-session ${!session ? "is-idle" : ""} ${compact ? "is-compact" : ""}`}
      aria-label="Sesi bersama Bito"
      initial={{ opacity: 0, y: reduced ? 0 : 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
    >
      {!(compact && !session) && (
        <>
          <BitoMascot className="session-mascot" />
          <div className="board-session-copy">
            <small>
              {session?.phase === "running"
                ? "Lagi dikerjakan"
                : session?.phase === "paused"
                  ? "Dijeda · lanjut kapan kamu siap"
                  : session?.phase === "review"
                    ? "Gimana hasilnya?"
                    : entry?.continuing
                      ? "Lanjut dari titik terakhir"
                      : "Satu langkah dulu"}
            </small>
            <strong>
              {session
                ? entry?.checkpoint?.nextStep || session.objective
                : entry?.objective}
            </strong>
            {entry && <small>{entry.estimateLabel}</small>}
            {!session && entry?.checkpoint?.lastStop && (
              <p className="board-session-stop">
                Terakhir: {entry.checkpoint.lastStop}
              </p>
            )}
          </div>
        </>
      )}
      {compact && !session && entry?.checkpoint?.lastStop && (
        <p className="board-session-stop">
          Terakhir: {entry.checkpoint.lastStop}
        </p>
      )}
      {session && session.phase === "running" && (
        <time
          className="board-session-time"
          aria-label={session.minutes === null ? "Waktu sesi" : "Sisa sesi"}
        >
          {Math.floor(
            (session.minutes === null
              ? elapsed
              : Math.max(0, session.minutes * 60 - elapsed)) / 60,
          )}
          :
          {String(
            (session.minutes === null
              ? elapsed
              : Math.max(0, session.minutes * 60 - elapsed)) % 60,
          ).padStart(2, "0")}
        </time>
      )}
      <div className="board-session-actions">
        {pending && (
          <LoaderCircle
            size={16}
            className="calendar-spinner"
            aria-label="Memproses"
          />
        )}
        {session?.phase === "running" && (
          <>
            <BitoButton
              disabled={locked}
              onClick={() =>
                void perform(() =>
                  act("project-work-pause", {
                    id: project.id,
                    sessionId: session.id,
                  }),
                )
              }
            >
              <Pause size={14} />
              Jeda
            </BitoButton>
            <BitoButton
              disabled={locked}
              onClick={() =>
                void perform(() =>
                  act("project-work-finish", {
                    id: project.id,
                    sessionId: session.id,
                  }),
                )
              }
            >
              <Square size={13} />
              Simpan progres
            </BitoButton>
          </>
        )}
        {!session && entry && (
          <BitoButton
            className="project-primary"
            disabled={locked || !!other}
            onClick={() =>
              void perform(() =>
                act("project-work-start", {
                  id: project.id,
                  taskId: entry.task.id,
                  objective: entry.objective,
                  minutes: null,
                }),
              )
            }
          >
            <Play size={14} />
            {entry.continuing ? "Lanjut fokus" : "Mulai fokus"}
          </BitoButton>
        )}
      </div>
      {session && session.phase !== "running" && (
        <SessionNote
          key={`${session.id}-${session.phase}`}
          project={project}
          session={session}
          act={act}
          locked={locked}
          perform={perform}
          onDirty={onDirty}
          reduced={reduced}
        />
      )}
      {other && !session && (
        <p className="board-session-hint">
          Masih ada sesi di {other.name}. Lanjutkan atau akhiri sesi itu dahulu.
        </p>
      )}
      {error && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}
    </motion.section>
  );
}

function SessionNote({
  project,
  session,
  act,
  locked,
  perform,
  onDirty,
  reduced,
}: {
  project: Project;
  session: WorkSession;
  act: Act;
  locked: boolean;
  perform: (operation: () => Promise<Reply>) => Promise<void>;
  onDirty: (dirty: boolean) => void;
  reduced: boolean;
}) {
  const saved =
    project.checkpoint?.taskId === session.taskId ? project.checkpoint : null;
  const initial = useRef({
    note: saved?.lastStop || "",
    nextStep: saved?.nextStep || "",
    stamp: project.checkpoint?.updatedAt ?? null,
  });
  const [note, setNote] = useState(initial.current.note);
  const [nextStep, setNextStep] = useState(initial.current.nextStep);
  const [outcome, setOutcome] = useState<"partial" | "done" | "blocked">(
    "partial",
  );
  const [savedNotice, setSavedNotice] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (
      dirty ||
      (project.checkpoint?.updatedAt ?? 0) < (initial.current.stamp ?? 0)
    )
      return;
    initial.current = {
      note: saved?.lastStop || "",
      nextStep: saved?.nextStep || "",
      stamp: project.checkpoint?.updatedAt ?? null,
    };
    setNote(initial.current.note);
    setNextStep(initial.current.nextStep);
  }, [project.checkpoint?.updatedAt, saved?.lastStop, saved?.nextStep, dirty]);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const update = (value: string, field: "note" | "nextStep") => {
    if (field === "note") setNote(value);
    else setNextStep(value);
    setSavedNotice(false);
    setDirty(true);
  };
  const checkpoint = async (): Promise<Reply> => {
    if (!dirty) return { ok: true };
    const reply = await act("project-work-checkpoint", {
      id: project.id,
      sessionId: session.id,
      note,
      nextStep,
      expectedCheckpointAt: initial.current.stamp,
    });
    if (reply.ok) {
      const stamp = (reply.value as { updatedAt: number }).updatedAt;
      initial.current = { note: note.trim(), nextStep: nextStep.trim(), stamp };
      setDirty(false);
      setSavedNotice(true);
    }
    return reply;
  };
  const continueWork = () =>
    perform(async () => {
      const reply = await checkpoint();
      if (!reply.ok) return reply;
      return act("project-work-resume", {
        id: project.id,
        sessionId: session.id,
      });
    });
  return (
    <motion.form
      className="board-session-note"
      initial={{ opacity: 0, y: reduced ? 0 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.18 }}
      onSubmit={(e) => {
        e.preventDefault();
        void perform(async () => {
          if (session.phase === "paused") return checkpoint();
          const reply = await act("project-work-report", {
            id: project.id,
            sessionId: session.id,
            outcome,
            note,
            nextStep: outcome === "done" ? "" : nextStep,
          });
          if (reply.ok) {
            setDirty(false);
            onDirty(false);
          }
          return reply;
        });
      }}
    >
      {session.phase === "review" && (
        <div
          className="board-session-outcomes"
          role="group"
          aria-label="Hasil sesi"
        >
          {(
            [
              ["partial", "Belum selesai"],
              ["done", "Langkah selesai"],
              ["blocked", "Lagi mentok"],
            ] as const
          ).map(([value, label]) => (
            <BitoButton
              key={value}
              type="button"
              aria-pressed={outcome === value}
              disabled={locked}
              onClick={() => {
                setOutcome(value);
                setDirty(true);
              }}
            >
              {label}
            </BitoButton>
          ))}
        </div>
      )}
      <div className="bito-form-field">
        {outcome === "blocked" ? "Mentok di mana?" : "Sampai mana?"}
        <BitoTextArea
          label={outcome === "blocked" ? "Mentok di mana?" : "Sampai mana?"}
          rows={2}
          maxLength={1000}
          value={note}
          disabled={locked}
          placeholder="Misalnya, tiga poin perbandingan sudah ditulis"
          required={outcome === "blocked"}
          onChange={(e) => update(e.target.value, "note")}
        />
      </div>
      {outcome !== "done" && (
        <details className="session-next-step">
          <summary>Langkah berikutnya (opsional)</summary>
          <div className="bito-form-field">
            Nanti lanjut apa?
            <BitoInput
              label="Nanti lanjut apa?"
              maxLength={1000}
              value={nextStep}
              disabled={locked}
              placeholder="Misalnya, tambahkan contoh untuk poin terakhir"
              onChange={(e) => update(e.target.value, "nextStep")}
            />
          </div>
        </details>
      )}
      <div className="board-session-actions">
        {session.phase === "paused" && (
          <BitoButton
            type="button"
            className="project-primary"
            disabled={locked}
            onClick={() => void continueWork()}
          >
            <Play size={14} />
            Lanjut bareng Bito
          </BitoButton>
        )}
        <BitoButton
          type="submit"
          className={session.phase === "review" ? "project-primary" : undefined}
          disabled={locked || (session.phase === "paused" && !dirty)}
        >
          {session.phase === "paused" ? "Simpan catatan" : "Simpan hasil"}
        </BitoButton>
        {session.phase === "paused" && (
          <BitoButton
            type="button"
            disabled={locked}
            onClick={() =>
              void perform(async () => {
                const reply = await checkpoint();
                if (!reply.ok) return reply;
                return act("project-work-finish", {
                  id: project.id,
                  sessionId: session.id,
                });
              })
            }
          >
            Simpan progres
          </BitoButton>
        )}
        {savedNotice && !dirty && <small role="status">Tersimpan</small>}
      </div>
    </motion.form>
  );
}
