import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppState, ResponseCard } from "../src/shared";

// Only explicit bulk quick-task requests take this local path. Ordinary project
// edits, questions, quoted instructions and attached documents stay with the AI.
export function quickTaskRemovalScope(text: string): "all" | "done" | undefined {
  const request = text.trim().toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
  // Accept explicit requests in normal Indonesian/English word order, including
  // "remove semua tugas yang ada di quick task". Requiring both a leading
  // action and the named list avoids interpreting questions or project edits
  // as deletion requests. Scope is still reviewed in a confirmation card.
  const action = /^(?:bito[, ]+)?(?:(?:tolong|please|aku mau|bantu|bisa|boleh)\s+)*(?:hapus(?:kan|in)?|remove|delete|bersihkan|clear)\s+(.+)$/.exec(request);
  if (!action) return;
  let target = action[1].replace(/(?:\s+(?:dong|ya|please|sekarang))+$/g, "");
  const done = /\b(?:sudah selesai|udah selesai|selesai|completed|done)\b/.test(target);
  const all = /\b(?:semua(?:nya)?|seluruh|all)\b/.test(target);
  target = target
    .replace(/\b(?:semua(?:nya)?|seluruh|all|sudah selesai|udah selesai|selesai|completed|done)\b/g, " ")
    .replace(/\s+/g, " ").trim();
  if (!/^(?:(?:tugas|tasks?|item)\s+)?(?:(?:yang\s+)?(?:ada\s+)?(?:di|dalam|dari|in|from)\s+)?(?:daftar\s+)?(?:quick[ -]?tasks?|tugas singkat)(?:\s+(?:yang|nya))?$/.test(target)) return;
  return done ? "done" : all ? "all" : undefined;
}

export function prepareQuickTaskRemoval(state: AppState, scope: "all" | "done", now = Date.now()): { text: string; card?: ResponseCard } {
  const tasks = state.tasks.filter((t) => scope === "all" || t.done).map((t) => ({ ...t }));
  if (!tasks.length) return { text: scope === "done" ? "Belum ada tugas singkat selesai yang perlu dihapus." : "Tugas singkatmu sudah kosong." };
  for (const message of state.messages) for (const card of message.cards || [])
    if (card.kind === "quick-task-removal" && card.status === "pending") card.status = "cancelled";
  return {
    text: `Hapus ${tasks.length} tugas singkat${scope === "done" ? " yang sudah selesai" : ""}?`,
    card: { id: randomUUID(), kind: "quick-task-removal", tasks, expiresAt: now + 10 * 60000, status: "pending" },
  };
}

export function confirmQuickTaskRemoval(state: AppState, raw: unknown, now = Date.now()) {
  const args = z.object({ messageId: z.string().uuid(), cardId: z.string().uuid(), action: z.enum(["confirm", "cancel"]) }).strict().parse(raw);
  const card = state.messages.find((m) => m.id === args.messageId && m.role === "assistant")?.cards?.find((c) => c.id === args.cardId);
  if (!card || card.kind !== "quick-task-removal" || card.status !== "pending") throw Error("Permintaan hapus ini sudah tidak aktif.");
  if (args.action === "cancel") { card.status = "cancelled"; return; }
  if (now >= card.expiresAt || now < card.expiresAt - 10 * 60000) throw Error("Konfirmasi sudah kedaluwarsa. Minta hapus lagi, ya.");
  // Snapshot IDs and contents prevent a stale confirmation from deleting newly
  // created or edited tasks, including after a different window updates them.
  const unchanged = card.tasks.every((old) => {
    const live = state.tasks.find((t) => t.id === old.id);
    return live && live.title === old.title && live.done === old.done;
  });
  if (!unchanged) throw Error("Daftar tugas sudah berubah. Minta hapus lagi agar jumlahnya sesuai.");
  const ids = new Set(card.tasks.map((t) => t.id));
  state.tasks = state.tasks.filter((t) => !ids.has(t.id));
  card.status = "removed";
  card.removedCount = ids.size;
}
