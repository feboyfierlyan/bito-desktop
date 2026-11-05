import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import type { AppState } from "../src/shared";
import {
  MAX_TASK_FILE_BYTES,
  taskFileMime,
  parseMaterialAnalysis,
  type MaterialAnalysis,
} from "../src/task-material";
import { newProject, type Project } from "../src/projects";
import { projectCommand } from "./projects";
export async function importProjectMaterial(options: {
  state: AppState;
  projectId: string;
  pick: () => Promise<string | null>;
  read: (path: string) => Promise<Uint8Array>;
  analyze: (input: {
    name: string;
    mimeType: string;
    data: string;
  }) => Promise<MaterialAnalysis>;
  signal: AbortSignal;
  isCurrent: () => boolean;
}) {
  const { state, projectId, signal } = options;
  const project = state.projects.find((p) => p.id === projectId);
  if (!project || ["completed", "archived"].includes(project.status))
    throw Error("Buka tugas aktif dahulu.");
  if (project.materials.length >= 12)
    throw Error(
      "Maksimal 12 bahan per tugas. Hapus bahan yang tidak diperlukan dahulu.",
    );
  const version = project.version;
  const guard = () => {
    signal.throwIfAborted();
    if (
      !options.isCurrent() ||
      project.version !== version ||
      state.activeProjectId !== projectId
    )
      throw Error("Tugas berubah. Tambahkan ulang bahan ke tugas yang benar.");
  };
  const path = await options.pick();
  if (!path) return { cancelled: true };
  guard();
  const bytes = await options.read(path);
  guard();
  const name = basename(path)
      .replace(/[\u0000-\u001f]/g, "")
      .slice(0, 160),
    hash = createHash("sha256").update(bytes).digest("hex");
  if (project.materials.some((m) => m.hash === hash))
    return { duplicate: true };
  let content: string,
    warnings: string[] = [],
    kind: "text" | "pdf" | "image" = "text";
  if (
    [".txt", ".md", ".csv", ".json", ".log"].includes(
      extname(path).toLowerCase(),
    )
  ) {
    if (bytes.length > 192000) throw Error("File teks maksimal 192 KB.");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\u0000")) throw Error("File ini bukan dokumen teks.");
    content = text.slice(0, 48000);
    if (text.length > 48000)
      warnings = [
        "Hanya 48.000 karakter awal yang disimpan. Tambahkan bagian lainnya sebagai bahan terpisah bila diperlukan.",
      ];
  } else {
    if (bytes.length > MAX_TASK_FILE_BYTES)
      throw Error("Pilih PDF atau gambar maksimal 6 MB.");
    const mimeType = taskFileMime(bytes);
    const analysis = parseMaterialAnalysis(
      await options.analyze({
        name,
        mimeType,
        data: Buffer.from(bytes).toString("base64"),
      }),
    );
    guard();
    content = analysis.content;
    warnings = analysis.warnings;
    kind = analysis.kind;
  }
  guard();
  projectCommand(state, "project-material-add", {
    id: projectId,
    material: { name, content, kind, hash, warnings },
  });
  return { added: true };
}

/** Stage file analysis before committing a task, so cancel/failure leaves no empty task. */
export async function importNewProjectMaterial(
  options: Omit<Parameters<typeof importProjectMaterial>[0], "projectId"> & {
    brief?: Pick<
      Project,
      "name" | "brief" | "outcome" | "deadline" | "availability"
    >;
  },
) {
  const { state, signal } = options;
  if (state.projects.length >= 100)
    throw Error("Batas penyimpanan 100 tugas sudah tercapai.");
  const originalActive = state.activeProjectId;
  const isCurrent = () =>
    options.isCurrent() && state.activeProjectId === originalActive;
  const guard = () => {
    signal.throwIfAborted();
    if (!isCurrent())
      throw Error(
        "Akun atau tugas berubah. Tambahkan ulang bahan ke tugas yang benar.",
      );
  };
  const path = await options.pick();
  if (!path) return { cancelled: true };
  guard();
  const filename = basename(path)
    .replace(/[\u0000-\u001f]/g, "")
    .slice(0, 100);
  const incoming = options.brief;
  const project = newProject({
    name:
      incoming?.name && incoming.name !== "Tugas baru"
        ? incoming.name
        : filename.replace(/\.[^.]+$/, "") || "Tugas baru",
    brief: incoming?.brief || `Instruksi tugas ada di lampiran ${filename}.`,
    outcome: incoming?.outcome || "",
    deadline: incoming?.deadline || null,
    availability: incoming?.availability || "",
  });
  const staged = { ...state, projects: [project], activeProjectId: project.id };
  const result = await importProjectMaterial({
    ...options,
    state: staged,
    projectId: project.id,
    pick: async () => path,
    isCurrent,
  });
  guard();
  if (!("added" in result) || !result.added) return result;
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  return { added: true, projectId: project.id };
}
