import type { Message } from "./shared";

const time = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const date = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
});
const datedYear = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const full = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "full",
  timeStyle: "short",
});

export function messageDay(timestamp: number) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
export function messageDayLabel(timestamp: number, now = Date.now()) {
  if (messageDay(timestamp) === messageDay(now)) return "Hari ini";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (messageDay(timestamp) === messageDay(yesterday.getTime()))
    return "Kemarin";
  return (
    new Date(timestamp).getFullYear() === new Date(now).getFullYear()
      ? date
      : datedYear
  ).format(timestamp);
}
export const messageTime = (timestamp: number) => time.format(timestamp);
export const messageFullTime = (timestamp: number) => full.format(timestamp);
export function retryText(messages: readonly Message[], replyId: string) {
  const index = messages.findIndex(
    (m) => m.id === replyId && m.role === "assistant",
  );
  if (index < 0) return undefined;
  return messages
    .slice(0, index)
    .reverse()
    .find((m) => m.role === "user")?.text;
}
