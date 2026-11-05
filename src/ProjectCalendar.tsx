import { Switch } from "@astryxdesign/core/Switch";
import { BitoButton } from "./ui/controls";
import { useRef, useState } from "react";
import { CalendarDays, LoaderCircle } from "lucide-react";
import type { Project } from "./projects";
import type { Reply } from "./shared";
import {
  automaticCalendarEntries,
  calendarSyncLabel,
  type CalendarConnection,
} from "./calendar";
import { WorkspaceDialog } from "./WorkspaceDialog";

export function ProjectCalendar({
  project,
  connection,
  act,
  onClose,
  reduced,
}: {
  project: Project;
  connection?: CalendarConnection;
  act: (name: string, payload?: unknown) => Promise<Reply>;
  onClose: () => void;
  reduced: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const held = useRef(false);
  const connected = connection?.status === "connected";
  const connecting = connection?.status === "connecting";
  const entries = automaticCalendarEntries(project);
  const run = async (name: string, payload?: unknown) => {
    if (held.current) return;
    held.current = true;
    setPending(true);
    setError("");
    try {
      const reply = await act(name, payload);
      if (!reply.ok) setError(reply.error || "Belum berhasil. Coba lagi.");
      else if (name === "show-settings") onClose();
    } catch {
      setError("Belum berhasil. Coba lagi.");
    } finally {
      held.current = false;
      setPending(false);
    }
  };
  return (
    <WorkspaceDialog
      title="Google Calendar"
      onClose={() => {
        if (!held.current) onClose();
      }}
      reduced={reduced}
    >
      <div className="calendar-review">
        <div className="calendar-connection-line">
          <CalendarDays size={18} />
          <span>
            {connected
              ? connection.email
              : connecting
                ? "Menunggu izin di browser…"
                : "Hubungkan Google Calendar."}
          </span>
          {connecting ? (
            <BitoButton
              disabled={pending}
              onClick={() => void run("calendar-cancel")}
            >
              Batal
            </BitoButton>
          ) : (
            !connected && (
              <BitoButton
                disabled={pending}
                onClick={() =>
                  void run(
                    connection?.configured
                      ? "calendar-connect"
                      : "show-settings",
                    connection?.configured ? undefined : "ai",
                  )
                }
              >
                {connection?.status === "expired"
                  ? "Hubungkan ulang"
                  : connection?.configured
                    ? "Hubungkan"
                    : "Buka Settings"}
              </BitoButton>
            )
          )}
        </div>
        <Switch
          className="calendar-auto-row bito-calendar-switch"
          label="Sinkronisasi otomatis"
          description="Rencana yang disetujui dan perubahan jadwal mengikuti Bito."
          labelPosition="start"
          labelSpacing="spread"
          value={!!connection?.automatic}
          isDisabled={pending || (!connected && !connection?.automatic)}
          onChange={(enabled) => void run("calendar-auto", { enabled })}
        />
        <div className="calendar-sync-status" role="status" aria-live="polite">
          {connection?.syncStatus === "syncing" && (
            <LoaderCircle size={14} className="calendar-spinner" />
          )}
          <span>{calendarSyncLabel(connection)}</span>
          {connection?.syncStatus === "error" && connected && (
            <BitoButton
              disabled={pending}
              onClick={() => void run("calendar-retry")}
            >
              Coba lagi
            </BitoButton>
          )}
        </div>
        {(error || connection?.error) && (
          <p className="workspace-error" role="alert">
            {error || connection?.error}
          </p>
        )}
        <div className="calendar-review-list">
          {entries.map((entry) => (
            <div
              className="calendar-review-entry calendar-readonly"
              key={entry.id}
            >
              <CalendarDays size={16} aria-hidden="true" />
              <span>
                <strong>{entry.title}</strong>
                <time dateTime={entry.date}>
                  {new Intl.DateTimeFormat("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }).format(new Date(`${entry.date}T12:00:00`))}
                </time>
              </span>
            </div>
          ))}
          {!entries.length && (
            <p>
              {project.status === "archived"
                ? "Jadwal yang sudah tersinkron tetap tersimpan di Google Calendar."
                : "Target akan muncul setelah rencana disetujui dan tanggalnya ditetapkan."}
            </p>
          )}
        </div>
        <p className="calendar-review-footnote">
          Berlaku untuk semua tugas yang disetujui. Target dan tenggat
          ditampilkan sepanjang hari di kalender utamamu. Mematikan sinkronisasi
          mempertahankan acara yang sudah ada.
        </p>
      </div>
    </WorkspaceDialog>
  );
}
