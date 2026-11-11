import { useEffect, useRef, useState } from "react";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { Popover } from "@astryxdesign/core/Popover";
import { Calendar, type ISODateString } from "@astryxdesign/core/Calendar";
import {
  CalendarDays,
  Sun,
  Sunrise,
  CalendarRange,
  X,
  Flag,
  Hash,
  Inbox,
} from "lucide-react";
import { BitoButton, BitoInput, BitoTextArea, BitoSelect } from "./ui/controls";
import { localDateKey } from "./project-board";
import { taskCaptureCommand, taskDateLabel } from "./task-capture";
import type { Project } from "./projects";
import type { Reply } from "./shared";

export function TaskDatePicker({
  value,
  onChange,
  disabled = false,
  max,
  label = "Tanggal tugas",
  completed = false,
  inherited = false,
}: {
  value?: string | null;
  onChange: (date: string | null) => void;
  disabled?: boolean;
  max?: string | null;
  label?: string;
  completed?: boolean;
  inherited?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const overdue = !!value && !completed && value < localDateKey(new Date());
  const choose = (date: string | null) => {
    onChange(date);
    setOpen(false);
  };
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return localDateKey(d);
  };
  return (
    <Popover
      label="Tanggal tugas"
      isOpen={open}
      onOpenChange={setOpen}
      placement="below"
      alignment="start"
      width={304}
      content={
        <div className="task-date-popover">
          <strong>Tanggal tugas</strong>
          {[
            [0, "Hari ini", Sun],
            [1, "Besok", Sunrise],
            [7, "Minggu depan", CalendarRange],
          ].map(([offset, label, Icon]) => {
            const d = day(offset as number);
            const Glyph = Icon as typeof Sun;
            return (
              <BitoButton
                type="button"
                key={offset as number}
                disabled={!!max && d > max}
                onClick={() => choose(d)}
              >
                <Glyph size={16} />
                <span>{label as string}</span>
                <small>{taskDateLabel(d)}</small>
              </BitoButton>
            );
          })}
          <div className="task-calendar-grid">
            <InternationalizationProvider
              locale="id-ID"
              overrides={{
                "id-ID": {
                  "@astryx.calendar.previousMonth": "Bulan sebelumnya",
                  "@astryx.calendar.nextMonth": "Bulan berikutnya",
                },
              }}
            >
              <Calendar
                value={(value || null) as ISODateString | null}
                max={(max || undefined) as ISODateString | undefined}
                weekStartsOn="mon"
                onChange={(date) => choose(date)}
              />
            </InternationalizationProvider>
          </div>
          <BitoButton type="button" onClick={() => choose(null)}>
            <X size={15} />
            Tanpa tanggal
          </BitoButton>
        </div>
      }
    >
      <BitoButton
        type="button"
        aria-label={`${label}: ${taskDateLabel(value)}`}
        className={`task-chip ${value ? "has-date" : ""} ${overdue ? "is-overdue" : ""}`}
        title={[
          inherited && value ? "Mengikuti tanggal kelompok" : "Tanggal tugas",
          overdue ? "Terlewat" : "",
        ]
          .filter(Boolean)
          .join(" · ")}
        disabled={disabled}
      >
        <CalendarDays size={15} />
        {taskDateLabel(value)}
      </BitoButton>
    </Popover>
  );
}

export function TaskComposer({
  projects,
  initialProjectId = "",
  initialMilestoneId = "",
  initialDueDate = null,
  act,
  onSaved,
  onCancel,
  onDirty,
  busy = false,
  inline = false,
}: {
  projects: Project[];
  initialProjectId?: string;
  initialMilestoneId?: string;
  initialDueDate?: string | null;
  act: (name: string, payload?: unknown) => Promise<Reply>;
  onSaved: () => void;
  onCancel: () => void;
  onDirty?: (dirty: boolean) => void;
  busy?: boolean;
  inline?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(initialDueDate);
  const [priority, setPriority] = useState("4");
  const [projectId, setProjectId] = useState(initialProjectId);
  const [groupId, setGroupId] = useState(initialMilestoneId);
  const [discarding, setDiscarding] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const held = useRef(false);
  const project = projects.find((p) => p.id === projectId);
  const groups = project?.plan?.milestones || [];
  const selectedGroup =
    groups.find((m) => m.id === groupId) ||
    groups.find((m) => m.tasks.length < 12);
  const locked = busy || pending;
  const dirty =
    !!title.trim() ||
    !!details.trim() ||
    dueDate !== initialDueDate ||
    priority !== "4" ||
    projectId !== initialProjectId ||
    groupId !== initialMilestoneId;
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);
  async function save() {
    if (held.current || locked || !title.trim()) return;
    held.current = true;
    setPending(true);
    setError("");
    try {
      if (projectId && !project)
        throw Error("Proyek ini sudah tidak tersedia. Pilih proyek lain.");
      const command = taskCaptureCommand(
        { title, details, dueDate, priority: Number(priority) },
        project,
        selectedGroup?.id,
      );
      const result = await act(command.name, command.payload);
      if (!result.ok)
        throw Error(result.error || "Tugas belum tersimpan. Coba lagi.");
      onDirty?.(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tugas belum tersimpan.");
    } finally {
      held.current = false;
      setPending(false);
    }
  }
  return (
    <form
      className={`task-composer ${inline ? "is-inline" : ""}`}
      aria-label="Tambah tugas"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <BitoInput
        className="task-title-input"
        label="Nama tugas"
        placeholder="Nama tugas"
        value={title}
        autoFocus
        maxLength={200}
        disabled={locked}
        onChange={(e) => setTitle(e.target.value)}
      />
      <details className="capture-options">
        <summary>Detail tambahan</summary>
        <BitoTextArea
          className="task-description-input"
          label="Deskripsi tugas"
          placeholder="Deskripsi"
          rows={2}
          maxLength={1000}
          value={details}
          disabled={locked}
          onChange={(e) => setDetails(e.target.value)}
        />
        <div className="task-composer-properties">
          <TaskDatePicker
            value={dueDate}
            onChange={setDueDate}
            max={project?.deadline}
            disabled={locked}
          />
          <div className="task-property-select" data-priority={priority}>
            <Flag size={15} />
            <BitoSelect
              label="Prioritas tugas"
              value={priority}
              disabled={locked}
              onValueChange={setPriority}
            >
              <option value="4">Tanpa prioritas</option>
              <option value="1">P1 · Tinggi</option>
              <option value="2">P2 · Sedang</option>
              <option value="3">P3 · Rendah</option>
            </BitoSelect>
          </div>
        </div>
      </details>
      {error && (
        <p className="task-capture-error" role="alert">
          {error}
        </p>
      )}
      <footer className="task-composer-footer">
        {!inline && (
          <div className="task-location">
            <span>{project ? <Hash size={15} /> : <Inbox size={15} />}</span>
            <BitoSelect
              label="Proyek tugas"
              value={projectId}
              disabled={locked}
              onValueChange={(id) => {
                setProjectId(id);
                setGroupId("");
              }}
            >
              <option value="">Tugas singkat</option>
              {projects
                .filter(
                  (p) => p.status !== "archived" && p.status !== "completed",
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </BitoSelect>
            {groups.length > 0 && (
              <BitoSelect
                label="Kelompok tugas"
                value={selectedGroup?.id || ""}
                disabled={locked}
                onValueChange={setGroupId}
              >
                {groups.map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                    disabled={m.tasks.length >= 12}
                  >
                    {m.title}
                  </option>
                ))}
              </BitoSelect>
            )}
          </div>
        )}
        <div className="task-composer-actions">
          <BitoButton
            type="button"
            variant="secondary"
            disabled={locked}
            onClick={() => (dirty ? setDiscarding(true) : onCancel())}
          >
            Batal
          </BitoButton>
          <BitoButton
            type="submit"
            variant="primary"
            disabled={
              locked ||
              !title.trim() ||
              !!project?.draft ||
              (!!project?.plan && !selectedGroup)
            }
            isLoading={pending}
          >
            Tambah tugas
          </BitoButton>
        </div>
      </footer>
      {discarding && (
        <div className="task-discard" role="alert">
          <span>Abaikan tugas yang belum disimpan?</span>
          <BitoButton type="button" onClick={() => setDiscarding(false)}>
            Lanjut edit
          </BitoButton>
          <BitoButton type="button" onClick={onCancel}>
            Abaikan
          </BitoButton>
        </div>
      )}
      {project?.draft && (
        <p className="task-capture-error">
          Periksa draf proyek sebelum menambahkan tugas.
        </p>
      )}
    </form>
  );
}
