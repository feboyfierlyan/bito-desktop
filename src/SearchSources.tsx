import { BitoDisclosure } from "./ui/BitoDisclosure";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { readWebSearch, webUrl, type WebSearch } from "./web-search";

/** Provider markup is isolated from the app: no scripts, forms, navigation or
 * preload bridge. The parent handles HTTPS links through the existing command. */
function SearchSuggestions({
  html,
  openLink,
}: {
  html: string;
  openLink: (url: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<() => void>(() => {});
  const [height, setHeight] = useState(72);
  useEffect(() => () => cleanup.current(), []);
  const csp =
    "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: https://www.gstatic.com; base-uri 'none'; form-action 'none'; frame-src 'none'";
  return (
    <iframe
      ref={frame}
      className="desktop-search-suggestions"
      title="Saran pencarian Google"
      sandbox="allow-same-origin"
      style={{ height }}
      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;background:white}body{padding:2px;box-sizing:border-box;overflow-wrap:anywhere}</style></head><body>${html}</body></html>`}
      onLoad={() => {
        cleanup.current();
        const doc = frame.current?.contentDocument;
        if (!doc?.body) return;
        const measure = () =>
          setHeight(Math.max(44, Math.min(320, doc.body.scrollHeight + 4)));
        const click = (event: MouseEvent) => {
          // Prevent even malformed provider links from navigating this frame.
          const anchor = (event.target as Element | null)?.closest?.("a");
          if (!anchor) return;
          event.preventDefault();
          const url = webUrl(anchor.getAttribute("href"));
          if (url) openLink(url);
        };
        doc.addEventListener("click", click, true);
        const observer = new ResizeObserver(measure);
        observer.observe(doc.body);
        measure();
        cleanup.current = () => {
          doc.removeEventListener("click", click, true);
          observer.disconnect();
        };
      }}
    />
  );
}

export function SearchSources({
  search: raw,
  openLink,
}: {
  search: WebSearch;
  openLink: (url: string) => void;
}) {
  const search = readWebSearch(raw);
  if (!search) return null;
  return (
    <div className="desktop-search-sources" data-chat-hit>
      <BitoDisclosure>
        <summary>Sumber · {search.sources.length}</summary>
        <ol>
          {search.sources.map((source, index) => (
            <li key={source.url}>
              <a
                href={source.url}
                onClick={(event) => {
                  event.preventDefault();
                  openLink(source.url);
                }}
              >
                <span>
                  {index + 1}. {source.title || new URL(source.url).hostname}
                </span>
                <ArrowUpRight size={12} />
              </a>
            </li>
          ))}
        </ol>
      </BitoDisclosure>
      {search.suggestions && (
        <SearchSuggestions html={search.suggestions} openLink={openLink} />
      )}
    </div>
  );
}
