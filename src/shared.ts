import type { BitoStyle } from "./bito-voice";
import type { HitRegion } from "./chat-layout";
export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  bubbles?: string[];
  createdAt: number;
  status?: "complete" | "interrupted" | "error";
  kind?: "welcome" | "notification";
  notification?: {
    type: "welcome" | "reminder" | "timer" | "reply" | "check-in" | "test";
    sourceId: string;
    handledAt?: number;
  };
  cards?: ResponseCard[];
};
export type ResponseCard =
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
  id: string;
  title: string;
  due: number;
  done: boolean;
  notified: boolean;
  cancelled?: boolean;
};
export type Task = { id: string; title: string; done: boolean };
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
  replyActivity?: { messageId: string; phase: "thinking" | "talking" };
  greeting?: {
    messageId: string;
    phase: "revealing" | "visible" | "dismissing" | "opening";
    talking: boolean;
  };
  dragging: boolean;
  presentation?: {
    purpose?: "login";
    hostActive?: boolean;
    phase: "anchored" | "ready" | "dragging" | "returning" | "departing";
    talking: boolean;
    characterReady: boolean;
    nativeReady?: boolean;
    step: number;
    wave?: number;
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
