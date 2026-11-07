import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Check, Circle, Flag } from "lucide-react";
import { dailyProjectProgress, type Project } from "./projects";
import { dayNumber, projectDashboard } from "./project-work";
import "./project-visuals.css";

export const projectDateLabel = (value: string | null) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      })
    : "Tanpa tanggal";
export function ProjectProgressVisual({
  project,
  compact = false,
}: {
  project: Project;
  compact?: boolean;
}) {
  const d = projectDashboard(project);
  return (
    <div className={`pv-progress ${compact ? "compact" : ""}`}>
      <div className="pv-progress-heading">
        <strong>
          {d.percent}
          <small>%</small>
        </strong>
        <span>
          {d.done} / {d.total} langkah selesai
        </span>
      </div>
      <ProgressBar
        className="bito-project-progress"
        label="Langkah selesai"
        isLabelHidden
        value={d.done}
        max={Math.max(1, d.total)}
      />
      <div className="pv-progress-foot">
        <span>
          {d.blocked
            ? `${d.blocked} tertahan`
            : project.status === "completed"
              ? "Tugas selesai"
              : project.status === "archived"
                ? "Diarsipkan"
                : "Rencana aktif"}
        </span>
        <span>
          <Flag size={11} />
          {project.deadline
            ? `${projectDateLabel(project.deadline)} · ${d.daysLeft! < 0 ? `lewat ${-d.daysLeft!} hari` : d.daysLeft === 0 ? "hari ini" : `${d.daysLeft} hari lagi`}`
            : "Tenggat belum diisi"}
        </span>
      </div>
    </div>
  );
}

export function ProjectTimeline({
  project,
  compact = false,
}: {
  project: Project;
  compact?: boolean;
}) {
  const d = projectDashboard(project);
  const milestones = project.plan?.milestones || [];
  if (compact)
    return (
      <div className="pv-mini-timeline">
        {milestones.slice(0, 4).map((m) => {
          const done = m.tasks.filter((t) => t.status === "done").length;
          const complete = m.tasks.length > 0 && done === m.tasks.length;
          return (
            <div key={m.id}>
              <span className={complete ? "pv-dot done" : "pv-dot"}>
                {complete && <Check size={9} />}
              </span>
              <span>{m.title}</span>
              <small>
                {done}/{m.tasks.length}
              </small>
              <time>{projectDateLabel(m.targetDate)}</time>
            </div>
          );
        })}
        {milestones.length > 4 && (
          <small>+{milestones.length - 4} milestone lainnya</small>
        )}
      </div>
    );
  const dates = milestones.flatMap((m) => (m.targetDate ? [m.targetDate] : []));
  if (project.deadline) dates.push(project.deadline);
  dates.push(d.today);
  const start = Math.min(...dates.map(dayNumber)) - 1;
  const end = Math.max(...dates.map(dayNumber)) + 1;
  const pos = (date: string) =>
    ((dayNumber(date) - start) / Math.max(1, end - start)) * 100;
  return (
    <section
      className="pv-timeline"
      aria-label="Timeline tanggal target milestone"
    >
      <header>
        <h3>Timeline</h3>
        <span>Urutan target</span>
      </header>
      <div className="pv-timeline-axis">
        <span>
          {projectDateLabel(
            new Date(start * 86400000).toISOString().slice(0, 10),
          )}
        </span>
        <span>
          {projectDateLabel(
            new Date(end * 86400000).toISOString().slice(0, 10),
          )}
        </span>
      </div>
      <div className="pv-timeline-tracks">
        <div
          className="pv-today-line"
          style={{
            left: `calc(140px + (100% - 140px) * ${pos(d.today) / 100})`,
          }}
        >
          <span>Hari ini</span>
        </div>
        {project.deadline && (
          <div
            className="pv-deadline-line"
            style={{
              left: `calc(140px + (100% - 140px) * ${pos(project.deadline) / 100})`,
            }}
            title={`Tenggat ${projectDateLabel(project.deadline)}`}
          />
        )}
        {milestones.map((m) => {
          const done = m.tasks.filter((t) => t.status === "done").length;
          const complete = m.tasks.length > 0 && done === m.tasks.length;
          const late = !complete && !!m.targetDate && m.targetDate < d.today;
          return (
            <div className="pv-timeline-row" key={m.id}>
              <div className="pv-milestone-name" title={m.title}>
                <strong>{m.title}</strong>
                <small>
                  {done}/{m.tasks.length}
                  {late
                    ? " · lewat target"
                    : complete
                      ? " · selesai"
                      : " · terbuka"}
                </small>
              </div>
              <div className="pv-track">
                {m.targetDate ? (
                  <span
                    className={`pv-target ${complete ? "done" : late ? "late" : ""}`}
                    style={{ left: `${pos(m.targetDate)}%` }}
                    title={`${m.title}: ${projectDateLabel(m.targetDate)}`}
                  >
                    <i>
                      {complete ? <Check size={11} /> : <Circle size={9} />}
                    </i>
                    <time>{projectDateLabel(m.targetDate)}</time>
                  </span>
                ) : (
                  <span className="pv-undated">Belum dijadwalkan</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {project.deadline && (
        <div className="pv-timeline-legend">
          <i /> Tenggat · {projectDateLabel(project.deadline)}
        </div>
      )}
    </section>
  );
}

export function ProjectHistory({ project }: { project: Project }) {
  const history = dailyProjectProgress(project);
  const rows = history.slice(-80);
  const first = rows[0]?.at || Date.now();
  const last = Math.max(Date.now(), first + 86400000);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.total, r.done)));
  const points = rows.map((r) => ({
    ...r,
    x: 10 + ((r.at - first) / Math.max(1, last - first)) * 380,
    y: 86 - (r.done / max) * 70,
  }));
  const path = points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  return (
    <section
      className="pv-history"
      aria-label="Grafik riwayat progres berdasarkan laporan nyata"
    >
      <header>
        <h3>Progresmu</h3>
        <span>Langkah selesai · per hari</span>
      </header>
      {points.length ? (
        <>
          <svg
            viewBox="0 0 400 102"
            role="img"
            aria-label={`Progres ${rows.length} hari, terakhir ${rows.at(-1)!.done} langkah selesai`}
          >
            {[16, 51, 86].map((y) => (
              <line key={y} x1="10" x2="390" y1={y} y2={y} stroke="var(--bito-hairline)" />
            ))}
            {points.length > 1 && (
              <path
                d={path}
                fill="none"
                stroke="var(--bito-ink)"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
            )}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={i === points.length - 1 ? 4 : 2.5}
                fill="var(--bito-ink)"
              >
                <title>
                  {new Date(p.at).toLocaleString("id-ID")}: {p.done}/{p.total}{" "}
                  selesai
                </title>
              </circle>
            ))}
          </svg>
          <div className="pv-history-labels">
            <span>
              {new Date(first).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
              })}
            </span>
            <span>Hari ini</span>
          </div>
          {points.length === 1 && (
            <p>Grafik bertambah saat kamu melaporkan progres.</p>
          )}
        </>
      ) : (
        <p>Riwayat mulai dicatat dari pembaruan progres berikutnya.</p>
      )}
    </section>
  );
}
