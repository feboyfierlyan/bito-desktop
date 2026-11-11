import { BitoDisclosure } from "./ui/BitoDisclosure";
import { BitoDateInput } from "./ui/controls";
import { BitoTextArea, BitoInput, BitoButton } from "./ui/controls";
import { useState } from "react";
import { ArrowUp, Paperclip, Square } from "lucide-react";
import Markdown from "react-markdown";
import { retryText } from "./message-meta";
import { api } from "./bridge";
import { projectMessages, type Project } from "./projects";
import type { Reply, Snapshot } from "./shared";
import { newTaskBrief } from "./project-presentation";

type Act = (name: string, payload?: unknown) => Promise<Reply>;
type Brief = Pick<
  Project,
  "name" | "brief" | "outcome" | "deadline" | "availability"
>;

export function NewTask({
  busy,
  onDirty,
  onCreate,
  onImport,
  onCancel,
}: {
  busy: boolean;
  onDirty: (v: boolean) => void;
  onCreate: (brief: Brief) => Promise<unknown>;
  onImport: (brief: Brief) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [sending, setSending] = useState(false);
  const locked = busy || sending;
  const submit = async (file = false) => {
    if (locked || (!file && !name.trim())) return;
    setSending(true);
    try {
      const brief = newTaskBrief(text || name, name, deadline);
      if (file) await onImport(brief);
      else await onCreate(brief);
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="task-intake">
      <p className="project-intro">
        Beri nama dulu. Langkahnya bisa kamu tambahkan setelah ini.
      </p>
      <form
        className="project-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <BitoInput
          label="Nama proyek"
          placeholder="Misalnya, Presentasi hari Jumat"
          maxLength={100}
          value={name}
          autoFocus
          disabled={locked}
          onChange={(e) => {
            setName(e.target.value);
            onDirty(!!text || !!e.target.value || !!deadline);
          }}
        />
        <BitoDisclosure className="project-disclosure">
          <summary>Tujuan & tenggat (opsional)</summary>
          <BitoTextArea
            label="Tujuan proyek"
            placeholder="Apa yang ingin kamu selesaikan?"
            rows={3}
            maxLength={4000}
            value={text}
            disabled={locked}
            onChange={(e) => {
              setText(e.target.value);
              onDirty(!!e.target.value || !!name || !!deadline);
            }}
          />
          <div className="bito-form-field">
            Tenggat
            <BitoDateInput
              label="Tenggat"
              value={deadline}
              disabled={locked}
              onValueChange={(e) => {
                setDeadline(e ?? "");
                onDirty(!!text || !!name || !!(e ?? ""));
              }}
            />
          </div>
        </BitoDisclosure>
        <div className="project-form-actions">
          <BitoButton
            className="project-primary"
            disabled={locked || !name.trim()}
          >
            Buat proyek
          </BitoButton>
          <BitoButton
            type="button"
            className="project-secondary"
            disabled={locked}
            onClick={() => void submit(true)}
          >
            <Paperclip size={15} /> Lampirkan instruksi
          </BitoButton>
          <BitoButton
            type="button"
            className="project-link"
            disabled={locked}
            onClick={onCancel}
          >
            Batal
          </BitoButton>
        </div>
        {locked && (
          <div className="task-processing" role="status">
            <span className="task-typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>{" "}
            Menyiapkan proyek…
            <BitoButton
              type="button"
              className="project-link"
              onClick={() => void api.command("stop")}
            >
              <Square size={12} /> Hentikan
            </BitoButton>
          </div>
        )}
      </form>
    </section>
  );
}

/** Only the current setup question belongs here; the workspace is not a second chat. */
export function SetupReply({
  project,
  state,
  act,
  busy,
  disabled,
}: {
  project: Project;
  state: Snapshot;
  act: Act;
  busy: boolean;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const messages = projectMessages(state.messages, project.id);
  const latest =
    messages.at(-1)?.role === "assistant" ? messages.at(-1) : undefined;
  const needsReply =
    !project.draft &&
    (!project.understanding || !!project.understanding.confirmedAt);
  const failed = latest?.status === "error" || latest?.status === "interrupted";
  const submit = async () => {
    if (!text.trim() || busy || sending || disabled) return;
    setSending(true);
    try {
      const r = await act("send", { text: text.trim() });
      if (r.ok) setText("");
    } finally {
      setSending(false);
    }
  };
  if (busy || sending)
    return (
      <div className="task-processing" role="status">
        <span className="task-typing" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>
          {project.understanding?.confirmedAt
            ? "Bito sedang menyusun langkahnya…"
            : "Bito sedang memahami tugasmu…"}
        </span>
        <BitoButton
          className="project-link"
          onClick={() => void api.command("stop")}
        >
          <Square size={12} /> Hentikan
        </BitoButton>
      </div>
    );
  if (!needsReply && !failed) return null;
  if (!latest?.text && !failed) return null;
  return (
    <section
      className="task-setup-reply"
      aria-label="Lanjutkan menyiapkan tugas"
    >
      <span className="project-eyebrow">BITO</span>
      {latest?.text && (
        <div className="task-setup-answer">
          <Markdown
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    if (href) void act("open-link", href);
                  }}
                >
                  {children}
                </a>
              ),
            }}
          >
            {latest.text}
          </Markdown>
        </div>
      )}
      {failed ? (
        <div role="alert">
          <p>
            {latest.status === "interrupted"
              ? "Proses dihentikan. Tugasmu tetap tersimpan."
              : "Belum selesai disiapkan. Tugasmu tetap tersimpan."}
          </p>
          <BitoButton
            className="project-secondary"
            disabled={disabled}
            onClick={() =>
              void act("send", {
                text:
                  retryText(state.messages, latest.id) ||
                  "Lanjutkan menyiapkan tugas ini dari bahan yang sudah tersedia.",
              })
            }
          >
            Coba lagi
          </BitoButton>
        </div>
      ) : (
        <form
          className="task-reply-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="sr-only" htmlFor="task-setup-answer">
            Balas Bito
          </label>
          <BitoInput
            id="task-setup-answer"
            value={text}
            maxLength={4000}
            placeholder="Balas Bito…"
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
          />
          <BitoButton
            className="project-primary"
            disabled={disabled || !text.trim()}
            aria-label="Kirim jawaban"
          >
            <ArrowUp size={16} />
          </BitoButton>
        </form>
      )}
    </section>
  );
}
