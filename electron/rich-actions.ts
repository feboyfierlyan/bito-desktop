import { randomUUID } from "node:crypto";
import { z } from "zod";
import { reminderSchema, remaining } from "./core";
import type { AppState, ResponseCard } from "../src/shared";
import type {
  ToolCall,
  ToolResult,
} from "../supabase/functions/_shared/protocol";

export type ToolReceipt = ToolResult & { card?: ResponseCard };
const title = z.string().trim().min(1).max(240);

/** Mutate local state and produce a card from the exact IDs that were created. */
export function applyRichTool(
  state: AppState,
  call: ToolCall,
): ToolReceipt | undefined {
  if (call.name === "start_focus") {
    const { minutes } = z
      .object({ minutes: z.number().int().min(1).max(180) })
      .strict()
      .parse(call.args);
    state.sleeping = false;
    state.focus = {
      id: call.id,
      duration: minutes * 60,
      remaining: minutes * 60,
      deadline: Date.now() + minutes * 60000,
      running: true,
      active: true,
    };
    return {
      id: call.id,
      ok: true,
      result: `Timer ${minutes} menit sudah dimulai. Kartu timer beserta tombol jeda ditampilkan otomatis.`,
      card: {
        id: call.id,
        kind: "timer",
        timerId: call.id,
        seconds: minutes * 60,
      },
    };
  }
  if (call.name === "create_reminder") {
    const args = z
      .object({ title, due: z.iso.datetime({ offset: true }) })
      .strict()
      .parse(call.args);
    const data = reminderSchema.parse({
      title: args.title,
      due: Date.parse(args.due),
    });
    const reminder = { id: call.id, ...data, done: false, notified: false };
    state.reminders.push(reminder);
    return {
      id: call.id,
      ok: true,
      result: `Pengingat “${data.title}” tersimpan untuk ${new Date(data.due).toISOString()}. Kartu pengingat ditampilkan otomatis.`,
      card: { id: call.id, kind: "reminder", reminderId: reminder.id, ...data },
    };
  }
  if (call.name === "add_task" || call.name === "create_checklist") {
    const args =
      call.name === "add_task"
        ? {
            title: "Tugas",
            items: [z.object({ title }).strict().parse(call.args).title],
          }
        : z
            .object({
              title: title.max(100),
              items: z.array(title).min(1).max(12),
            })
            .strict()
            .parse(call.args);
    const tasks = args.items.map((text) => ({
      id: randomUUID(),
      title: text,
      done: false,
    }));
    state.tasks.push(...tasks);
    return {
      id: call.id,
      ok: true,
      result: `Checklist “${args.title}” tersimpan (${tasks.length} tugas). Checklist interaktif ditampilkan otomatis; jangan ulangi daftar lengkap dalam teks.`,
      card: {
        id: call.id,
        kind: "checklist",
        title: args.title,
        tasks: tasks.map(({ id, title }) => ({ id, title })),
      },
    };
  }
}

const actionSchema = z
  .object({
    messageId: z.string().uuid(),
    cardId: z.string().uuid(),
    operation: z.enum([
      "timer-pause",
      "timer-resume",
      "timer-add",
      "timer-end",
      "task-toggle",
      "reminder-update",
      "reminder-cancel",
    ]),
    taskId: z.string().uuid().optional(),
    title: title.optional(),
    due: z.number().finite().optional(),
  })
  .strict();

export function findCard(state: AppState, messageId: string, cardId: string) {
  const card = state.messages
    .find((m) => m.role === "assistant" && m.id === messageId)
    ?.cards?.find((c) => c.id === cardId);
  if (!card) throw Error("Hasil ini tidak lagi tersedia dalam percakapanmu.");
  return card;
}

export function controlRichAction(state: AppState, raw: unknown) {
  const p = actionSchema.parse(raw);
  const card = findCard(state, p.messageId, p.cardId);
  if (p.operation.startsWith("timer-")) {
    if (
      card.kind !== "timer" ||
      state.focus.id !== card.timerId ||
      state.focus.active === false
    )
      throw Error("Kartu ini milik sesi yang sudah berakhir.");
    const left = remaining(state.focus);
    if (p.operation === "timer-pause") {
      state.focus.remaining = left;
      state.focus.running = false;
      state.focus.deadline = null;
    } else if (p.operation === "timer-resume") {
      if (left <= 0) throw Error("Sesi ini sudah selesai.");
      state.focus.remaining = left;
      state.focus.running = true;
      state.focus.deadline = Date.now() + left * 1000;
    } else if (p.operation === "timer-add") {
      if (left <= 0) throw Error("Sesi ini sudah selesai.");
      if (state.focus.duration + 60 > 180 * 60)
        throw Error("Durasi maksimal tiga jam.");
      state.focus.duration += 60;
      state.focus.remaining = left + 60;
      if (state.focus.running)
        state.focus.deadline = Date.now() + (left + 60) * 1000;
    } else {
      state.focus.running = false;
      state.focus.remaining = 0;
      state.focus.deadline = null;
      state.focus.active = false;
    }
    return;
  }
  if (p.operation === "task-toggle") {
    if (card.kind !== "checklist" || !card.tasks.some((t) => t.id === p.taskId))
      throw Error("Tugas ini tidak ada di checklist.");
    const task = state.tasks.find((t) => t.id === p.taskId);
    if (!task) throw Error("Tugas ini tidak lagi tersedia.");
    task.done = !task.done;
    return;
  }
  if (card.kind !== "reminder") throw Error("Kartu pengingat tidak sesuai.");
  const reminder = state.reminders.find((r) => r.id === card.reminderId);
  if (!reminder) throw Error("Pengingat ini tidak lagi tersedia.");
  if (p.operation === "reminder-cancel") {
    reminder.done = true;
    reminder.cancelled = true;
    return;
  }
  const next = reminderSchema.parse({ title: p.title, due: p.due });
  Object.assign(reminder, next, {
    done: false,
    cancelled: false,
    notified: false,
  });
}
