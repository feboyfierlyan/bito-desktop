import { useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Clock3,
  FolderOpen,
  Search,
  X,
} from "lucide-react";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { BitoButton, BitoInput } from "./ui/controls";
import { BitoMascot } from "./ui/BitoMascot";
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
}: {
  projects: Project[];
  onOpen: (project: Project) => void;
  onCreate: () => void;
  busy: boolean;
  archives: boolean;
  activeId?: string | null;
  name: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const search = useRef<HTMLInputElement>(null);
  const resultId = useId();
  const overview = workspaceOverview(projects, activeId);
  const visible = filterWorkspaceProjects(projects, query, filter, archives);
  const { focus, entry, session, review } = overview;
  const destination = focus || review;
  const hasFilter = !!query.trim() || filter !== "all";
  return (
    <div className="board-gallery workspace-home">
      {!archives && (
        <section className="workspace-intro" aria-label="Langkah berikutnya">
          <div className="workspace-greeting">
            <div>
              <p className="workspace-eyebrow">RUANG KERJAMU</p>
              <h2>
                {name.trim() ? `Hai, ${name.trim()}.` : "Hai, kita mulai?"}
              </h2>
              <p>Satu langkah kecil. Kita kerjakan bareng.</p>
            </div>
            <BitoMascot />
          </div>
          <div className="workspace-next">
            <div className="workspace-next-copy">
              <span className="workspace-eyebrow">
                {session
                  ? "SESI YANG BELUM SELESAI"
                  : entry
                    ? "LANGKAH BERIKUTNYA"
                    : focus
                      ? "SIAPKAN LANGKAHMU"
                      : review
                        ? "TINJAU RENCANAMU"
                        : overview.completed
                          ? "SUDAH KAMU SELESAIKAN"
                          : "MULAI DARI SINI"}
              </span>
              <h3>
                {entry?.objective ||
                  session?.objective ||
                  (focus
                    ? `Susun rencana ${focus.name}`
                    : review
                      ? "Cek progres sebelum melangkah lagi."
                      : overview.completed
                        ? "Semua proyekmu sudah selesai."
                        : "Ada yang ingin kamu selesaikan?")}
              </h3>
              <p>
                {destination
                  ? review
                    ? `${review.name} · Belum ada langkah yang siap dikerjakan. Tinjau tugas yang tertahan atau tandai proyek selesai.`
                    : destination.name
                  : overview.completed
                    ? "Kamu bisa melihat hasilnya di bawah, atau mulai proyek baru saat siap."
                    : "Ceritakan tugasmu. Bito bantu pecah jadi langkah yang bisa dikerjakan."}
              </p>
              {entry && (
                <span className="workspace-estimate">
                  <Clock3 size={14} />
                  {entry.estimateLabel.replace("Perkiraan langkah: ", "")}
                </span>
              )}
            </div>
            <BitoButton
              type="button"
              className="workspace-next-action"
              variant="primary"
              disabled={busy}
              onClick={() => (destination ? onOpen(destination) : onCreate())}
            >
              {focus
                ? session
                  ? "Kembali ke sesi"
                  : entry
                    ? "Lihat langkah"
                    : "Susun rencana"
                : review
                  ? "Tinjau proyek"
                  : "Tambah proyek"}
              <ArrowRight size={16} />
            </BitoButton>
          </div>
        </section>
      )}
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
          <div className="workspace-list-heading">
            <div>
              <h2>{archives ? "Disimpan untuk nanti" : "Proyekmu"}</h2>
              <p>
                {archives
                  ? "Buka kembali kapan pun kamu butuh."
                  : `${overview.ongoing.length} belum selesai · ${overview.completed} selesai`}
              </p>
            </div>
          </div>
          <div className="gallery-toolbar">
            {!archives && (
              <div
                className="gallery-filters"
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
            {visible.map((project, index) => {
              const progress = projectProgress(project);
              const percent = progress.total
                ? Math.round((progress.done / progress.total) * 100)
                : 0;
              return (
                <BitoButton
                  key={project.id}
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
                    <span>
                      {project.outcome ||
                        project.brief ||
                        "Satu tempat untuk rencana dan langkahmu."}
                    </span>
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
                        <ProgressBar
                          label={`Progres ${project.name}`}
                          value={percent}
                          isLabelHidden
                        />
                      </>
                    ) : (
                      <span>Belum ada rencana</span>
                    )}
                  </div>
                  <ArrowUpRight className="project-list-chevron" size={17} />
                </BitoButton>
              );
            })}
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
  );
}
