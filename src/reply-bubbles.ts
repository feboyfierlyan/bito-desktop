import type { Message } from "./shared";

/** Explicit boundaries plus deterministic conversational sentence/paragraph splits. */
export const BUBBLE_SEPARATOR = "[[BITO_BUBBLE]]";
export const MAX_REPLY_BUBBLES = 24;

export function preserveReplyFormatting(request: string) {
  return /\b(email|e-mail|surat|kode|code|script|skrip|sql|json|csv|markdown|dokumen|document|template|tabel|table|puisi|poem|kutipan)\b|(?:satu|1)\s+(?:bubble|pesan)|(?:persis|verbatim|siap\s+(?:salin|copy))/i.test(
    request,
  );
}

/** Decode the whole prefix so network chunks can split any control token.
 * Markdown fences and inline code remain literal and are never divided. */
export function splitReplyBubbles(
  raw: string,
  final = false,
  verbatim = false,
): string[] {
  const parts = [""];
  const separate = () => {
    if (!parts.at(-1)!.trim()) return;
    if (parts.length < MAX_REPLY_BUBBLES) parts.push("");
    else parts[parts.length - 1] += "\n\n";
  };
  let fence = "",
    fenceLength = 0,
    inline = 0;
  for (let i = 0; i < raw.length;) {
    if (i === 0 || raw[i - 1] === "\n") {
      const line = raw.slice(i).match(/^ {0,3}(`{3,}|~{3,})([^\n]*)(?:\n|$)/);
      const afterFence = line?.[2].trimStart() || "";
      const controlAfterFence =
        !!afterFence &&
        (afterFence.startsWith(BUBBLE_SEPARATOR) ||
          BUBBLE_SEPARATOR.startsWith(afterFence));
      if (
        line &&
        (!fence ||
          (line[1][0] === fence &&
            line[1].length >= fenceLength &&
            (!line[2].trim() || controlAfterFence)))
      ) {
        if (fence) {
          fence = "";
          fenceLength = 0;
        } else {
          fence = line[1][0];
          fenceLength = line[1].length;
        }
        const consumed = controlAfterFence
          ? line[0].indexOf("[")
          : line[0].length;
        parts[parts.length - 1] += line[0].slice(0, consumed);
        i += consumed;
        continue;
      }
    }
    if (!fence && raw[i] === "`") {
      const ticks = raw.slice(i).match(/^`+/)![0];
      if (!inline) inline = ticks.length;
      else if (ticks.length === inline) inline = 0;
      parts[parts.length - 1] += ticks;
      i += ticks.length;
      continue;
    }
    if (!fence && !inline && raw.startsWith(BUBBLE_SEPARATOR, i)) {
      if (verbatim) parts[parts.length - 1] += "\n\n";
      else separate();
      i += BUBBLE_SEPARATOR.length;
      continue;
    }
    if (!fence && !inline && BUBBLE_SEPARATOR.startsWith(raw.slice(i))) {
      // Do not flash a partial separator while streaming. Drop a truncated
      // protocol token at EOF; a lone literal '[' still remains valid text.
      if (!final || raw.length - i >= 6) break;
    }
    // Do not reinterpret content already delivered to the UI: a boundary needs
    // following content, and punctuation/whitespace is held on the old bubble.
    if (!verbatim && !fence && !inline) {
      const paragraph = parts.at(-1)!;
      const structured = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|\|)/.test(
        paragraph + raw.slice(i, i + 2),
      );
      const blank = raw.slice(i).match(/^\n[ \t\r\n]*(?=\S)/);
      if (blank && !structured) {
        separate();
        i += blank[0].length;
        continue;
      }
      const ending = raw
        .slice(i)
        .match(
          /^[.!?]+[”"'’)\]]*(?:[ \t]*\p{Extended_Pictographic}[\p{Extended_Pictographic}\uFE0F\u200D]*)*[ \t]+(?=[\p{L}\p{N}])/u,
        );
      const word = paragraph.match(/\S+$/)?.[0] || "";
      const abbreviation =
        /(?:\b(?:dr|prof|mr|mrs|dll|dsb|spt|no|pt|cv|rp|tgl)|\b[a-z]|e\.g|i\.e)$/i.test(
          word,
        );
      const address = /(?:https?:\/\/|www\.|@)/i.test(word);
      if (
        ending &&
        !structured &&
        !address &&
        !(raw[i] === "." && abbreviation)
      ) {
        parts[parts.length - 1] += ending[0].trimEnd();
        separate();
        i += ending[0].length;
        continue;
      }
    }
    parts[parts.length - 1] += raw[i++];
  }
  return parts
    .map((part) => part.replace(/^\s*\n+/, "").trimEnd())
    .filter((part) => !!part.trim());
}

export function messageBubbleTexts(
  message: Pick<Message, "text" | "bubbles" | "cards">,
) {
  const parts = message.bubbles?.filter((part) => !!part.trim());
  return parts?.length
    ? parts
    : message.text || !message.cards?.length
      ? [message.text]
      : [];
}

export type ReplyDelta = { id: string; delta: string; bubble?: number };
export function appendReplyDelta(message: Message, event: ReplyDelta): Message {
  if (message.id !== event.id) return message;
  if (event.bubble === undefined)
    return { ...message, text: message.text + event.delta };
  if (
    !Number.isInteger(event.bubble) ||
    event.bubble < 0 ||
    event.bubble >= MAX_REPLY_BUBBLES
  )
    return message;
  const bubbles =
    message.bubbles?.slice() || (message.text ? [message.text] : []);
  // A missing earlier event should not invent empty visible bubbles.
  if (event.bubble > bubbles.length) return message;
  bubbles[event.bubble] = (bubbles[event.bubble] || "") + event.delta;
  return { ...message, bubbles, text: bubbles.join("\n\n") };
}

export function bubblePause(previous: string, next = "") {
  const words = (text: string) =>
    text.trim().split(/\s+/).filter(Boolean).length;
  // Give the previous message reading room, then show a deliberate typing beat.
  return Math.min(
    3600,
    Math.max(1600, 1050 + words(previous) * 45 + words(next) * 80),
  );
}
