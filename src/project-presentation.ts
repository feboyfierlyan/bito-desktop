/** Presentation rules shared by task intake and the compact task summary. */
export function newTaskBrief(text: string, name = "", deadline = "") {
  const story = text.trim();
  const firstLine = story.split(/\n/)[0].replace(/\s+/g, " ").trim();
  return {
    name: name.trim() || firstLine.slice(0, 70) || "Tugas baru",
    brief: story,
    outcome: "",
    deadline: deadline || null,
    availability: "",
  };
}

export function visibleBlocker(value?: string | null) {
  const text = value?.trim() || "";
  const normalized = text
    .toLocaleLowerCase("id-ID")
    .replace(/[.!]+$/, "")
    .trim();
  return /^(?:tidak ada(?: hambatan| kendala)?|nggak ada|ga ada|belum ada(?: hambatan| kendala)?|none|nihil|no blockers?|n\/a|-)$/.test(
    normalized,
  )
    ? ""
    : text;
}
