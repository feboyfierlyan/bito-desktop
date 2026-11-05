import { BitoDisclosure } from "./ui/BitoDisclosure";
import { AppShell } from "@astryxdesign/core/AppShell";
import { BitoDateInput, BitoSelect } from "./ui/controls";
import { Badge } from "@astryxdesign/core/Badge";
import { BitoButton, BitoInput, BitoTextArea } from "./ui/controls";
import { SavedWorkDirectory } from "./SavedWorkDirectory";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Plus,
  ListChecks,
  FolderOpen,
  Paperclip,
  Check,
  Archive,
  X,
  Square,
  Pencil,
  Home,
  CalendarDays,
  ListFilter,
  Sprout,
  Settings2,
} from "lucide-react";
import { api } from "./bridge";
import type { Reply, Snapshot } from "./shared";
import {
  activeProject,
  projectProgress,
  projectSetupPrompt,
  type Project,
  type ProjectPlan,
  type TaskUnderstanding,
} from "./projects";
import { ProjectOverview } from "./ProjectOverview";
import { ProjectRoadmap } from "./ProjectRoadmap";
import { planDateChanges } from "./project-work";
import { NewTask, SetupReply } from "./ProjectIntake";
import "./projects.css";
import "./project-simple.css";
import { ProjectBoard, ProjectGallery } from "./ProjectBoard";
import { WorkspaceDialog } from "./WorkspaceDialog";
import "./project-board.css";
type Act = (name: string, payload?: unknown) => Promise<Reply>;
const date = (value: string | null) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Belum ditentukan";
const blank = {
  name: "",
  brief: "",
  outcome: "",
  deadline: null as string | null,
  availability: "",
};
const statusLabel = {
  planning: "Disiapkan",
  active: "Berjalan",
  completed: "Selesai",
  archived: "Arsip",
};
type View = "overview" | "understanding" | "plan" | "brief" | "materials";
export function ProjectWindow({ state, act }: { state: Snapshot; act: Act }) {
  // Viewing an archive must never change the active chat/project context.
  const [viewedArchiveId, setViewedArchiveId] = useState<string | null>(null);
  const project =
    state.projects.find((p) => p.id === viewedArchiveId) ||
    activeProject(state);
  const [quickView, setQuickView] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<
    "projects" | "schedule" | "priority"
  >("projects");
  const [preparing, setPreparing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [gallery, setGallery] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [tab, setTab] = useState<View>("overview");
  const [archives, setArchives] = useState(false),
    [error, setError] = useState("");
  const [pending, setPending] = useState(false),
    [dirty, setDirty] = useState(false),
    [closing, setClosing] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useEffect(
    () =>
      api.onSettingsClose?.(() => {
        if (dirtyRef.current) setClosing(true);
        else void api.command("settings-close-ready");
      }),
    [],
  );
  useEffect(() => {
    setTab("overview");
    setPreparing(false);
    setDirty(false);
    setError("");
    if (!project) {
      setGallery(true);
      setDetailOpen(false);
    }
  }, [project?.id]);
  useEffect(() => {
    if (project?.plan) {
      setPreparing(false);
      setTab("overview");
      setDirty(false);
    }
  }, [project?.plan?.id]);
  useEffect(() => {
    if (state.quickTasksNavigation) {
      if (dirtyRef.current) {
        setError("Simpan perubahan atau batalkan edit dahulu.");
        return;
      }
      setGallery(false);
      setDetailOpen(false);
      setQuickView(true);
      setWorkspaceView("projects");
      setCreating(false);
    }
  }, [state.quickTasksNavigation]);
  useEffect(() => {
    if (!state.projectCreationNavigation) return;
    change(() => {
      setCreating(true);
      setQuickView(false);
      setDetailOpen(false);
      void act("new-project-consumed", state.projectCreationNavigation);
    });
  }, [state.projectCreationNavigation]);
  useEffect(() => {
    if (
      !state.projectNavigation ||
      state.projectNavigation.projectId !== state.activeProjectId
    )
      return;
    if (dirtyRef.current) {
      setError("Simpan perubahan atau batalkan edit dahulu.");
      return;
    }
    setViewedArchiveId(null);
    setTab(
      state.projectNavigation!.tab === "understanding"
        ? "overview"
        : state.projectNavigation!.tab,
    );
    setCreating(false);
    setQuickView(false);
    setWorkspaceView("projects");
    setGallery(false);
    setDetailOpen(state.projectNavigation.tab !== "overview" || !project?.plan);
  }, [state.projectNavigation?.id]);
  const run: Act = async (name, payload) => {
    setError("");
    setPending(true);
    try {
      const r = await act(name, payload);
      if (!r.ok) setError(r.error || "Belum berhasil. Coba lagi.");
      if (r.ok && name === "project-approve") {
        setDetailOpen(false);
        setGallery(false);
        setDirty(false);
      }
      return r;
    } catch {
      setError("Belum berhasil. Coba lagi.");
      return { ok: false };
    } finally {
      setPending(false);
    }
  };
  const change = (fn: () => void) => {
    if (dirty) {
      setError("Simpan perubahan atau batalkan edit dahulu.");
      return;
    }
    fn();
  };
  const locked = state.busy || pending;
  const editable =
    !!project && !["archived", "completed"].includes(project.status);
  const create = async (brief: typeof blank) => {
    const r = await run("project-create", brief);
    if (r.ok) {
      setViewedArchiveId(null);
      setCreating(false);
      setWorkspaceView("projects");
      setQuickView(false);
      setGallery(false);
      setDetailOpen(true);
      setDirty(false);
      void run("send", { text: projectSetupPrompt });
    }
  };
  const continueSetup = () => {
    setPreparing(true);
    setTab("overview");
  };
  const imported = () => {
    continueSetup();
    void run("send", { text: projectSetupPrompt });
  };
  const setup =
    !!project &&
    (!project.plan ||
      (editable &&
        (preparing ||
          (!!project.understanding && !project.understanding.confirmedAt))));
  const openProject = (p: Project) =>
    change(() => {
      void (async () => {
        const selected =
          p.status === "archived"
            ? { ok: true }
            : await run("project-select", p.id);
        if (selected.ok)
          setViewedArchiveId(p.status === "archived" ? p.id : null);
        if (selected.ok) {
          setWorkspaceView("projects");
          setGallery(false);
          setQuickView(false);
          setTab("overview");
          setDetailOpen(!p.plan);
        }
      })();
    });
  const readyDraft =
    project?.draft &&
    (!project.understanding || !!project.understanding.confirmedAt);
  return (
    <AppShell
      variant="wash"
      height="fill"
      contentPadding={0}
      mobileNav={{ breakpoint: "none", hasToggle: false }}
      className="projects-app projects-simple projects-board"
      data-reduced-motion={state.settings.reducedMotion}
      sideNav={
        <aside className="board-rail" aria-label="Navigasi Bito">
          <div className="workspace-brand">
            <Sprout size={21} />
            <strong>bito.</strong>
          </div>
          <BitoButton
            className="sidebar-create"
            disabled={locked || dirty}
            onClick={() => change(() => setCreating(true))}
          >
            <Plus size={18} />
            Tambah proyek
          </BitoButton>
          <nav>
            <BitoButton
              className={`board-rail-button ${gallery && !archives && !quickView && workspaceView === "projects" ? "selected" : ""}`}
              aria-label="Semua proyek"
              title="Semua proyek"
              disabled={locked}
              onClick={() =>
                change(() => {
                  setWorkspaceView("projects");
                  setGallery(true);
                  setArchives(false);
                  setQuickView(false);
                  setCreating(false);
                  setDetailOpen(false);
                })
              }
            >
              <Home size={22} />
              <span className="board-nav-label">Proyek</span>
            </BitoButton>
            <BitoButton
              disabled={locked}
              className={`board-rail-button ${workspaceView === "priority" ? "selected" : ""}`}
              onClick={() =>
                change(() => {
                  setWorkspaceView("priority");
                  setQuickView(false);
                })
              }
            >
              <ListFilter size={18} />
              <span className="board-nav-label">Prioritas</span>
            </BitoButton>
            <BitoButton
              disabled={locked}
              className={`board-rail-button ${workspaceView === "schedule" ? "selected" : ""}`}
              onClick={() =>
                change(() => {
                  setWorkspaceView("schedule");
                  setQuickView(false);
                })
              }
            >
              <CalendarDays size={18} />
              <span className="board-nav-label">Jadwal</span>
            </BitoButton>
            <BitoButton
              className={`board-rail-button ${quickView ? "selected" : ""}`}
              aria-label="Tugas singkat"
              title="Tugas singkat"
              disabled={locked}
              onClick={() =>
                change(() => {
                  setGallery(false);
                  setQuickView(true);
                  setWorkspaceView("projects");
                  setCreating(false);
                  setDetailOpen(false);
                })
              }
            >
              <ListChecks size={22} />
              <span className="board-nav-label">Tugas singkat</span>
            </BitoButton>
            <BitoButton
              className={`board-rail-button ${gallery && archives && workspaceView === "projects" ? "selected" : ""}`}
              aria-label="Arsip proyek"
              title="Arsip proyek"
              disabled={locked}
              onClick={() =>
                change(() => {
                  setArchives(true);
                  setWorkspaceView("projects");
                  setGallery(true);
                  setQuickView(false);
                  setCreating(false);
                  setDetailOpen(false);
                })
              }
            >
              <Archive size={21} />
              <span className="board-nav-label">Arsip</span>
            </BitoButton>
          </nav>
          <div className="sidebar-projects">
            <div className="sidebar-section-label">
              <span>Proyekmu</span>
            </div>
            {state.projects
              .filter((p) => p.status !== "archived")
              .map((p) => (
                <BitoButton
                  key={p.id}
                  className={`sidebar-project ${!gallery && !quickView && workspaceView === "projects" && project?.id === p.id ? "selected" : ""}`}
                  disabled={locked}
                  onClick={() => openProject(p)}
                  title={p.name}
                >
                  <span className="sidebar-project-dot" />
                  <span>{p.name}</span>
                  <small>
                    {projectProgress(p).total > 0
                      ? projectProgress(p).total - projectProgress(p).done || (
                          <Check size={12} />
                        )
                      : null}
                  </small>
                </BitoButton>
              ))}
          </div>
          <BitoButton
            className="board-rail-profile"
            aria-label="Pengaturan Bito"
            title={state.profile.name || "Pengaturan Bito"}
            disabled={dirty}
            onClick={() => void run("show-settings")}
          >
            <Settings2 size={18} />
            <span>Pengaturan</span>
          </BitoButton>
        </aside>
      }
    >
      <div className="project-workspace">
        <header className="project-topbar">
          {workspaceView === "projects" &&
            !gallery &&
            !quickView &&
            project && (
              <BitoButton
                className="project-icon project-back"
                aria-label="Kembali ke semua proyek"
                title="Kembali"
                disabled={locked}
                onClick={() =>
                  change(() => {
                    setWorkspaceView("projects");
                    setGallery(true);
                    setDetailOpen(false);
                    setCreating(false);
                  })
                }
              >
                <ArrowLeft size={20} />
              </BitoButton>
            )}
          <div>
            <h1>
              {workspaceView === "schedule"
                ? "Jadwal"
                : workspaceView === "priority"
                  ? "Prioritas"
                  : quickView
                    ? "Tugas singkat"
                    : gallery
                      ? archives
                        ? "Arsip proyek"
                        : "Proyek"
                      : project?.name || "Proyek"}
            </h1>
          </div>
        </header>
        {error && (
          <div className="project-error" role="alert">
            {error}
            <BitoButton onClick={() => setError("")} aria-label="Tutup pesan">
              <X size={14} />
            </BitoButton>
          </div>
        )}
        {workspaceView !== "projects" ? (
          <div className="project-content saved-work-page">
            <SavedWorkDirectory
              key={workspaceView}
              state={state}
              act={run}
              initialView={workspaceView}
              fixedView
            />
          </div>
        ) : quickView ? (
          <div className="project-content saved-work-page">
            <SavedWorkDirectory
              state={state}
              act={act}
              quickOnly
              onDirty={setDirty}
            />
          </div>
        ) : gallery || !project ? (
          <ProjectGallery
            projects={state.projects}
            busy={locked}
            archives={archives}
            onOpen={openProject}
          />
        ) : (
          <div className="project-board-container">
            {project.status === "archived" && (
              <div className="project-archive-banner" role="status">
                <span>Proyek diarsipkan · hanya untuk dilihat</span>
                <BitoButton
                  disabled={locked}
                  onClick={async () => {
                    const result = await run("project-status", {
                      id: project.id,
                      status: project.plan ? "active" : "planning",
                    });
                    if (result.ok) {
                      await run("project-select", project.id);
                      setViewedArchiveId(null);
                      setArchives(false);
                    }
                  }}
                >
                  Pulihkan proyek
                </BitoButton>
              </div>
            )}
            <ProjectBoard
              project={project}
              state={state}
              act={run}
              busy={locked}
              onDirty={setDirty}
              onDetails={() =>
                change(() => {
                  setTab("brief");
                  setDetailOpen(true);
                })
              }
              onMaterials={() =>
                change(() => {
                  setTab("materials");
                  setDetailOpen(true);
                })
              }
              onWork={() =>
                change(() => {
                  setPreparing(false);
                  setTab("overview");
                  setDetailOpen(true);
                })
              }
              onSetup={() =>
                change(() => {
                  setTab(project.plan ? "plan" : "overview");
                  setDetailOpen(true);
                })
              }
            />
          </div>
        )}
        <AnimatePresence>
          {creating && (
            <WorkspaceDialog
              key="new-project"
              title="Proyek baru"
              reduced={state.settings.reducedMotion}
              onClose={() => change(() => setCreating(false))}
            >
              {error && (
                <p className="board-error" role="alert">
                  {error}
                </p>
              )}
              <div className="project-create">
                <NewTask
                  busy={locked}
                  onDirty={setDirty}
                  onCreate={create}
                  onCancel={() => {
                    setDirty(false);
                    setCreating(false);
                  }}
                  onImport={async (brief) => {
                    const r = await run("project-create-from-file", { brief });
                    if (r.ok && (r.value as { added?: boolean })?.added) {
                      setCreating(false);
                      setWorkspaceView("projects");
                      setQuickView(false);
                      setGallery(false);
                      setDetailOpen(true);
                      setDirty(false);
                      void run("send", { text: projectSetupPrompt });
                    }
                  }}
                />
              </div>
            </WorkspaceDialog>
          )}
          {detailOpen && project && !creating && (
            <WorkspaceDialog
              key={project.id}
              wide
              reduced={state.settings.reducedMotion}
              title={
                tab === "materials"
                  ? "Bahan proyek"
                  : tab === "brief"
                    ? "Detail proyek"
                    : tab === "plan"
                      ? "Rencana proyek"
                      : setup
                        ? "Susun proyek"
                        : "Sesi kerja"
              }
              onClose={() => change(() => setDetailOpen(false))}
            >
              {error && (
                <p className="board-error" role="alert">
                  {error}
                </p>
              )}
              <div className="project-columns">
                <section className="project-content">
                  <div className="project-meta">
                    <Badge
                      className={`project-status ${project.status}`}
                      label={statusLabel[project.status]}
                      variant={
                        project.status === "completed"
                          ? "success"
                          : project.status === "active"
                            ? "blue"
                            : "neutral"
                      }
                    />
                    <span>
                      {project.deadline
                        ? `Tenggat ${date(project.deadline)}`
                        : "Belum ada tenggat"}
                    </span>
                    <div className="project-meta-actions">
                      {project.status === "completed" ||
                      project.status === "archived" ? (
                        <BitoButton
                          disabled={locked}
                          onClick={() =>
                            void run("project-status", {
                              id: project.id,
                              status: project.plan ? "active" : "planning",
                            })
                          }
                        >
                          {project.status === "archived"
                            ? "Pulihkan proyek"
                            : "Buka kembali"}
                        </BitoButton>
                      ) : (
                        <BitoButton
                          disabled={locked || dirty}
                          onClick={() =>
                            void run("project-status", {
                              id: project.id,
                              status: "archived",
                            })
                          }
                          aria-label="Arsipkan proyek"
                        >
                          <Archive size={15} />
                        </BitoButton>
                      )}
                    </div>
                  </div>
                  <div className="project-tab-body">
                    <div className="project-page">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={`${project.id}-${tab}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -3 }}
                          transition={{
                            duration: state.settings.reducedMotion ? 0 : 0.16,
                          }}
                        >
                          {tab === "overview" ? (
                            <>
                              {setup ? (
                                <>
                                  <ol
                                    className="task-setup-progress"
                                    aria-label="Menyiapkan tugas"
                                  >
                                    {[
                                      "Pahami tugas",
                                      "Susun rencana",
                                      "Mulai",
                                    ].map((label, i) => (
                                      <li
                                        key={label}
                                        aria-current={
                                          (readyDraft ? 1 : 0) === i
                                            ? "step"
                                            : undefined
                                        }
                                        className={
                                          i < (readyDraft ? 1 : 0)
                                            ? "is-complete"
                                            : ""
                                        }
                                      >
                                        <span>
                                          {i < (readyDraft ? 1 : 0) ? (
                                            <Check size={11} />
                                          ) : (
                                            i + 1
                                          )}
                                        </span>
                                        {label}
                                      </li>
                                    ))}
                                  </ol>
                                  {readyDraft ? (
                                    <Plan
                                      project={project}
                                      state={state}
                                      act={run}
                                      busy={locked || !editable}
                                      onDirty={setDirty}
                                    />
                                  ) : (
                                    <Understanding
                                      key={project.id}
                                      project={project}
                                      act={run}
                                      busy={locked || !editable}
                                      onDirty={setDirty}
                                      onPlan={continueSetup}
                                    />
                                  )}
                                  {project.plan && (
                                    <BitoButton
                                      className="project-link"
                                      disabled={locked || dirty}
                                      onClick={() => {
                                        setPreparing(false);
                                        setTab("plan");
                                      }}
                                    >
                                      Kembali ke rencana saat ini
                                    </BitoButton>
                                  )}
                                  <SetupReply
                                    project={project}
                                    state={state}
                                    act={run}
                                    busy={locked}
                                    disabled={dirty || !editable}
                                  />
                                </>
                              ) : (
                                <ProjectOverview
                                  project={project}
                                  state={state}
                                  act={run}
                                  busy={locked}
                                  onDirty={setDirty}
                                  onPlan={() => change(() => setTab("plan"))}
                                  onMaterials={() =>
                                    change(() => setTab("materials"))
                                  }
                                />
                              )}
                              <nav
                                className="project-utilities"
                                aria-label="Detail tugas"
                              >
                                {project.plan && (
                                  <BitoButton
                                    onClick={() => change(() => setTab("plan"))}
                                  >
                                    Semua langkah
                                    {project.draft ? " · Draf baru" : ""}
                                  </BitoButton>
                                )}
                                <BitoButton
                                  onClick={() =>
                                    change(() => setTab("materials"))
                                  }
                                >
                                  Bahan tugas
                                  {project.materials.length
                                    ? ` · ${project.materials.length}`
                                    : ""}
                                </BitoButton>
                                <BitoButton
                                  onClick={() => change(() => setTab("brief"))}
                                >
                                  Detail tugas
                                </BitoButton>
                              </nav>
                            </>
                          ) : tab === "materials" ? (
                            <Materials
                              project={project}
                              act={run}
                              busy={locked || !editable}
                              onDirty={setDirty}
                              onImported={imported}
                            />
                          ) : tab === "brief" || tab === "understanding" ? (
                            <>
                              <BriefForm
                                value={project}
                                busy={locked || !editable}
                                label="Simpan detail"
                                onDirty={setDirty}
                                submit={async (brief) => {
                                  const r = await run("project-brief", {
                                    id: project.id,
                                    brief,
                                  });
                                  if (r.ok) {
                                    setDirty(false);
                                    setDetailOpen(false);
                                  }
                                }}
                              />
                            </>
                          ) : (
                            <>
                              <Plan
                                project={project}
                                state={state}
                                act={run}
                                busy={locked || !editable}
                                onDirty={setDirty}
                              />
                              {project.draft && (
                                <SetupReply
                                  project={project}
                                  state={state}
                                  act={run}
                                  busy={locked}
                                  disabled={dirty || !editable}
                                />
                              )}
                            </>
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </div>
                </section>
              </div>
            </WorkspaceDialog>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {closing && (
          <WorkspaceDialog
            title="Perubahan belum disimpan"
            reduced={state.settings.reducedMotion}
            onClose={() => setClosing(false)}
          >
            <p>Kembali untuk menyimpan, atau tutup dan abaikan edit ini.</p>
            <div className="project-form-actions">
              <BitoButton
                className="project-primary"
                onClick={() => setClosing(false)}
              >
                Kembali
              </BitoButton>
              <BitoButton
                className="project-link"
                onClick={() => void api.command("settings-close-ready")}
              >
                Tutup tanpa menyimpan
              </BitoButton>
            </div>
          </WorkspaceDialog>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

function BriefForm({
  value,
  submit,
  busy,
  label,
  onDirty,
  compact = false,
}: {
  value: typeof blank;
  submit: (v: typeof blank) => Promise<unknown>;
  busy: boolean;
  label: string;
  onDirty: (v: boolean) => void;
  compact?: boolean;
}) {
  const [form, setForm] = useState(() => ({
    name: value.name,
    brief: value.brief,
    outcome: value.outcome,
    deadline: value.deadline,
    availability: value.availability,
  }));
  useEffect(() => {
    setForm({
      name: value.name,
      brief: value.brief,
      outcome: value.outcome,
      deadline: value.deadline,
      availability: value.availability,
    });
    onDirty(false);
  }, [
    value.name,
    value.brief,
    value.outcome,
    value.deadline,
    value.availability,
  ]);
  const field = (key: keyof typeof blank, v: string) => {
    onDirty(true);
    setForm((f) => ({ ...f, [key]: key === "deadline" ? v || null : v }));
  };
  return (
    <form
      className="project-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(form);
      }}
    >
      <div className="bito-form-field">
        Nama proyek
        <BitoInput
          label="Nama proyek"
          required
          maxLength={100}
          value={form.name}
          disabled={busy}
          onChange={(e) => field("name", e.target.value)}
          placeholder="Misalnya, presentasi kelompok hari Jumat"
        />
      </div>
      <div className="bito-form-field">
        Ceritakan tugasnya
        <BitoTextArea
          label="Ceritakan tugasnya"
          maxLength={4000}
          rows={3}
          value={form.brief}
          disabled={busy}
          onChange={(e) => field("brief", e.target.value)}
          placeholder="Apa tugasnya? Ada ketentuan atau kendala apa?"
        />
      </div>
      <BitoDisclosure
        className="project-optional"
        open={compact ? undefined : true}
      >
        <summary>
          Hasil, tenggat, dan waktu luang {compact ? "(opsional)" : ""}
        </summary>
        <div className="bito-form-field">
          Hasil yang ingin selesai
          <BitoInput
            label="Hasil yang ingin selesai"
            maxLength={1000}
            value={form.outcome}
            disabled={busy}
            onChange={(e) => field("outcome", e.target.value)}
            placeholder="Misalnya, 8 slide dan catatan presentasi"
          />
        </div>
        <div className="project-form-pair">
          <div className="bito-form-field">
            Tenggat
            <BitoDateInput
              label="Tenggat"
              value={form.deadline || ""}
              disabled={busy}
              onValueChange={(e) => field("deadline", e ?? "")}
            />
          </div>
          <div className="bito-form-field">
            Waktu yang tersedia
            <BitoInput
              label="Waktu yang tersedia"
              maxLength={1000}
              value={form.availability}
              disabled={busy}
              onChange={(e) => field("availability", e.target.value)}
              placeholder="30 menit tiap malam"
            />
          </div>
        </div>
      </BitoDisclosure>
      <div className="project-form-actions">
        <BitoButton
          className="project-primary"
          disabled={busy || !form.name.trim()}
        >
          {label}
        </BitoButton>
        <BitoButton
          type="button"
          disabled={busy}
          onClick={() => {
            setForm({
              name: value.name,
              brief: value.brief,
              outcome: value.outcome,
              deadline: value.deadline,
              availability: value.availability,
            });
            onDirty(false);
          }}
        >
          Batalkan edit
        </BitoButton>
      </div>
    </form>
  );
}

function MaterialImportButton({
  project,
  act,
  busy,
  onImported,
}: {
  project: Project;
  act: Act;
  busy: boolean;
  onImported?: () => void;
}) {
  const [reading, setReading] = useState(false),
    [notice, setNotice] = useState("");
  const upload = async () => {
    if (reading) return;
    setReading(true);
    setNotice("");
    try {
      const r = await act("project-import-material", { id: project.id });
      if (r.ok && r.value) {
        const value = r.value as { added?: boolean; duplicate?: boolean };
        if (value.duplicate)
          setNotice("Bahan ini sudah ada. Tidak dibaca ulang.");
        if (value.added) {
          setNotice("Bahan ditambahkan. Bito akan memperbarui ringkasannya.");
          onImported?.();
        }
      }
    } finally {
      setReading(false);
    }
  };
  return (
    <div className="project-import">
      <BitoButton
        className="project-secondary"
        disabled={busy || reading}
        onClick={() => void upload()}
      >
        <Paperclip size={15} />
        {reading ? "Membaca bahan…" : "Tambah PDF, gambar, atau teks"}
      </BitoButton>
      {reading ? (
        <div className="project-reading" role="status">
          <span className="project-reading-dots">•••</span>
          <span>Membaca instruksi dan bagian pentingnya…</span>
          <BitoButton onClick={() => void api.command("stop")}>
            Batalkan
          </BitoButton>
        </div>
      ) : (
        notice && (
          <p role="status" className="project-hint">
            {notice}
          </p>
        )
      )}
    </div>
  );
}
function Understanding({
  project,
  act,
  busy,
  onDirty,
  onPlan,
}: {
  project: Project;
  act: Act;
  busy: boolean;
  onDirty: (v: boolean) => void;
  onPlan: () => void;
}) {
  const u = project.understanding;
  const [editing, setEditing] = useState<TaskUnderstanding | null>(null);
  const [version, setVersion] = useState(project.version);
  const data = editing || u;
  const confirm = async () => {
    if (!data) return;
    const r = await act("project-understanding-confirm", {
      id: project.id,
      version: editing ? version : project.version,
      understandingId: data.id,
      understanding: {
        summary: data.summary.trim(),
        deliverables: data.deliverables.map((v) => v.trim()).filter(Boolean),
        requirements: data.requirements.map((v) => v.trim()).filter(Boolean),
        unknowns: data.unknowns.map((v) => v.trim()).filter(Boolean),
        sourceIds: data.sourceIds,
      },
    });
    if (!r.ok) return;
    setEditing(null);
    onDirty(false);
    onPlan();
    void act("send", {
      text: "Ringkasan tugas sudah aku periksa dan konfirmasi lewat aplikasi. Susun draf langkah kerja singkat yang realistis lewat propose_project_plan. Pakai tenggat/waktu luang yang sudah tersedia. Bila tanggal belum diketahui, biarkan null dan tulis asumsi singkat; jangan mengarang tanggal atau menahan rencana hanya karena belum ada jadwal. Jangan membuat pengingat atau kalender otomatis.",
    });
  };
  if (!data)
    return (
      <div className="project-understanding">
        <h2>Kita rapikan tugasnya.</h2>
        <p className="project-hint">
          Bito akan membaca ceritamu dan bahan yang dilampirkan.
        </p>
        <BitoButton
          className="project-primary"
          disabled={busy}
          onClick={() => void act("send", { text: projectSetupPrompt })}
        >
          Baca tugas ini
        </BitoButton>
      </div>
    );
  return (
    <section className="project-understanding">
      <div className="project-understanding-heading">
        <h2>
          {u?.confirmedAt
            ? "Tentang tugas ini"
            : "Ini yang perlu diselesaikan."}
        </h2>
        {!editing && (
          <BitoButton
            className="project-link"
            disabled={busy}
            onClick={() => {
              setVersion(project.version);
              setEditing(structuredClone(data));
            }}
          >
            <Pencil size={14} /> Koreksi
          </BitoButton>
        )}
      </div>
      {editing ? (
        <div className="project-form">
          {(
            [
              ["summary", "Tugasnya"],
              ["deliverables", "Hasil yang dikumpulkan"],
              ["requirements", "Ketentuan"],
              ["unknowns", "Yang belum jelas"],
            ] as const
          ).map(([key, label]) => (
            <div className="bito-form-field" key={key}>
              {label}
              <BitoTextArea
                label={label}
                rows={key === "summary" ? 3 : 2}
                disabled={busy}
                maxLength={key === "summary" ? 2000 : undefined}
                value={
                  key === "summary" ? editing.summary : editing[key].join("\n")
                }
                onChange={(e) => {
                  setEditing({
                    ...editing,
                    [key]:
                      key === "summary"
                        ? e.target.value
                        : e.target.value.split("\n"),
                  });
                  onDirty(true);
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <>
          <p className="task-understanding-summary">{data.summary}</p>
          <ul className="task-deliverables">
            {data.deliverables.map((v, i) => (
              <li key={i}>
                <Check size={15} />
                <span>{v}</span>
              </li>
            ))}
          </ul>
          {(data.requirements.length > 0 || data.unknowns.length > 0) && (
            <BitoDisclosure className="project-disclosure">
              <summary>Ketentuan & hal yang belum jelas</summary>
              {data.requirements.length > 0 && (
                <ul>
                  {data.requirements.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              )}
              {data.unknowns.length > 0 && (
                <>
                  <h3>Belum diketahui</h3>
                  <ul>
                    {data.unknowns.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </>
              )}
            </BitoDisclosure>
          )}
        </>
      )}
      {project.materials.some((m) => m.warnings?.length) && (
        <BitoDisclosure className="project-disclosure project-material-warning">
          <summary>Ada bagian bahan yang perlu dicek</summary>
          {project.materials.flatMap((m) =>
            (m.warnings || []).map((w, i) => (
              <p key={m.id + i}>
                {m.name}: {w}
              </p>
            )),
          )}
        </BitoDisclosure>
      )}
      {(!u?.confirmedAt || editing) && (
        <div className="project-form-actions">
          <BitoButton
            className="project-primary"
            disabled={
              busy ||
              !data.summary.trim() ||
              !data.deliverables.some((v) => v.trim())
            }
            onClick={() => void confirm()}
          >
            {editing ? "Simpan & susun langkah" : "Sudah sesuai, susun langkah"}
          </BitoButton>
          {editing && (
            <BitoButton
              disabled={busy}
              onClick={() => {
                setEditing(null);
                onDirty(false);
              }}
            >
              Batalkan
            </BitoButton>
          )}
        </div>
      )}
    </section>
  );
}
function Plan({
  project,
  state,
  act,
  busy,
  onDirty,
}: {
  project: Project;
  state: Snapshot;
  act: Act;
  busy: boolean;
  onDirty: (v: boolean) => void;
}) {
  const [editing, setEditing] = useState<ProjectPlan | null>(null);
  const [baseVersion, setBaseVersion] = useState(project.version);
  const progress = projectProgress(project);
  const draft = editing || project.draft;
  const edit = (fn: (p: ProjectPlan) => void) => {
    if (!draft) return;
    const p = structuredClone(draft);
    fn(p);
    setEditing(p);
    onDirty(true);
  };
  const save = async () => {
    const r = await act("project-draft", {
      id: project.id,
      version: baseVersion,
      plan: editing,
    });
    if (r.ok) {
      setEditing(null);
      onDirty(false);
    }
  };
  return (
    <div className="project-plan">
      {draft && (
        <div className="project-draft">
          <div className="project-draft-heading">
            <div>
              <span className="project-eyebrow">RANCANGAN LANGKAH</span>
              <h2>Langkah yang bisa kita ambil.</h2>
            </div>
            {!editing && (
              <BitoButton
                className="project-icon"
                disabled={busy}
                aria-label="Edit draf"
                onClick={() => {
                  setBaseVersion(project.version);
                  setEditing(structuredClone(project.draft));
                  onDirty(true);
                }}
              >
                <Pencil size={16} />
              </BitoButton>
            )}
          </div>
          {project.plan && (
            <div className="pw-plan-comparison">
              <strong>Perubahan tanggal target</strong>
              {planDateChanges({ ...project, draft }).length ? (
                planDateChanges({ ...project, draft }).map((m, i) => (
                  <div key={i}>
                    <span>{m.title}</span>
                    <small>
                      {m.added ? "Milestone baru" : date(m.before)} →{" "}
                      {date(m.after)}
                    </small>
                  </div>
                ))
              ) : (
                <p>
                  Tanggal milestone tetap. Periksa perubahan langkah di bawah.
                </p>
              )}
              <small>
                Langkah yang sudah selesai tetap disimpan. Rencana aktif baru
                berubah setelah kamu menyetujuinya.
              </small>
            </div>
          )}
          {editing ? (
            <BitoTextArea
              className="project-edit-summary"
              maxLength={2000}
              value={draft.summary}
              onChange={(e) =>
                edit((p) => {
                  p.summary = e.target.value;
                })
              }
            />
          ) : (
            <p>{draft.summary}</p>
          )}
          {!editing && (
            <ProjectRoadmap
              project={project}
              plan={draft}
              preview
              reduced={state.settings.reducedMotion}
            />
          )}
          {editing && (
            <PlanMilestones
              plan={draft}
              editing={!!editing}
              busy={busy}
              project={project}
              onEdit={edit}
            />
          )}
          {editing && draft.milestones.length < 8 && (
            <BitoButton
              className="project-link"
              disabled={busy}
              onClick={() =>
                edit((p) => {
                  p.milestones.push({
                    id: crypto.randomUUID(),
                    title: "Milestone baru",
                    targetDate: null,
                    tasks: [
                      {
                        id: crypto.randomUUID(),
                        title: "Langkah baru",
                        details: "",
                        doneWhen: "",
                        estimateMin: 15,
                        estimateMax: 30,
                        sourceIds: [],
                        status: "todo",
                      },
                    ],
                  });
                })
              }
            >
              <Plus size={14} /> Tambah milestone
            </BitoButton>
          )}
          {draft.assumptions.length > 0 && (
            <BitoDisclosure>
              <summary>Asumsi yang perlu kamu cek</summary>
              {draft.assumptions.map((a, i) =>
                editing ? (
                  <BitoInput
                    key={i}
                    maxLength={400}
                    value={a}
                    onChange={(e) =>
                      edit((p) => {
                        p.assumptions[i] = e.target.value;
                      })
                    }
                  />
                ) : (
                  <p key={i}>{a}</p>
                ),
              )}
            </BitoDisclosure>
          )}
          <p className="project-hint">
            Tanggal milestone dan durasi adalah perkiraan. Menyetujui rencana
            tidak membuat acara kalender atau pengingat.
          </p>
          <div className="project-draft-actions">
            {editing ? (
              <>
                <BitoButton
                  className="project-primary"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  Simpan edit
                </BitoButton>
                <BitoButton
                  disabled={busy}
                  onClick={() => {
                    setEditing(null);
                    onDirty(false);
                  }}
                >
                  Batal
                </BitoButton>
              </>
            ) : (
              <>
                <BitoButton
                  className="project-primary"
                  disabled={busy}
                  onClick={() =>
                    void act("project-approve", {
                      id: project.id,
                      version: project.version,
                      draftId: draft.id,
                    })
                  }
                >
                  <Check size={16} /> Pakai rencana ini
                </BitoButton>
                <BitoButton
                  disabled={busy}
                  onClick={() =>
                    void act("project-discard-draft", { id: project.id })
                  }
                >
                  Buang draf
                </BitoButton>
              </>
            )}
          </div>
        </div>
      )}
      {project.plan && (
        <>
          <h2 className="project-section-title">Semua langkah</h2>
          <PlanMilestones
            plan={project.plan}
            project={project}
            busy={busy}
            act={act}
          />
          {progress.done === progress.total &&
            project.status !== "completed" && (
              <BitoButton
                className="project-primary"
                disabled={busy}
                onClick={() =>
                  void act("project-status", {
                    id: project.id,
                    status: "completed",
                  })
                }
              >
                Tandai tugas selesai
              </BitoButton>
            )}
        </>
      )}
      {!draft && !project.plan && (
        <div className="project-plan-empty">
          <FolderOpen size={28} />
          <h2>Kita rapikan gambaran besarnya.</h2>
          <p>
            Kita pahami dulu hasil yang perlu dibuat dan syaratnya. Setelah kamu
            konfirmasi ringkasannya, draf rencana muncul di sini.
          </p>
          <BitoButton
            className="project-primary"
            disabled={busy || state.busy}
            onClick={() => void act("send", { text: projectSetupPrompt })}
          >
            {project.understanding?.confirmedAt
              ? "Susun bareng Bito"
              : "Pahami tugas dulu"}
          </BitoButton>
        </div>
      )}
    </div>
  );
}

function PlanMilestones({
  plan,
  project,
  editing = false,
  busy,
  act,
  onEdit,
}: {
  plan: ProjectPlan;
  project: Project;
  editing?: boolean;
  busy: boolean;
  act?: Act;
  onEdit?: (fn: (p: ProjectPlan) => void) => void;
}) {
  return (
    <div className="project-milestones">
      {plan.milestones.map((m, mi) => (
        <section key={m.id} className="project-milestone">
          <header>
            <span>{String(mi + 1).padStart(2, "0")}</span>
            {editing ? (
              <BitoInput
                maxLength={200}
                value={m.title}
                onChange={(e) =>
                  onEdit?.((p) => {
                    p.milestones[mi].title = e.target.value;
                  })
                }
              />
            ) : (
              <h3>{m.title}</h3>
            )}
            {editing ? (
              <BitoDateInput
                aria-label="Tanggal milestone"
                value={m.targetDate || ""}
                onValueChange={(e) =>
                  onEdit?.((p) => {
                    p.milestones[mi].targetDate = (e ?? "") || null;
                  })
                }
              />
            ) : (
              <small>
                {m.targetDate ? date(m.targetDate) : "Tanpa tanggal"}
              </small>
            )}
          </header>
          {m.tasks.map((t, ti) => (
            <div key={t.id} className={`project-task ${t.status}`}>
              {act && !editing ? (
                <BitoInput
                  className="task-complete-toggle"
                  type="checkbox"
                  aria-label={`Selesai: ${t.title}`}
                  checked={t.status === "done"}
                  disabled={busy}
                  onChange={(e) =>
                    void act("project-task", {
                      id: project.id,
                      taskId: t.id,
                      status: e.target.checked ? "done" : "todo",
                    })
                  }
                />
              ) : act ? (
                <BitoSelect
                  aria-label={`Status ${t.title}`}
                  value={t.status}
                  disabled={busy}
                  onValueChange={(e) =>
                    void act("project-task", {
                      id: project.id,
                      taskId: t.id,
                      status: e,
                    })
                  }
                >
                  <option value="todo">Belum mulai</option>
                  <option value="doing">Dikerjakan</option>
                  <option value="blocked">Tertahan</option>
                  <option value="done">Selesai</option>
                </BitoSelect>
              ) : (
                <span className="project-task-dot" />
              )}
              <div>
                {editing ? (
                  <>
                    <BitoInput
                      maxLength={200}
                      aria-label="Nama langkah"
                      value={t.title}
                      onChange={(e) =>
                        onEdit?.((p) => {
                          p.milestones[mi].tasks[ti].title = e.target.value;
                        })
                      }
                    />
                    <BitoTextArea
                      maxLength={1000}
                      aria-label="Rincian langkah"
                      value={t.details}
                      onChange={(e) =>
                        onEdit?.((p) => {
                          p.milestones[mi].tasks[ti].details = e.target.value;
                        })
                      }
                    />
                    <BitoInput
                      maxLength={500}
                      aria-label="Kriteria selesai"
                      value={t.doneWhen}
                      onChange={(e) =>
                        onEdit?.((p) => {
                          p.milestones[mi].tasks[ti].doneWhen = e.target.value;
                        })
                      }
                    />
                    <div className="project-estimates">
                      {(["estimateMin", "estimateMax"] as const).map((key) => (
                        <BitoInput
                          key={key}
                          aria-label={
                            key === "estimateMin"
                              ? "Menit minimal"
                              : "Menit maksimal"
                          }
                          type="number"
                          min={5}
                          max={2400}
                          value={t[key]}
                          onChange={(e) =>
                            onEdit?.((p) => {
                              p.milestones[mi].tasks[ti][key] = Number(
                                e.target.value,
                              );
                            })
                          }
                        />
                      ))}
                      <span>menit</span>
                    </div>
                  </>
                ) : (
                  <BitoDisclosure className="task-step-detail">
                    <summary>
                      <strong>{t.title}</strong>
                      {t.status === "doing" ? (
                        <span className="task-status-label">Dikerjakan</span>
                      ) : t.status === "blocked" ? (
                        <span className="task-status-label">Tertahan</span>
                      ) : null}
                    </summary>
                    {t.details && <p>{t.details}</p>}
                    <small>
                      {t.estimateMin}–{t.estimateMax} menit
                      {t.doneWhen && ` · Selesai saat ${t.doneWhen}`}
                    </small>
                    {act && (
                      <div className="task-status-field bito-form-field">
                        Status
                        <BitoSelect
                          aria-label={`Status ${t.title}`}
                          value={t.status}
                          disabled={busy}
                          onValueChange={(e) =>
                            void act("project-task", {
                              id: project.id,
                              taskId: t.id,
                              status: e,
                            })
                          }
                        >
                          <option value="todo">Belum mulai</option>
                          <option value="doing">Dikerjakan</option>
                          <option value="blocked">Tertahan</option>
                          <option value="done">Selesai</option>
                        </BitoSelect>
                      </div>
                    )}
                  </BitoDisclosure>
                )}
                {t.sourceIds.length > 0 && (
                  <div className="project-sources">
                    {t.sourceIds.map((id) => (
                      <span key={id}>
                        <Paperclip size={10} />
                        {project.materials.find((m) => m.id === id)?.name ||
                          "Bahan tidak tersedia"}
                        {editing && (
                          <BitoButton
                            type="button"
                            aria-label="Hapus rujukan"
                            onClick={() =>
                              onEdit?.((p) => {
                                p.milestones[mi].tasks[ti].sourceIds =
                                  p.milestones[mi].tasks[ti].sourceIds.filter(
                                    (v) => v !== id,
                                  );
                              })
                            }
                          >
                            <X size={10} />
                          </BitoButton>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                {editing && t.status !== "done" && m.tasks.length > 1 && (
                  <BitoButton
                    className="project-link"
                    disabled={busy}
                    onClick={() =>
                      onEdit?.((p) => {
                        p.milestones[mi].tasks.splice(ti, 1);
                      })
                    }
                  >
                    Hapus langkah
                  </BitoButton>
                )}
              </div>
            </div>
          ))}
          {editing && m.tasks.length < 12 && (
            <BitoButton
              className="project-link"
              disabled={busy}
              onClick={() =>
                onEdit?.((p) => {
                  p.milestones[mi].tasks.push({
                    id: crypto.randomUUID(),
                    title: "Langkah baru",
                    details: "",
                    doneWhen: "",
                    estimateMin: 15,
                    estimateMax: 30,
                    sourceIds: [],
                    status: "todo",
                  });
                })
              }
            >
              <Plus size={14} /> Tambah langkah
            </BitoButton>
          )}
          {editing &&
            plan.milestones.length > 1 &&
            !m.tasks.some((t) => t.status === "done") && (
              <BitoButton
                className="project-link"
                disabled={busy}
                onClick={() =>
                  onEdit?.((p) => {
                    p.milestones.splice(mi, 1);
                  })
                }
              >
                Hapus milestone
              </BitoButton>
            )}
        </section>
      ))}
    </div>
  );
}

function Materials({
  project,
  act,
  busy,
  onDirty,
  onImported,
}: {
  project: Project;
  act: Act;
  busy: boolean;
  onDirty: (v: boolean) => void;
  onImported: () => void;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const add = async () => {
    const r = await act("project-material-add", {
      id: project.id,
      material: { name, content },
    });
    if (r.ok) {
      setName("");
      setContent("");
      onDirty(false);
      onImported();
    }
  };
  return (
    <div className="project-materials">
      <h2>Bahan tugas</h2>
      <p className="project-hint">
        Instruksi, foto tugas, atau referensi. Semua tersimpan bersama tugas
        ini.
      </p>
      <MaterialImportButton
        project={project}
        act={act}
        busy={busy || !!name || !!content}
        onImported={onImported}
      />
      <div className="project-material-list">
        {project.materials.map((m) => (
          <article key={m.id}>
            <BitoButton onClick={() => setOpen(open === m.id ? null : m.id)}>
              <Paperclip size={15} />
              <span>
                {m.name}
                <small>
                  {m.kind && m.kind !== "text" ? "Ringkasan AI · " : ""}
                  {m.content.length.toLocaleString("id-ID")} karakter
                </small>
              </span>
            </BitoButton>
            <BitoButton
              disabled={busy}
              aria-label={`Hapus ${m.name}`}
              onClick={() =>
                void act("project-material-remove", {
                  id: project.id,
                  materialId: m.id,
                })
              }
            >
              <X size={14} />
            </BitoButton>
            {open === m.id && (
              <>
                <pre>{m.content}</pre>
                {m.warnings?.map((w, i) => (
                  <p className="project-material-warning" key={i}>
                    {w}
                  </p>
                ))}
              </>
            )}
          </article>
        ))}
      </div>
      <BitoDisclosure className="project-disclosure">
        <summary>Tulis catatan</summary>
        <form
          className="project-form"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="bito-form-field">
            Atau simpan catatan
            <BitoInput
              label="Atau simpan catatan"
              maxLength={200}
              placeholder="Judul catatan"
              value={name}
              disabled={busy}
              onChange={(e) => {
                setName(e.target.value);
                onDirty(true);
              }}
            />
          </div>
          <BitoTextArea
            aria-label="Isi catatan"
            rows={5}
            maxLength={48000}
            placeholder="Instruksi tugas, rubrik penilaian, catatan guru/dosen, atau bahan yang relevan…"
            value={content}
            disabled={busy}
            onChange={(e) => {
              setContent(e.target.value);
              onDirty(true);
            }}
          />
          <div className="project-form-actions">
            <BitoButton
              className="project-primary"
              disabled={busy || !name.trim() || !content.trim()}
            >
              Simpan bahan
            </BitoButton>
            <BitoButton
              type="button"
              disabled={busy}
              onClick={() => {
                setName("");
                setContent("");
                onDirty(false);
              }}
            >
              Batal
            </BitoButton>
          </div>
        </form>
      </BitoDisclosure>
    </div>
  );
}
