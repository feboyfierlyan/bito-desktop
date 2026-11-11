import { useEffect, useId, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  CircleCheck,
  Circle,
  TriangleAlert,
  X,
  CalendarDays,
  Ban,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { BitoButton } from "./ui/controls";
import { RollingPercentage } from "./ui/RollingPercentage";
import { taskDateLabel } from "./task-capture";
import {
  workspaceTaskInsights,
  workspaceProjectProgress,
  type WorkspaceItem,
} from "./workspace-task-model";
import type { Project } from "./projects";
import type { TaskSelection } from "./WorkspaceTaskPanel";
export function WorkspaceInsights({
  items,
  today,
  projects,
  onProject,
  onAllProjects,
  busy = false,
  onSelect,
  onClose,
  reduced = false,
  scope = "Ringkasan semua tugas · proyek yang tidak diarsipkan",
  showProjects = true,
  showCondition = true,
}: {
  reduced?: boolean;
  scope?: string;
  showProjects?: boolean;
  showCondition?: boolean;
  items: WorkspaceItem[];
  today: string;
  projects: Project[];
  onProject: (project: Project) => void;
  onAllProjects: () => void;
  busy?: boolean;
  onSelect: (value: TaskSelection) => void;
  onClose: () => void;
}) {
  const data = workspaceTaskInsights(items, today);
  const [expanded, setExpanded] = useState(false);
  const moreTasksId = useId();
  const projectCountId = useId();
  const remaining = Math.max(0, data.attention.length - 5);
  useEffect(() => {
    if (!remaining) setExpanded(false);
  }, [remaining]);
  const projectRows = workspaceProjectProgress(projects, today);
  const attentionTask = (task: WorkspaceItem) => (
    <BitoButton
      key={`${task.projectId}-${task.id}`}
      className="insight-attention-task"
      onClick={() => onSelect({ id: task.id, projectId: task.projectId })}
    >
      <span>
        <span className="insight-attention-title">{task.title}</span>
        <small>
          {task.blocked ? (
            <>
              <Ban size={12} />
              Terhambat
            </>
          ) : (
            <>
              <CalendarDays size={12} />
              Terlewat · {taskDateLabel(task.date)}
            </>
          )}
        </small>
      </span>
    </BitoButton>
  );
  return (
    <aside
      className="workspace-insights"
      id="workspace-insights"
      aria-label="Ringkasan tugas"
    >
      <header>
        <h2>Ringkasan</h2>
        <BitoButton aria-label="Tutup ringkasan" onClick={onClose}>
          <X size={17} />
        </BitoButton>
      </header>
      <p className="insights-scope">{scope}</p>
      {showCondition && (
        <section
          className="insight-card insight-condition"
          aria-label="Kondisi Tugas"
        >
          <h3>Kondisi Tugas</h3>
          <div
            className={`insight-status ${data.attention.length ? "needs-attention" : !data.total ? "is-empty" : ""}`}
          >
            {data.attention.length ? (
              <TriangleAlert size={15} />
            ) : data.total ? (
              <CircleCheck size={15} />
            ) : (
              <Circle size={15} />
            )}
            <span>
              {data.attention.length
                ? "Perlu perhatian"
                : data.active
                  ? "Dalam kendali"
                  : data.total
                    ? "Semua selesai"
                    : "Belum ada tugas"}
            </span>
            {!!data.attention.length && (
              <span
                className="insight-status-count"
                aria-label={`${data.attention.length} tugas perlu perhatian`}
              >
                {data.attention.length}
              </span>
            )}
          </div>
          {!!data.attention.length && (
            <div className="insight-attention-list">
              {data.attention.slice(0, 5).map(attentionTask)}
              {!!remaining && (
                <>
                  <div
                    id={moreTasksId}
                    className="insight-more-tasks"
                    data-expanded={expanded}
                    data-reduced-motion={reduced}
                    inert={!expanded}
                    aria-hidden={!expanded}
                  >
                    <div className="insight-more-tasks-inner">
                      {data.attention.slice(5).map(attentionTask)}
                    </div>
                  </div>
                  <BitoButton
                    type="button"
                    className="insight-more-toggle"
                    aria-expanded={expanded}
                    aria-controls={moreTasksId}
                    onClick={() => setExpanded(!expanded)}
                  >
                    <span>
                      {expanded
                        ? "Tampilkan lebih sedikit"
                        : `Tampilkan ${remaining} tugas lagi`}
                    </span>
                    <ChevronDown size={15} aria-hidden="true" />
                  </BitoButton>
                </>
              )}
            </div>
          )}
        </section>
      )}
      <section className="insight-card">
        <h3>{showProjects ? "Progres keseluruhan" : "Progres proyek"}</h3>
        <AnimatedProgress
          percent={data.percent}
          done={data.done}
          total={data.total}
          reduced={reduced}
        />
        <div className="insight-counts">
          <span>
            <CircleCheck size={14} />
            {data.done} selesai
          </span>
          <span>
            <Circle size={14} />
            {data.active} tersisa
          </span>
        </div>
      </section>
      {showProjects && (
        <section
          className="insight-card insight-projects"
          aria-label="Progres per proyek"
        >
          <h3>Progres per proyek</h3>
          {projectRows.length ? (
            <ul className="insight-project-list">
              {projectRows
                .slice(0, 4)
                .map(({ project, done, total }, index) => (
                  <li key={project.id}>
                    <BitoButton
                      type="button"
                      className="insight-project-row"
                      disabled={busy}
                      onClick={() => onProject(project)}
                      aria-label={`Buka proyek ${project.name}`}
                      aria-describedby={`${projectCountId}-${index}`}
                    >
                      <span className="insight-project-copy">
                        <span className="insight-project-title">
                          {project.name}
                        </span>
                        <span
                          className="insight-project-count"
                          id={`${projectCountId}-${index}`}
                        >
                          {total
                            ? `${done} dari ${total} selesai`
                            : "Belum ada tugas"}
                        </span>
                        {!!total && (
                          <ProjectProgressBar
                            ratio={done / total}
                            index={index}
                            reduced={reduced}
                          />
                        )}
                      </span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </BitoButton>
                  </li>
                ))}
            </ul>
          ) : (
            <p>Belum ada proyek.</p>
          )}
          {projectRows.length > 4 && (
            <BitoButton
              type="button"
              className="insight-project-all"
              disabled={busy}
              onClick={onAllProjects}
            >
              Lihat semua proyek <ChevronRight size={14} aria-hidden="true" />
            </BitoButton>
          )}
        </section>
      )}
    </aside>
  );
}

// Fill and digit wheels share a duration; frame updates bypass React renders.
function AnimatedProgress({
  percent,
  done,
  total,
  reduced,
}: {
  percent: number;
  done: number;
  total: number;
  reduced: boolean;
}) {
  const progress = useMotionValue(reduced ? percent : 0);
  const fill = useTransform(progress, (value) => value / 100);
  useEffect(() => {
    if (reduced) {
      progress.set(percent);
      return;
    }
    const animation = animate(progress, percent, {
      duration: 0.95,
      ease: [0.2, 0.65, 0.2, 1],
    });
    return () => animation.stop();
  }, [percent, progress, reduced]);
  return (
    <>
      <strong className="insight-percent" aria-label={`${percent}%`}>
        <RollingPercentage value={percent} reduced={reduced} />
      </strong>
      <div
        className="insight-progress-track"
        role="progressbar"
        aria-label="Tugas selesai"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total || 1}
        aria-valuetext={`${done} dari ${total} tugas selesai · ${percent}%`}
      >
        <motion.span style={{ scaleX: fill }} />
      </div>
    </>
  );
}

function ProjectProgressBar({
  ratio,
  index,
  reduced,
}: {
  ratio: number;
  index: number;
  reduced: boolean;
}) {
  const fill = useMotionValue(reduced ? ratio : 0);
  useEffect(() => {
    if (reduced) {
      fill.set(ratio);
      return;
    }
    const animation = animate(fill, ratio, {
      duration: 0.65,
      delay: index * 0.045,
      ease: [0.22, 0.7, 0.2, 1],
    });
    return () => animation.stop();
  }, [reduced, index, ratio, fill]);
  return (
    <span className="insight-project-track" aria-hidden="true">
      <motion.span style={{ scaleX: fill }} />
    </span>
  );
}
