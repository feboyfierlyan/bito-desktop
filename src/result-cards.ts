import type { Focus, Message, ResponseCard } from "./shared";

export function attachCard(message: Message, card: ResponseCard) {
  const cards = message.cards || (message.cards = []);
  if (cards.some((c) => c.id === card.id)) return;
  if (card.kind === "checklist" && card.title === "Tugas") {
    const group = cards.find(
      (c) => c.kind === "checklist" && c.title === "Tugas",
    );
    if (group?.kind === "checklist") {
      for (const task of card.tasks)
        if (!group.tasks.some((t) => t.id === task.id)) group.tasks.push(task);
      return;
    }
  }
  cards.push(card);
}

export function timerCardState(
  card: Extract<ResponseCard, { kind: "timer" }>,
  focus: Focus,
  now = Date.now(),
) {
  const current = focus.id === card.timerId;
  const seconds = current
    ? focus.running && focus.deadline
      ? Math.max(0, Math.ceil((focus.deadline - now) / 1000))
      : focus.remaining
    : 0;
  return {
    current,
    seconds,
    total: current ? focus.duration : card.seconds,
    status:
      !current || focus.active === false
        ? "ended"
        : seconds === 0
          ? "complete"
          : focus.running
            ? "running"
            : "paused",
  } as const;
}

export function timeDigits(seconds: number) {
  return `${Math.floor(Math.max(0, seconds) / 60)
    .toString()
    .padStart(
      2,
      "0",
    )}:${(Math.max(0, seconds) % 60).toString().padStart(2, "0")}`;
}
