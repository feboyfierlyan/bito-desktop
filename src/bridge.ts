import { parseQuickTask, updateQuickTask } from "./task-capture";
import type { BitoAPI, Snapshot } from "./shared";
import { projectCommand } from "../electron/projects";
import { projectCoachAction } from "../electron/project-companion";
import { canWave } from "./handoff";
import { defaultState } from "../electron/core";
// Browser preview is deliberately separate from the real Electron bridge.
let preview: Snapshot = {
  ...defaultState(),
  ...JSON.parse(localStorage.getItem("bito-preview") || "{}"),
  hasKey: false,
  busy: false,
  chatOpen: true,
  dragging: false,
  presentation: undefined,
};
const listeners = new Set<(s: Snapshot) => void>();
function emit() {
  const { presentation: _temporary, ...saved } = preview;
  localStorage.setItem("bito-preview", JSON.stringify(saved));
  listeners.forEach((fn) => fn({ ...preview }));
}
const fallback: BitoAPI = {
  getState: async () => ({ ...preview }),
  onState: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  onDelta: () => () => {},
  onGaze: () => () => {},
  onDragMotion: () => () => {},
  dragStart() {},
  dragMove() {},
  dragEnd() {},
  setHit() {},
  setChatRegions() {},
  contextMenu() {},
  toggleChat() {},
  async command(name, p: any) {
    if (name.startsWith("calendar-")) return { ok: false, error: "Calendar tersedia di aplikasi desktop." };
    if (name === "companion-action") {
      try {
        const action = projectCoachAction(preview, p);
        preview.greeting = undefined;
        if (action.action !== "later") {
          preview.projectNavigation = {
            id: crypto.randomUUID(),
            projectId: action.projectId,
            tab: "overview",
          };
          window.dispatchEvent(
            new CustomEvent("bito-route", { detail: "projects" }),
          );
        }
        emit();
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Saran sudah berubah.",
        };
      }
    }
    if (
      name === "project-import-material" ||
      name === "project-create-from-file"
    )
      return {
        ok: false,
        error:
          "Tambahkan PDF/gambar dari aplikasi desktop Bito yang dibuka lewat mode revisi.",
      };
    if (name === "new-project-consumed") {
      if (p === preview.projectCreationNavigation) {
        preview.projectCreationNavigation = undefined;
        emit();
      }
      return { ok: true };
    }
    if (name === "new-project") {
      preview.projectNavigation = undefined;
      preview.quickTasksNavigation = undefined;
      preview.projectCreationNavigation = crypto.randomUUID();
      emit();
      window.dispatchEvent(new CustomEvent("bito-route", { detail: "projects" }));
      return { ok: true };
    }
    if (name === "project-open") {
      preview.projectCreationNavigation = undefined;
      if (p)
        projectCommand(
          preview,
          "project-select",
          typeof p === "string" ? p : p.id,
        );
      if (preview.activeProjectId)
        preview.projectNavigation = {
          id: crypto.randomUUID(),
          projectId: preview.activeProjectId,
          tab: typeof p === "object" && p?.tab ? p.tab : "overview",
        };
      emit();
      window.dispatchEvent(
        new CustomEvent("bito-route", { detail: "projects" }),
      );
      return { ok: true };
    }
    if (name.startsWith("project-")) {
      try {
        const result = projectCommand(preview, name, p);
        if (name === "project-create") preview.projectCreationNavigation = undefined;
        emit();
        return result;
      } catch (e) {
        return {
          ok: false,
          error:
            e instanceof Error ? e.message : "Proyek belum bisa diperbarui.",
        };
      }
    }
    if (
      name === "onboarding-wave" &&
      canWave(preview.presentation) &&
      Date.now() - (preview.presentation!.wave || 0) > 650
    ) {
      preview.presentation!.wave = Date.now();
    }
    if (name === "onboarding-speech") {
      preview.presentation = {
        phase: "anchored",
        step: preview.onboardingStep,
        characterReady: true,
        ...preview.presentation,
        talking: p,
      };
    }
    if (name === "onboarding-arm" && preview.presentation)
      preview.presentation.phase = "ready";
    if (name === "onboarding") {
      preview = {
        ...preview,
        profile: p.profile,
        onboardingStep: p.step,
        presentation: preview.presentation
          ? { ...preview.presentation, step: p.step, phase: "anchored" }
          : undefined,
        onboarded: preview.onboarded,
      };
      if (p.complete) location.search = "?surface=chat";
    }
    if (name === "profile") preview.profile = p;
    if (name === "profile-patch")
      preview.profile = { ...preview.profile, ...p };
    if (name === "settings") preview.settings = p;
    if (name === "settings-patch")
      preview.settings = { ...preview.settings, ...p };
    if (name === "show-settings")
      location.search = `?surface=${p || "settings"}`;
    if (name === "show-chat") location.search = "?surface=chat";
    if (name === "focus-start")
      preview.focus = {
        duration: p * 60,
        remaining: p * 60,
        deadline: Date.now() + p * 60000,
        running: true,
        active: true,
      };
    if (name === "focus-pause") {
      preview.focus.remaining = Math.max(
        0,
        Math.ceil(((preview.focus.deadline || Date.now()) - Date.now()) / 1000),
      );
      preview.focus.running = false;
    }
    if (name === "focus-resume") {
      preview.focus.running = true;
      preview.focus.deadline = Date.now() + preview.focus.remaining * 1000;
    }
    if (name === "focus-end") preview.focus = defaultState().focus;
    if (name === "task-add")
      preview.tasks.push({ id: crypto.randomUUID(), ...parseQuickTask(p), done: false });
    if (name === "task-update") updateQuickTask(preview.tasks, p);
    if (name === "task-toggle")
      preview.tasks = preview.tasks.map((t) =>
        t.id === p ? { ...t, done: !t.done } : t,
      );
    if (name === "reminder-add")
      preview.reminders.push({
        ...p,
        id: crypto.randomUUID(),
        done: false,
        notified: false,
      });
    if (name === "reminder-done")
      preview.reminders = preview.reminders.map((r) =>
        r.id === p ? { ...r, done: true } : r,
      );
    if (name === "memory-add")
      preview.memories.push({ id: crypto.randomUUID(), text: p });
    if (name === "memory-delete")
      preview.memories = preview.memories.filter((m) => m.id !== p);
    if (name === "sleep") preview.sleeping = p;
    if (
      [
        "send",
        "api-key",
        "test-ai",
        "read-document",
        "save-note",
        "export",
      ].includes(name)
    )
      return {
        ok: false,
        error: "Fitur ini tersedia di aplikasi desktop. Jalankan npm run dev.",
      };
    emit();
    return { ok: true };
  },
};
export const api = window.bito || fallback;
export const isDesktop = !!window.bito;
