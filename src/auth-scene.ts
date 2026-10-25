import type { AuthView, Snapshot } from "./shared";

export type LoginStage =
  | "idle"
  | "opening"
  | "waiting"
  | "checking"
  | "success"
  | "denied"
  | "offline"
  | "error";
export function loginStage(
  auth: AuthView | undefined,
  busy: "google" | "retry" | "account" | null,
  preview?: Snapshot["loginPreview"],
): LoginStage {
  if (preview && preview !== "idle") return preview;
  if (auth?.status === "ready") return "success";
  if (auth?.status === "checking") return "checking";
  if (busy === "retry" || busy === "account") return "checking";
  if (busy === "google") return "opening";
  if (auth?.status === "signing-in") return "waiting";
  if (auth?.status === "denied") return "denied";
  if (auth?.status === "offline") return "offline";
  if (auth?.error) return "error";
  return "idle";
}
export const loginMessages: Record<LoginStage, string> = {
  idle: "",
  opening: "Membuka browser…",
  waiting: "Lanjutin di browser, ya. Aku tunggu di sini.",
  checking: "Sebentar, aku cek akunmu dulu…",
  success: "Sudah masuk. Kita lanjut, yuk.",
  denied: "Akun ini belum diundang ke demo Bito.",
  offline: "Koneksi terputus. Coba sambungkan lagi.",
  error: "Belum berhasil masuk. Silakan coba lagi.",
};
export const pendingLogin = (stage: LoginStage) =>
  ["opening", "waiting", "checking", "success"].includes(stage);
