import type { Project } from "./projects";
import type { BitoStyle } from "./bito-voice";
import type { WebSearch } from "./web-search";
import type { HitRegion } from "./chat-layout";
export type AttachmentPreview = { name: string; kind: "text" | "pdf" | "image" | "area"; thumbnail?: string; excerpt?: string };
export type Message = {
  projectId?: string;
  id: string;
  role: "user" | "assistant";
  text: string;
  displayText?: string;
  attachments?: { name: string; kind: "text" | "pdf" | "image" }[];
  bubbles?: string[];
  createdAt: number;
  status?: "complete" | "interrupted" | "error";
  kind?: "welcome" | "notification";
  notification?: {
    type:
      | "welcome"
      | "reminder"
      | "timer"
      | "work-session"
      | "reply"
      | "check-in"
      | "project-coach"
      | "test";
    sourceId: string;
    handledAt?: number;
    coach?: {
      reason: "start" | "resume" | "deadline" | "blocked" | "progress";
      taskId: string | null;
      anchor: string;
    };
  };
  selectedArea?: { id: string; width: number; height: number };
  cards?: ResponseCard[];
  webSearch?: WebSearch;
};
export type ResponseCard =
  | { id: string; kind: "quick-task-removal"; tasks: Task[]; expiresAt: number; status: "pending" | "cancelled" | "removed"; removedCount?: number }
  | { id: string; kind: "saved-work"; view?: "tasks" | "schedule" | "priority" }
  | {
      id: string;
      kind: "project";
      projectId: string;
      title: string;
      draftId: string | null;
      stage?: "understanding" | "status";
      minutes?: number;
    }
  | { id: string; kind: "timer"; timerId: string; seconds: number }
  | {
      id: string;
      kind: "reminder";
      reminderId: string;
      title: string;
      due: number;
    }
  | {
      id: string;
      kind: "checklist";
      title: string;
      tasks: { id: string; title: string }[];
    }
  | {
      id: string;
      kind: "file";
      fileId: string;
      name: string;
      format: "txt" | "md" | "csv";
      bytes: number;
    };
export type Reminder = {
  projectId?: string;
  id: string;
  title: string;
  due: number;
  done: boolean;
  notified: boolean;
  cancelled?: boolean;
};
export type Task = { id: string; title: string; done: boolean; details?: string; dueDate?: string | null; priority?: number };
export type Memory = { id: string; text: string };
export type Profile = {
  name: string;
  project: string;
  goal?: string;
  style: BitoStyle;
  proactive: "sometimes" | "on-demand" | "quiet";
};
export type Settings = {
  model: string;
  baseURL: string;
  alwaysOnTop: boolean;
  size: number;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  launchAtLogin: boolean;
  dnd: boolean;
  projectNudges: boolean;
  nudgeCadence: "gentle" | "balanced";
  nudgeStartHour: number;
  nudgeEndHour: number;
};
export type Focus = {
  id?: string;
  duration: number;
  remaining: number;
  deadline: number | null;
  running: boolean;
  active?: boolean;
};
export type AppState = {
  projectCompanion?: {
    snoozedUntil: number;
    lastEngagedAt: number;
    offers: { key: string; at: number }[];
  };
  projects: Project[];
  activeProjectId: string | null;
  onboarded: boolean;
  onboardingStep: number;
  profile: Profile;
  settings: Settings;
  messages: Message[];
  reminders: Reminder[];
  tasks: Task[];
  memories: Memory[];
  focus: Focus;
  sleeping: boolean;
  position: { x: number; y: number } | null;
  chatSize?: { width: number; height: number };
};
export type AuthView = {
  configured: boolean;
  status:
    | "unconfigured"
    | "signed-out"
    | "signing-in"
    | "checking"
    | "ready"
    | "denied"
    | "offline";
  email?: string;
  userId?: string;
  error?: string;
};
export type Snapshot = AppState & {
  messagePreviews?: Record<string, AttachmentPreview[]>;
  calendar?: import("./calendar").CalendarConnection;
  quickTasksNavigation?: string;
  projectCreationNavigation?: string;
  projectNavigation?: {
    id: string;
    projectId: string;
    tab: "overview" | "understanding" | "plan";
  };
  revisionMode?: boolean;
  loginPreview?:
    | "idle"
    | "opening"
    | "waiting"
    | "checking"
    | "success"
    | "denied"
    | "offline";
  auth?: AuthView;
  hasKey: boolean;
  demoMode?: boolean;
  busy: boolean;
  chatOpen: boolean;
  chatSide?: "left" | "right";
  chatResizing?: boolean;
  chatWave?: number;
  replyActivity?: {
    messageId: string;
    phase: "thinking" | "talking" | "searching";
  };
  guideActivity?: "thinking" | "talking" | "waiting";
  selectedArea?: import("./area-selection").SelectedArea;
  greeting?: {
    messageId: string;
    phase: "revealing" | "visible" | "dismissing" | "opening";
    talking: boolean;
  };
  dragging: boolean;
  storageError?: string;
  presentation?: {
    purpose?: "login";
    hostActive?: boolean;
    phase: "anchored" | "ready" | "dragging" | "returning" | "departing";
    talking: boolean;
    characterReady: boolean;
    nativeReady?: boolean;
    step: number;
    wave?: number;
    release?: import("./pet-release").PetRelease;
  };
  surface?: string;
};
export type Reply = { ok: boolean; error?: string; value?: unknown };
export type GazeTarget = { active: boolean; x: number; y: number };
export type DragMotion =
  | { phase: "start"; x: number; y: number; grab: { x: number; y: number } }
  | { phase: "move"; x: number; y: number }
  | { phase: "end" };
export interface BitoAPI {
  prepareDroppedFiles?(files: File[], slots: number): Promise<Reply>;
  getState(): Promise<Snapshot>;
  command(name: string, payload?: unknown): Promise<Reply>;
  onState(fn: (state: Snapshot) => void): () => void;
  onSettingsClose?(fn: () => void): () => void;
  onDelta(
    fn: (event: { id: string; delta: string; bubble?: number }) => void,
  ): () => void;
  onGaze(fn: (target: GazeTarget) => void): () => void;
  onDragMotion(fn: (motion: DragMotion) => void): () => void;
  dragStart(): void;
  dragMove(dx: number, dy: number): void;
  dragEnd(): void;
  setHit(hit: boolean): void;
  setChatRegions(regions: HitRegion[]): void;
  contextMenu(): void;
  toggleChat(): void;
}
declare global {
  interface Window {
    bito?: BitoAPI;
  }
}
