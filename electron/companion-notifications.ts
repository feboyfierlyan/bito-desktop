import { remaining } from "./core";
import { reminderDue, timerFinished, replyReady } from "../src/bito-voice";
import type { AppState, Message, ResponseCard } from "../src/shared";

export type NoticeType = NonNullable<Message["notification"]>["type"];
export type NoticeInput = {
  id: string;
  type: NoticeType;
  sourceId: string;
  text: string;
  createdAt: number;
  cards?: ResponseCard[];
};

/** Store the event and its transcript entry together; retries never add a second message. */
export function enqueueNotice(state: AppState, input: NoticeInput) {
  const existing = state.messages.find(
    (message) =>
      message.notification?.type === input.type &&
      message.notification.sourceId === input.sourceId,
  );
  if (existing) return { message: existing, added: false };
  const message: Message = {
    id: input.id,
    role: "assistant",
    kind: input.type === "welcome" ? "welcome" : "notification",
    text: input.text,
    createdAt: input.createdAt,
    status: "complete",
    cards: input.cards,
    notification: { type: input.type, sourceId: input.sourceId },
  };
  state.messages.push(message);
  return { message, added: true };
}

export function noticeIsRelevant(
  state: AppState,
  message: Message,
  now: number,
) {
  const notice = message.notification;
  if (!notice) return false;
  if (notice.type === "reminder") {
    return state.reminders.some(
      (reminder) =>
        !reminder.done &&
        !reminder.cancelled &&
        reminder.due <= now &&
        `${reminder.id}:${reminder.due}` === notice.sourceId,
    );
  }
  if (notice.type === "reply") {
    return (
      now - message.createdAt < 10 * 60000 &&
      state.messages.some(
        (reply) =>
          reply.id === notice.sourceId &&
          ["complete", "error"].includes(reply.status || ""),
      )
    );
  }
  if (notice.type === "check-in") {
    return (
      state.profile.proactive === "sometimes" &&
      now - message.createdAt < 10 * 60000
    );
  }
  if (notice.type === "welcome" || notice.type === "test")
    return now - message.createdAt < 5 * 60000;
  return true;
}

/** Opening chat consumes pending notices there; obsolete reminders never resurface. */
export function settleNotices(state: AppState, now: number, chatOpen: boolean) {
  let changed = false;
  for (const message of state.messages) {
    if (
      message.notification &&
      message.notification.handledAt === undefined &&
      (chatOpen || !noticeIsRelevant(state, message, now))
    ) {
      message.notification.handledAt = now;
      changed = true;
    }
  }
  return changed;
}

const priority: Record<NoticeType, number> = {
  reminder: 0,
  timer: 0,
  reply: 1,
  welcome: 2,
  "check-in": 3,
  test: 0,
};
export function nextNotice(state: AppState, now: number) {
  return state.messages
    .filter(
      (message) =>
        message.notification &&
        message.notification.handledAt === undefined &&
        noticeIsRelevant(state, message, now),
    )
    .sort(
      (a, b) =>
        priority[a.notification!.type] - priority[b.notification!.type] ||
        a.createdAt - b.createdAt,
    )[0];
}

export function canPresentNotice(context: {
  onboarded: boolean;
  locked: boolean;
  setup: boolean;
  dnd: boolean;
  sleeping: boolean;
  dragging: boolean;
  characterReady: boolean;
  chatOpen: boolean;
  activeBubble: boolean;
  now: number;
  notBefore: number;
}) {
  return (
    context.onboarded &&
    !context.locked &&
    !context.setup &&
    !context.dnd &&
    !context.sleeping &&
    !context.dragging &&
    context.characterReady &&
    !context.chatOpen &&
    !context.activeBubble &&
    context.now >= context.notBefore
  );
}

/** Capturing due events is independent of presentation: DND delays the bubble,
 * not the durable reminder/timer event. The caller saves this state atomically. */
export function collectDueNotices(
  state: AppState,
  now: number,
  createId: () => string,
) {
  let changed = false;
  if (state.focus.running && remaining(state.focus, now) === 0) {
    const sourceId = state.focus.id || `timer:${state.focus.deadline}`;
    state.focus = {
      ...state.focus,
      running: false,
      remaining: 0,
      deadline: null,
    };
    enqueueNotice(state, {
      id: createId(),
      type: "timer",
      sourceId,
      createdAt: now,
      text: timerFinished(state.profile.style),
      cards: state.focus.id
        ? [
            {
              id: createId(),
              kind: "timer",
              timerId: state.focus.id,
              seconds: state.focus.duration,
            },
          ]
        : undefined,
    });
    changed = true;
  }
  for (const reminder of state.reminders) {
    if (
      reminder.done ||
      reminder.cancelled ||
      reminder.notified ||
      reminder.due > now
    )
      continue;
    reminder.notified = true;
    enqueueNotice(state, {
      id: createId(),
      type: "reminder",
      sourceId: `${reminder.id}:${reminder.due}`,
      text: reminderDue(reminder.title, state.profile.style),
      createdAt: now,
      cards: [
        {
          id: createId(),
          kind: "reminder",
          reminderId: reminder.id,
          title: reminder.title,
          due: reminder.due,
        },
      ],
    });
    changed = true;
  }
  return changed;
}

export function enqueueReplyNotice(
  state: AppState,
  reply: Message,
  chatOpen: boolean,
  now: number,
  createId: () => string,
) {
  if (chatOpen || !["complete", "error"].includes(reply.status || ""))
    return false;
  return enqueueNotice(state, {
    id: createId(),
    type: "reply",
    sourceId: reply.id,
    createdAt: now,
    text: replyReady(state.profile.style, reply.status === "error"),
  }).added;
}
