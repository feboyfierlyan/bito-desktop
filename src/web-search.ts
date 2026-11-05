/** Grounding evidence is supplied by the provider, never parsed from answer URLs. */
export type WebSearch = {
  sources: { title: string; url: string }[];
  queries: string[];
  suggestions?: string;
};
export function webUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return;
    const host = url.hostname.toLowerCase();
    if (
      !host.includes(".") ||
      host.endsWith(".local") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":")
    )
      return;
    return url.href;
  } catch {
    return;
  }
}
export function readWebSearch(value: unknown): WebSearch | undefined {
  if (!value || typeof value !== "object") return;
  const raw = value as Partial<WebSearch>;
  const sources: WebSearch["sources"] = [];
  for (const source of (Array.isArray(raw.sources) ? raw.sources : []).slice(
    0,
    24,
  )) {
    const url = webUrl(source?.url);
    if (!url || sources.some((item) => item.url === url)) continue;
    sources.push({
      url,
      title:
        typeof source.title === "string"
          ? source.title.slice(0, 180)
          : new URL(url).hostname,
    });
  }
  const queries = (Array.isArray(raw.queries) ? raw.queries : [])
    .filter((q): q is string => typeof q === "string" && !!q.trim())
    .slice(0, 8)
    .map((q) => q.slice(0, 500));
  if (!sources.length || !queries.length) return;
  return {
    sources,
    queries,
    ...(typeof raw.suggestions === "string" && raw.suggestions.length <= 60000
      ? { suggestions: raw.suggestions }
      : {}),
  };
}

/** Link only existing numbered evidence; leave code and authored links intact. */
export function withWebCitations(text: string, search?: WebSearch): string {
  if (!search) return text;
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/\[(\d{1,2})\](?![\[(])/g, (match, number) => {
            const url = webUrl(search.sources[Number(number) - 1]?.url);
            return url ? `[${number}](<${url}>)` : match;
          }),
    )
    .join("");
}
