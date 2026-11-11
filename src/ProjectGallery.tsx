import { useId, useRef, useState } from "react";
import { ChevronRight, Check, FolderOpen, Search, X } from "lucide-react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { TaskListRowMotion } from "./WorkspaceTaskListMotion";
import { BitoButton, BitoInput } from "./ui/controls";
import { projectProgress, type Project } from "./projects";
import {
  filterWorkspaceProjects,
  workspaceOverview,
  type ProjectFilter,
} from "./workspace-overview";

const labels = {
  planning: "Disiapkan",
  active: "Berjalan",
  completed: "Selesai",
  archived: "Diarsipkan",
};
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
export function ProjectGallery({
  projects,
  onOpen,
  onCreate,
  busy,
  archives,
  activeId,
  name,
  reduced: reducedSetting = false,
}: {
  projects: Project[];
  onOpen: (project: Project) => void;
  onCreate: () => void;
  busy: boolean;
  archives: boolean;
  activeId?: string | null;
  name: string;
  reduced?: boolean;
}) {
  const reduced = useReducedMotion() || reducedSetting;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const search = useRef<HTMLInputElement>(null);
  const resultId = useId();
  const overview = workspaceOverview(projects, activeId);
  const visible = filterWorkspaceProjects(projects, query, filter, archives);
  const hasFilter = !!query.trim() || filter !== "all";
  return (
    <div
      className="workspace-task-columns workspace-directory-columns"
      data-insights="false"
      data-reduced-motion={!!reduced}
    >
      <div className="workspace-tasks workspace-directory">
        <header className="tasks-page-header">
          <div>
            <p className="workspace-day">
              {new Date().toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <h1>{archives ? "Arsip" : "Proyek"}</h1>
          </div>
        </header>
        {!archives && overview.current.length === 0 ? (
          <section
            className="workspace-first-project"
            aria-label="Cara mulai bersama Bito"
          >
            <h2>Dari tugas besar ke langkah kecil.</h2>
            <ol>
              <li>
                <span>01</span>
                <h3>Ceritakan tugasmu</h3>
                <p>Tulis tujuan atau lampirkan instruksinya.</p>
              </li>
              <li>
                <span>02</span>
                <h3>Susun langkah bersama</h3>
                <p>Tinjau rencana Bito sebelum mulai.</p>
              </li>
              <li>
                <span>03</span>
                <h3>Lanjut sedikit demi sedikit</h3>
                <p>Simpan progres dan lanjutkan kapan siap.</p>
              </li>
            </ol>
          </section>
        ) : (
          <section
            className="workspace-project-list"
            aria-label={archives ? "Daftar arsip" : "Daftar proyek"}
          >
            <div className="gallery-toolbar">
              {!archives && (
                <div
                  className="gallery-filters task-scope-tabs"
                  data-filter={filter}
                  role="group"
                  aria-label="Filter proyek"
                >
                  {(
                    [
                      ["all", "Semua"],
                      ["ongoing", "Belum selesai"],
                      ["completed", "Selesai"],
                    ] as const
                  ).map(([value, label]) => (
                    <BitoButton
                      key={value}
                      type="button"
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </BitoButton>
                  ))}
                </div>
              )}
              <div className="gallery-search">
                <Search size={15} />
                <BitoInput
                  ref={search}
                  label="Cari proyek"
                  placeholder="Cari proyek…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <BitoButton
                    aria-label="Hapus pencarian"
                    onClick={() => {
                      setQuery("");
                      search.current?.focus();
                    }}
                  >
                    <X size={14} />
                  </BitoButton>
                )}
              </div>
            </div>
            <p
              className="workspace-result-status"
              role="status"
              aria-atomic="true"
            >
              {hasFilter
                ? `${visible.length} proyek ditemukan`
                : `${visible.length} proyek`}
            </p>
            <div className="workspace-project-results" aria-busy={busy}>
              <AnimatePresence initial={false}>
                {visible.map((project, index) => {
                  const progress = projectProgress(project);
                  const percent = progress.total
                    ? Math.round((progress.done / progress.total) * 100)
                    : 0;
                  return (
                    <TaskListRowMotion
                      key={project.id}
                      index={index}
                      reduced={!!reduced}
                    >
                      <BitoButton
                        className="board-project-card"
                        aria-label={`Buka proyek ${project.name}`}
                        aria-describedby={`${resultId}-${index}-meta ${resultId}-${index}-progress`}
                        disabled={busy}
                        onClick={() => onOpen(project)}
                      >
                        <span className="project-list-symbol">
                          {project.status === "completed" ? (
                            <Check size={19} />
                          ) : (
                            <FolderOpen size={19} />
                          )}
                        </span>
                        <div className="board-project-caption">
                          <strong>{project.name}</strong>
                          <div
                            className="project-list-metadata"
                            id={`${resultId}-${index}-meta`}
                          >
                            <span
                              className="project-list-status"
                              data-status={project.status}
                            >
                              {labels[project.status]}
                            </span>
                            {project.deadline && (
                              <span>Tenggat {shortDate(project.deadline)}</span>
                            )}
                          </div>
                        </div>
                        <div
                          className="project-list-progress"
                          id={`${resultId}-${index}-progress`}
                        >
                          {progress.total ? (
                            <>
                              <span>
                                {progress.done}
                                <span> / {progress.total} tugas selesai</span>
                              </span>
                              <div
                                className="directory-progress-track"
                                role="progressbar"
                                aria-label={`Progres ${project.name}`}
                                aria-valuenow={percent}
                                aria-valuemin={0}
                                aria-valuemax={100}
                              >
                                <span style={{ width: `${percent}%` }} />
                              </div>
                            </>
                          ) : (
                            <span>Belum ada rencana</span>
                          )}
                        </div>
                        <ChevronRight
                          className="project-list-chevron"
                          size={15}
                        />
                      </BitoButton>
                    </TaskListRowMotion>
                  );
                })}
              </AnimatePresence>
              {!visible.length && (
                <div className="workspace-empty">
                  <FolderOpen size={24} />
                  <h3>
                    {hasFilter
                      ? "Belum ada yang cocok"
                      : archives
                        ? "Arsipmu masih kosong"
                        : "Ruang untuk hal berikutnya"}
                  </h3>
                  <p>
                    {hasFilter
                      ? "Coba nama lain atau tampilkan semua proyek."
                      : archives
                        ? "Proyek yang diarsipkan tetap tersimpan di sini."
                        : "Mulai dari tugas kecil. Bito bantu susun langkahnya."}
                  </p>
                  {hasFilter ? (
                    <BitoButton
                      variant="secondary"
                      onClick={() => {
                        setFilter("all");
                        setQuery("");
                        search.current?.focus();
                      }}
                    >
                      Tampilkan semua
                    </BitoButton>
                  ) : (
                    !archives && (
                      <BitoButton
                        variant="secondary"
                        disabled={busy}
                        onClick={onCreate}
                      >
                        Buat proyek pertama
                      </BitoButton>
                    )
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
