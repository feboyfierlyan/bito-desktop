export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  status?: "complete" | "interrupted" | "error";
};
export type Reminder = {
  id: string;
  title: string;
  due: number;
  done: boolean;
  notified: boolean;
};
export type Task = { id: string; title: string; done: boolean };
export type Memory = { id: string; text: string };
export type Profile = {
  name: string;
  project: string;
  goal?: string;
  style: "warm" | "calm" | "direct";
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
};
export type Snapshot = AppState & {
  hasKey: boolean;
  busy: boolean;
  chatOpen: boolean;
  dragging: boolean;
  presentation?: {
    phase: "anchored" | "ready" | "dragging" | "returning" | "departing";
    talking: boolean;
    characterReady: boolean;
    step: number;
  };
  surface?: string;
};
export type Reply = { ok: boolean; error?: string; value?: unknown };
export interface BitoAPI {
  getState(): Promise<Snapshot>;
  command(name: string, payload?: unknown): Promise<Reply>;
  onState(fn: (state: Snapshot) => void): () => void;
  onDelta(fn: (event: { id: string; delta: string }) => void): () => void;
  dragStart(): void;
  dragMove(dx: number, dy: number): void;
  dragEnd(): void;
  setHit(hit: boolean): void;
  contextMenu(): void;
  toggleChat(): void;
}
declare global {
  interface Window {
    bito?: BitoAPI;
  }
}
