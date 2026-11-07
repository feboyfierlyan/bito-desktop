// Disposable browser-only fixture; not a production build entry or Electron data.
import { defaultState } from "../../electron/core";
import { newProject, recordProjectProgress } from "../../src/projects";
if (import.meta.env.DEV) {
  const state = defaultState();
  const project = newProject({
    name: "Comparative Essay & Presentation",
    brief: "Bandingkan Arduino Uno dan STM32F407.",
    outcome: "Esai dan 5 slide",
    deadline: "2026-11-06",
    availability: "20 menit sehari",
  });
  const task = (title: string, done = false) => ({
    id: crypto.randomUUID(),
    title,
    details: "Pilih poin penting dan catat hasilnya.",
    doneWhen: "Poin siap dipakai untuk presentasi.",
    estimateMin: 15,
    estimateMax: 25,
    sourceIds: [],
    status: done ? ("done" as const) : ("todo" as const),
  });
  project.status = "active";
  project.plan = {
    id: crypto.randomUUID(),
    summary: "Selesaikan esai lalu siapkan presentasi.",
    assumptions: [],
    milestones: [
      {
        id: crypto.randomUUID(),
        title: "Penyusunan esai",
        targetDate: "2026-11-04",
        tasks: [
          task("Kumpulkan poin perbandingan spesifikasi", true),
          task("Rapikan esai dan highlight pola bahasa"),
        ],
      },
      {
        id: crypto.randomUUID(),
        title: "Presentasi & pengumpulan",
        targetDate: "2026-11-06",
        tasks: [
          task("Susun materi untuk 5 slide presentasi"),
          task("Periksa hasil dan kumpulkan ke dosen"),
        ],
      },
    ],
  };
  // Exercise the real workspace's scroll containment without touching user data.
  if (new URLSearchParams(location.search).has("long")) {
    project.plan.milestones[1].tasks.push(
      ...Array.from({ length: 30 }, (_, index) =>
        task(`Tugas verifikasi scroll ${index + 1}`),
      ),
    );
  }
  recordProjectProgress(project);
  const other = newProject({
    name: "Belajar untuk kuis",
    brief: "Ulangi materi minggu ini",
    outcome: "Siap kuis",
    deadline: null,
    availability: "",
  });
  const archived = newProject({
    name: "Arsip uji lokal",
    brief: "Data sekali pakai untuk verifikasi arsip.",
    outcome: "",
    deadline: null,
    availability: "",
  });
  archived.status = "archived";
  archived.plan = structuredClone(project.plan);
  state.projects = [project, other, archived];
  state.activeProjectId = project.id;
  state.profile.name = "Raka";
  state.onboarded = true;
  state.tasks = [
    { id: crypto.randomUUID(), title: "Baca ulang catatan kelas", done: false },
    { id: crypto.randomUUID(), title: "Siapkan referensi", done: true },
  ];
  state.messages = [
    {
      id: crypto.randomUUID(),
      role: "user",
      text: "Bantu aku lanjutkan presentasi.",
      createdAt: Date.now(),
      projectId: project.id,
    },
    {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "Kita mulai dari satu slide dulu. Pilih tiga poin perbandingan yang paling penting.",
      createdAt: Date.now(),
      projectId: project.id,
    },
  ];
  const fixtureParams = new URLSearchParams(location.search);
  if (fixtureParams.has("large-text"))
    document.documentElement.style.fontSize = "200%";
  if (fixtureParams.has("blocked")) {
    state.projects = [project];
    for (const milestone of project.plan!.milestones)
      for (const task of milestone.tasks) task.status = "blocked";
  }
  if (fixtureParams.has("complete")) {
    state.projects = [project];
    project.status = "completed";
    for (const milestone of project.plan!.milestones)
      for (const task of milestone.tasks) task.status = "done";
  }
  if (fixtureParams.has("empty")) {
    state.projects = [];
    state.activeProjectId = null;
  }
  if (fixtureParams.has("longname")) {
    state.profile.name = "Raka dengan nama panggilan yang panjang";
    project.name =
      "Riset komparatif dan persiapan presentasi akhir semester untuk kelompok studi sistem tertanam";
  }
  localStorage.setItem("bito-preview", JSON.stringify(state));
  await import("../../src/main");
}
