import { BitoMascot } from "./ui/BitoMascot";
import {ChatPopover} from "./ui/ChatPopover";
import { AttachmentCard } from "./ui/AttachmentCard";
import type { AttachmentPreview } from "./shared";
import { ChatComposer } from "@astryxdesign/core/Chat";
import { MotionBitoButton, BitoButton } from "./ui/controls";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useMotionValue,
  useSpring,
} from "motion/react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Pause,
  AlertCircle,
  Bookmark,
  Check,
  Copy,
  FileText,
  MoreVertical,
  Paperclip,
  FolderOpen,
  ScanLine,
  RefreshCw,
  Settings,
  Square,
  X,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bubble } from "./Bubble";
import { SearchSources } from "./SearchSources";
import { withWebCitations } from "./web-search";
import { ResponseCards } from "./ResponseCards";
import { ChatProjectSelector } from "./ChatProjectSelector";
import { api } from "./bridge";
import {
  clipRegion,
  transcriptHeight as measureTranscript,
} from "./chat-layout";
import { createChatReflow, reflowWords } from "./chat-reflow";
import {
  messageDay,
  messageDayLabel,
  messageTime,
  messageFullTime,
  retryText,
} from "./message-meta";
import {
  chatPanelReveal,
  panelHitBounds,
  clipToPanel,
} from "./chat-panel-motion";
import { messageBubbleTexts } from "./reply-bubbles";
import type { Message, Reply, Snapshot } from "./shared";

type Act = (name: string, payload?: unknown) => Promise<Reply>;
const MessageText = memo(function MessageText({
  text,
  openLink,
}: {
  text: string;
  openLink: (href: string) => void;
}) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[reflowWords]}
      components={{
        a: ({ href, children }) => (
          <a
            href={href}
            onClick={(event) => {
              event.preventDefault();
              if (href) openLink(href);
            }}
          >
            {children}
          </a>
        ),
      }}
    >
      {text}
    </Markdown>
  );
});
export function DesktopChat({
  state,
  act,
  panels,
}: {
  state: Snapshot;
  act: Act;
  panels: { focus: ReactNode; tasks: ReactNode };
}) {
  const latestAct = useRef(act);
  const latestState = useRef(state);
  latestState.current = state;
  latestAct.current = act;
  const openLink = useCallback((href: string) => {
    void latestAct.current("open-link", href);
  }, []);
  const [text, setText] = useState("");
  const contentVisible = state.chatOpen;
  const [panelReady, setPanelReady] = useState(false);
  const panelFrame = useRef<HTMLDivElement>(null);
  const panelMask = useRef("");
  const lastPanelHeight = useRef(0);
  const greetingHandoff = state.chatOpen && state.greeting?.phase === "opening";
  const [files, setFiles] = useState<
    {
      id: string;
      name: string;
      kind: "text" | "pdf" | "image";
      warnings?: string[];
      preview?: AttachmentPreview;
    }[]
  >([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const dropDepth = useRef(0);
  const readingFiles = useRef(false);
  const fileRail = useRef<HTMLDivElement>(null);
  const [fileRailHeight, setFileRailHeight] = useState(62);
  const currentFileScope = `${state.auth?.userId || "preview"}:${state.activeProjectId || "general"}`;
  const fileScope = useRef(currentFileScope);
  useEffect(() => {
    if (fileScope.current !== currentFileScope) {
      setFiles([]);
      setFileError("");
    }
    fileScope.current = currentFileScope;
  }, [currentFileScope]);
  async function prepareFiles(dropped?: File[]) {
    if (readingFiles.current || state.busy || sending.current) return;
    setFileError("");
    if (files.length >= 3 || (dropped && dropped.length + files.length > 3)) {
      setFileError("Maksimal tiga lampiran sekali kirim.");
      return;
    }
    readingFiles.current = true;
    const scope = fileScope.current;
    setFileBusy(true);
    try {
      const result = dropped
        ? await api.prepareDroppedFiles!(dropped, 3 - files.length)
        : await act("chat-prepare-files", { slots: 3 - files.length });
      if (scope !== fileScope.current) return;
      if (!result.ok) throw Error(result.error || "File belum bisa dibaca.");
      const added = result.value as typeof files;
      if (added?.length) {
        setFiles((previous) => [...previous, ...added].slice(0, 3));
      }
    } catch (error) {
      if (scope === fileScope.current)
        setFileError(
          error instanceof Error
            ? error.message
            : "File belum bisa dibaca. Coba lagi.",
        );
    } finally {
      readingFiles.current = false;
      setFileBusy(false);
    }
  }
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<"chat" | "focus" | "tasks">("chat");
  const [messageMenu, setMessageMenu] = useState<{
    message: Message;
    x: number;
    y: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [composerHeight, setComposerHeight] = useState(42);
  const filesVisible = !!(files.length || fileBusy || fileError || state.selectedArea);
  useEffect(() => {
    const node = fileRail.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setFileRailHeight(node.offsetHeight),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filesVisible]);
  const attachmentHeight = filesVisible ? fileRailHeight : 0;
  const contextSpace = attachmentHeight + 26;
  const [composerWidth, setComposerWidth] = useState(() => innerWidth - 32);
  const [transcriptHeight, setTranscriptHeight] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const [today, setToday] = useState(Date.now);
  const openingCount = useRef(state.messages.length);
  const wasOpen = useRef(false);
  const resizeGrip = useRef<HTMLButtonElement>(null);
  const resizingPointer = useRef<number | null>(null);
  const reflow = useRef<ReturnType<typeof createChatReflow> | null>(null);
  const reducedRef = useRef(false);
  const gripOrigin = useRef({ x: 0, y: 0 });
  const [gripHovered, setGripHovered] = useState(false);
  const [gripHeld, setGripHeld] = useState(false);
  const gripX = useMotionValue(0),
    gripY = useMotionValue(0);
  const gripSpringX = useSpring(gripX, {
    stiffness: 540,
    damping: 32,
    mass: 0.5,
  });
  const gripSpringY = useSpring(gripY, {
    stiffness: 540,
    damping: 32,
    mass: 0.5,
  });
  const root = useRef<HTMLElement>(null),
    scroller = useRef<HTMLDivElement>(null),
    stack = useRef<HTMLDivElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null),
    dots = useRef<HTMLButtonElement>(null),
    composerArea = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLFormElement>(null);
  const seen = useRef(new Set(state.messages.map((m) => m.id)));
  const seenBubbles = useRef(
    new Set(
      state.messages.flatMap((m) =>
        messageBubbleTexts(m).map((_, i) => `${m.id}:${i}`),
      ),
    ),
  );
  const seenCards = useRef(
    new Set(state.messages.flatMap((m) => m.cards?.map((c) => c.id) || [])),
  );
  const following = useRef(true),
    scrolling = useRef(false),
    scrollFrame = useRef(0),
    geometryFrame = useRef(0);
  const sending = useRef(false),
    geometry = useRef("");
  const osReduced = useReducedMotion(),
    reduced = state.settings.reducedMotion || !!osReduced;
  reducedRef.current = reduced;
  useEffect(() => {
    const next = new Date();
    next.setHours(24, 0, 0, 50);
    const refresh = () => setToday(Date.now());
    const timer = setTimeout(refresh, next.getTime() - Date.now());
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [today]);
  useLayoutEffect(() => {
    setPanelReady(false);
  }, [state.chatOpen]);
  const updateScrollFade = useCallback(() => {
    const el = scroller.current;
    if (el) {
      el.style.setProperty(
        "--fade-start",
        String(1 - Math.min(1, Math.max(0, el.scrollTop) / 22)),
      );
      setShowLatest(
        !following.current &&
          el.scrollHeight - el.clientHeight - el.scrollTop > 36,
      );
    }
  }, []);
  const releaseGrip = () => {
    setGripHeld(false);
    gripX.set(0);
    gripY.set(0);
  };
  useEffect(() => {
    if (!state.chatResizing) {
      setGripHeld(false);
      gripX.set(0);
      gripY.set(0);
    }
  }, [state.chatResizing, gripX, gripY]);
  const reportRegions = useCallback(() => {
    cancelAnimationFrame(geometryFrame.current);
    geometryFrame.current = requestAnimationFrame(() => {
      if (!latestState.current.chatOpen && latestState.current.greeting) return;
      if (!root.current) return;
      const viewport = scroller.current?.getBoundingClientRect();
      const frame = panelFrame.current?.getBoundingClientRect();
      const visiblePanel = frame
        ? panelHitBounds(frame, panelMask.current)
        : undefined;
      const regions = Array.from(
        root.current.querySelectorAll<HTMLElement>("[data-chat-hit]"),
      )
        .filter((el) => !el.closest("[inert]"))
        .flatMap((el) => {
          const b = el.getBoundingClientRect();
          let region = { x: b.x, y: b.y, width: b.width, height: b.height };
          if (
            el !== scroller.current &&
            el.closest(".desktop-chat-messages") &&
            viewport
          ) {
            const clipped = clipRegion(region, {
              x: viewport.x,
              y: viewport.y,
              width: viewport.width,
              height: viewport.height,
            });
            if (!clipped) return [];
            region = clipped;
          }
          const contained = visiblePanel && !el.closest("[data-chat-overlay]")
            ? clipToPanel(region, visiblePanel)
            : region;
          return contained && contained.width > 0 && contained.height > 0
            ? [contained]
            : [];
        });
      const next = JSON.stringify(
        regions.map((r) => ({
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.ceil(r.width),
          height: Math.ceil(r.height),
        })),
      );
      if (next !== geometry.current) {
        geometry.current = next;
        api.setChatRegions(JSON.parse(next));
      }
    });
  }, []);
  const followBottom = useCallback(() => {
    if (!following.current || !scroller.current) return;
    if (reduced) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
      return;
    }
    if (scrollFrame.current) return;
    scrolling.current = true;
    let last = performance.now();
    const frame = (now: number) => {
      scrollFrame.current = 0;
      const el = scroller.current;
      if (!el || !following.current) {
        scrolling.current = false;
        return;
      }
      const end = el.scrollHeight - el.clientHeight,
        delta = end - el.scrollTop;
      if (Math.abs(delta) < 0.8) {
        el.scrollTop = end;
        scrolling.current = false;
        return;
      }
      el.scrollTop += delta * (1 - Math.exp(-Math.min(now - last, 40) / 65));
      last = now;
      scrollFrame.current = requestAnimationFrame(frame);
    };
    scrollFrame.current = requestAnimationFrame(frame);
  }, [reduced]);
  useLayoutEffect(() => {
    following.current = true;
    setShowLatest(false);
    followBottom();
  }, [state.activeProjectId, followBottom]);
  useLayoutEffect(() => {
    const area = composerArea.current;
    if (!area) return;
    const measure = () => setComposerWidth(area.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    measure();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = textarea.current;
    if (el) {
      el.style.height = "0px";
      const height = Math.min(104, Math.max(24, el.scrollHeight));
      el.style.height = `${height}px`;
      setComposerHeight(Math.max(42, height + 18));
    }
  }, [text, panel, composerWidth]);
  useLayoutEffect(() => {
    if (!scroller.current || !stack.current) return;
    const controller = createChatReflow(
      scroller.current,
      stack.current,
      () => reducedRef.current,
      () => following.current,
    );
    reflow.current = controller;
    return () => {
      controller.dispose();
      reflow.current = null;
    };
  }, [panel]);
  useLayoutEffect(() => {
    if (state.chatOpen && !wasOpen.current) {
      openingCount.current = state.messages.length;
      following.current = true;
    }
    wasOpen.current = state.chatOpen;
  }, [state.chatOpen, state.messages.length]);
  useLayoutEffect(() => {
    if (!greetingHandoff || !contentVisible) return;
    // Several notices may be queued below the one that was clicked. Keep that
    // bubble in view throughout panel growth and the existing morph handoff.
    following.current = false;
    scrolling.current = true;
    cancelAnimationFrame(scrollFrame.current);
    const focusNotice = () => {
      const el = scroller.current;
      const message = root.current?.querySelector<HTMLElement>(
        "[data-welcome-message]",
      );
      const bubble = message?.querySelector<HTMLElement>(".bubble-shell");
      if (el && bubble) {
        el.scrollTop +=
          bubble.getBoundingClientRect().top -
          el.getBoundingClientRect().top -
          20;
      }
      scrollFrame.current = requestAnimationFrame(focusNotice);
    };
    scrollFrame.current = requestAnimationFrame(focusNotice);
    return () => {
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = 0;
      scrolling.current = false;
      const el = scroller.current;
      if (el)
        following.current =
          el.scrollHeight - el.clientHeight - el.scrollTop < 3;
      updateScrollFade();
    };
  }, [
    greetingHandoff,
    state.greeting?.messageId,
    contentVisible,
    updateScrollFade,
  ]);
  useLayoutEffect(() => {
    const measure = () => {
      const available = Math.max(
        0,
        (root.current?.clientHeight || innerHeight) -
          48 -
          composerHeight -
          contextSpace -
          8,
      );
      const content =
        Math.ceil(stack.current?.getBoundingClientRect().height || 0) + 5;
      const rows = Array.from(stack.current?.children || []).map(
        (el) => (el as HTMLElement).offsetHeight,
      );
      const height = measureTranscript(
        rows,
        available,
        openingCount.current,
        !!latestState.current.chatSize,
      );
      setTranscriptHeight(height);
      setHasOverflow(content > height + 1);
      reflow.current?.reflow();
      followBottom();
      updateScrollFade();
      reportRegions();
    };
    const observer = new ResizeObserver(measure);
    for (const el of [
      root.current,
      stack.current,
      scroller.current,
      composer.current,
    ])
      if (el) observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [
    panel,
    composerHeight,
    contextSpace,
    !!state.chatSize,
    state.chatOpen,
    reportRegions,
    followBottom,
    updateScrollFade,
  ]);
  useLayoutEffect(() => {
    followBottom();
    reportRegions();
  }, [
    state.messages,
    panel,
    menu,
    messageMenu,
    composerHeight,
    contextSpace,
    state.chatOpen,
    followBottom,
    reportRegions,
  ]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      // Own the entire conversation rectangle, including gaps and scroll edges.
      event.stopPropagation();
      following.current = false;
      scrolling.current = false;
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = 0;
      const bottom = el.scrollHeight - el.clientHeight;
      if (
        (event.deltaY < 0 && el.scrollTop <= 0) ||
        (event.deltaY > 0 && el.scrollTop >= bottom - 1)
      ) {
        event.preventDefault();
        if (event.deltaY > 0) following.current = true;
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [panel]);
  useEffect(() => {
    state.messages.forEach((m) => {
      seen.current.add(m.id);
      messageBubbleTexts(m).forEach((_, i) =>
        seenBubbles.current.add(`${m.id}:${i}`),
      );
      m.cards?.forEach((card) => seenCards.current.add(card.id));
    });
  }, [state.messages]);
  useEffect(() => {
    if (state.chatOpen && panelReady && panel === "chat")
      textarea.current?.focus({ preventScroll: true });
  }, [state.chatOpen, panel, panelReady]);
  useEffect(() => {
    if (!state.chatOpen) {
      setMenu(false);
      setMessageMenu(null);
    }
  }, [state.chatOpen]);
  useEffect(() => {
    const move = (event: MouseEvent) => {
      const hit =
        event.target instanceof Element &&
        !!event.target.closest("[data-chat-hit]");
      api.setHit(hit);
    };
    const dismiss = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-chat-menu]")
      ) {
        setMenu(false);
        setMessageMenu(null);
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("pointerdown", dismiss);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("pointerdown", dismiss);
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = 0;
      cancelAnimationFrame(geometryFrame.current);
      api.setChatRegions([]);
    };
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (state.chatResizing) {
        resizingPointer.current = null;
        void act("chat-resize-end", true);
        return;
      }
      if (menu || messageMenu) {
        setMenu(false);
        setMessageMenu(null);
        dots.current?.focus();
      } else if (panel !== "chat") setPanel("chat");
      else void act("close-chat");
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [menu, messageMenu, panel, act, state.chatResizing]);
  useEffect(() => {
    if (!state.selectedArea || !state.chatOpen) return;
    const frame = requestAnimationFrame(() => textarea.current?.focus({preventScroll:true}));
    return () => cancelAnimationFrame(frame);
  }, [state.selectedArea?.id, state.chatOpen]);
  async function send(value = text, retry = false) {
    if (
      sending.current ||
      readingFiles.current ||
      state.busy ||
      fileBusy ||
      (!value.trim() && !files.length && !state.selectedArea)
    )
      return;
    sending.current = true;
    try {
      const result = await act("send", {
        text: value || (state.selectedArea ? "Jelaskan area ini." : ""),
        attachmentIds: retry ? undefined : files.map((f) => f.id),
      });
      if (result.ok) {
        following.current = true;
        if (!retry) {
          setText("");
          setFiles([]);
          setFileError("");
        }
        followBottom();
      } else setFileError(result.error || "Pesan belum terkirim. Coba lagi.");
    } catch (error) {
      setFileError(
        error instanceof Error ? error.message : "Pesan belum terkirim.",
      );
    } finally {
      sending.current = false;
    }
  }
  async function retryReply(message: Message) {
    if (state.busy || sending.current || readingFiles.current) return;
    sending.current = true;
    try {
      const result = await act("send", {
        text: "",
        retryMessageId: message.id,
      });
      if (!result.ok)
        setFileError(result.error || "Pesan belum bisa dicoba ulang.");
      else {
        following.current = true;
        followBottom();
      }
    } catch (error) {
      setFileError(
        error instanceof Error
          ? error.message
          : "Pesan belum bisa dicoba ulang.",
      );
    } finally {
      sending.current = false;
    }
  }

  const action = (callback: () => void) => {
    setMenu(false);
    setMessageMenu(null);
    callback();
  };
  const menuKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[role=menuitem]:not(:disabled)",
      ),
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) %
            items.length;
    items[next]?.focus();
  };
  const popoverMotion = {
    initial: { opacity: 0, y: reduced ? 0 : 6, scale: reduced ? 1 : 0.96 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: reduced ? 0 : 4, scale: reduced ? 1 : 0.98 },
    transition: { duration: reduced ? 0 : 0.16 },
  };
  const panelHeight =
    state.chatSize || panel !== "chat"
      ? innerHeight - 24
      : transcriptHeight + composerHeight + contextSpace + 8 + 24;
  if (state.chatOpen || !lastPanelHeight.current)
    lastPanelHeight.current = panelHeight;
  const frameHeight = lastPanelHeight.current;
  const reveal = chatPanelReveal(
    state.chatOpen,
    state.chatSide || "right",
    composerWidth + 24,
    frameHeight,
  );
  if (!panelMask.current)
    panelMask.current = chatPanelReveal(
      false,
      state.chatSide || "right",
      composerWidth + 24,
      frameHeight,
    ).clipPath;
  const visibleMessages = state.messages.filter(
    (m) => state.chatOpen || m.id !== state.greeting?.messageId,
  );
  return (
    <main
      ref={root}
      className="desktop-chat"
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dropDepth.current++;
        setDropActive(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = state.busy ? "none" : "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (--dropDepth.current <= 0) {
          dropDepth.current = 0;
          setDropActive(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dropDepth.current = 0;
        setDropActive(false);
        const dropped = Array.from(event.dataTransfer.files);
        if (!dropped.length) return;
        if (!api.prepareDroppedFiles) {
          setFileError("Pakai menu Lampirkan dokumen untuk menambahkan file.");
          return;
        }
        void prepareFiles(dropped);
      }}
      data-dock={state.chatSide || "right"}
      data-resizing={!!state.chatResizing}
      data-manual={!!state.chatSize}
      data-greeting-handoff={greetingHandoff}
      data-handoff-ready={panelReady && greetingHandoff}
      style={{ pointerEvents: state.chatOpen ? "auto" : "none" }}
      inert={!state.chatOpen}
    >
      <motion.div
        ref={panelFrame}
        className="desktop-chat-panel"
        data-chat-hit
        initial={{
          ...chatPanelReveal(
            false,
            state.chatSide || "right",
            composerWidth + 24,
            frameHeight,
          ),
          height: frameHeight,
        }}
        animate={{ ...reveal, height: frameHeight }}
        transition={{
          clipPath: {
            duration: reduced ? 0 : state.chatOpen ? 0.32 : 0.28,
            ease: [0.22, 1, 0.36, 1],
          },
          opacity: { duration: reduced ? 0 : state.chatOpen ? 0.14 : 0.24 },
          height: {
            duration: reduced || state.chatResizing ? 0 : 0.24,
            ease: [0.22, 1, 0.36, 1],
          },
        }}
        onUpdate={(latest) => {
          if (typeof latest.clipPath === "string")
            panelMask.current = latest.clipPath;
          reportRegions();
        }}
        onAnimationComplete={() => {
          if (latestState.current.chatOpen) setPanelReady(true);
          else void act("chat-hidden");
          reportRegions();
        }}
      >
        <div className="desktop-chat-surface" aria-hidden="true" />
        <AnimatePresence>
          {dropActive && (
            <motion.div
              className="desktop-file-drop"
              data-chat-hit
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.16 }}
            >
              <FileText size={28} />
              <strong>
                {state.busy ? "Tunggu proses selesai" : "Lepaskan file di sini"}
              </strong>
              <span>PDF, gambar, atau teks · maksimal 6 MB</span>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="desktop-chat-resize-bar">
          <MotionBitoButton
            ref={resizeGrip}
            type="button"
            className="desktop-chat-resize-grip"
            data-chat-hit
            aria-label="Ubah ukuran chat"
            initial={{ opacity: 0 }}
            animate={{
              opacity: gripHeld || gripHovered ? 1 : 0.24,
            }}
            whileFocus={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
            onPointerEnter={() => setGripHovered(true)}
            onPointerLeave={() => {
              setGripHovered(false);
              if (resizingPointer.current === null) {
                gripX.set(0);
                gripY.set(0);
              }
            }}
            onPointerMove={(event) => {
              if (reduced) return;
              const mirror = state.chatSide === "left" ? -1 : 1;
              if (resizingPointer.current !== null) {
                gripX.set(
                  Math.max(
                    -4,
                    Math.min(4, (event.screenX - gripOrigin.current.x) * 0.035),
                  ) * mirror,
                );
                gripY.set(
                  Math.max(
                    -4,
                    Math.min(4, (event.screenY - gripOrigin.current.y) * 0.035),
                  ),
                );
              } else {
                const rect = event.currentTarget.getBoundingClientRect();
                gripX.set(
                  (event.clientX - rect.x - rect.width / 2) * 0.1 * mirror,
                );
                gripY.set((event.clientY - rect.y - rect.height / 2) * 0.1);
              }
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              resizingPointer.current = event.pointerId;
              gripOrigin.current = { x: event.screenX, y: event.screenY };
              setGripHeld(true);
              const surface = root.current?.querySelector<HTMLElement>(
                ".desktop-chat-surface",
              );
              const height = Math.ceil(
                surface
                  ? surface.getBoundingClientRect().height + 24
                  : innerHeight,
              );
              void act("chat-resize-start", { height });
            }}
            onPointerUp={(event) => {
              if (resizingPointer.current !== event.pointerId) return;
              resizingPointer.current = null;
              releaseGrip();
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
              void act("chat-resize-end");
            }}
            onLostPointerCapture={() => {
              if (resizingPointer.current === null) return;
              resizingPointer.current = null;
              releaseGrip();
              void act("chat-resize-end");
            }}
            onPointerCancel={() => {
              resizingPointer.current = null;
              releaseGrip();
              void act("chat-resize-end", true);
            }}
            onDoubleClick={() => void act("chat-size", null)}
            onKeyDown={(event) => {
              if (event.key === "Home") {
                event.preventDefault();
                void act("chat-size", null);
                return;
              }
              if (
                !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                  event.key,
                )
              )
                return;
              event.preventDefault();
              const step = event.shiftKey ? 24 : 10;
              const size = state.chatSize || {
                width: innerWidth,
                height: innerHeight,
              };
              const direction = state.chatSide === "left" ? -1 : 1;
              void act("chat-size", {
                width: Math.max(
                  320,
                  Math.min(
                    1000,
                    size.width +
                      (event.key === "ArrowRight"
                        ? step * direction
                        : event.key === "ArrowLeft"
                          ? -step * direction
                          : 0),
                  ),
                ),
                height: Math.max(
                  220,
                  Math.min(
                    2000,
                    size.height +
                      (event.key === "ArrowUp"
                        ? step
                        : event.key === "ArrowDown"
                          ? -step
                          : 0),
                  ),
                ),
              });
            }}
          >
            <motion.svg
              width="25"
              height="25"
              viewBox="0 0 28 28"
              aria-hidden="true"
              style={{
                x: reduced ? 0 : gripSpringX,
                y: reduced ? 0 : gripSpringY,
                overflow: "visible",
              }}
              animate={{
                scale: reduced ? 1 : gripHeld ? 1.12 : gripHovered ? 1.06 : 1,
              }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 520, damping: 28, mass: 0.55 }
              }
            >
              <motion.path
                initial={false}
                animate={{
                  d:
                    reduced || !gripHeld
                      ? "M6 6C17 6 22 11 22 22"
                      : "M4.5 6C18 3.5 24.5 10 22 23.5",
                  strokeWidth: gripHeld ? 5 : gripHovered ? 4.8 : 4.5,
                  stroke: gripHeld
                    ? "var(--bito-ink)"
                    : gripHovered
                      ? "var(--bito-secondary)"
                      : "var(--bito-muted)",
                }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : {
                        type: "spring",
                        stiffness: 430,
                        damping: 29,
                        mass: 0.65,
                      }
                }
                fill="none"
                strokeLinecap="round"
              />
            </motion.svg>
          </MotionBitoButton>
        </div>
        {panel === "chat" ? (
          <motion.div
            className="desktop-chat-messages"
            ref={scroller}
            role="log"
            aria-label="Percakapan dengan Bito"
            data-chat-hit
            data-overflow={hasOverflow}
            inert={!contentVisible && !greetingHandoff}
            initial={false}
            animate={{ height: transcriptHeight }}
            transition={{
              height: {
                duration:
                  reduced || greetingHandoff || state.chatResizing ? 0 : 0.24,
                ease: [0.22, 1, 0.36, 1],
              },
            }}
            onUpdate={() => {
              followBottom();
              updateScrollFade();
              reportRegions();
            }}
            onAnimationComplete={() => {
              followBottom();
              updateScrollFade();
              reportRegions();
            }}
            onScroll={() => {
              const el = scroller.current!;
              if (!scrolling.current)
                following.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 3;
              updateScrollFade();
              reflow.current?.capture();
              reportRegions();
            }}
            onPointerDownCapture={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (event.clientX >= rect.right - 14) {
                following.current = false;
                scrolling.current = false;
                cancelAnimationFrame(scrollFrame.current);
                scrollFrame.current = 0;
              }
            }}
          >
            <div className="desktop-chat-stack" ref={stack}>
              {visibleMessages.length === 0 && !state.busy && <section className="desktop-chat-welcome" data-chat-hit aria-label="Mulai percakapan">
                <div className="desktop-welcome-heading"><BitoMascot /><div><h2>Aku di sini.</h2><p>Mau mulai dari mana?</p></div></div>
                <div className="desktop-starters">{["Bantu aku mulai", "Aku mau cerita"].map(prompt => <BitoButton key={prompt} type="button" disabled={!!text.trim()} onClick={() => { setText(prompt); textarea.current?.focus(); }}>{prompt}</BitoButton>)}</div>
              </section>}
              <AnimatePresence initial={false}>
                {visibleMessages.map((m, index) => {
                  const bubbles = messageBubbleTexts(m);
                  const betweenBubbles =
                    state.busy &&
                    state.replyActivity?.messageId === m.id &&
                    state.replyActivity.phase !== "talking" &&
                    !!(m.text || m.cards?.length);
                  const displayedBubbles = betweenBubbles
                    ? [...bubbles, ""]
                    : bubbles;
                  return (
                    <motion.article
                      key={m.id}
                      className={`desktop-message ${m.role} ${m.status === "error" ? "failed" : ""}`}
                      initial={seen.current.has(m.id) ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        opacity: { duration: reduced ? 0 : 0.14 },
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setMenu(false);
                        setCopied(false);
                        const frame =
                          panelFrame.current?.getBoundingClientRect();
                        setMessageMenu({
                          message: m,
                          x: Math.max(
                            12,
                            Math.min(
                              event.clientX - (frame?.x || 0),
                              (frame?.width || innerWidth) - 216,
                            ),
                          ),
                          y: Math.max(
                            12,
                            Math.min(
                              event.clientY - (frame?.y || 0),
                              (frame?.height || innerHeight) - 187,
                            ),
                          ),
                        });
                      }}
                    >
                      {(index === 0 ||
                        messageDay(visibleMessages[index - 1].createdAt) !==
                          messageDay(m.createdAt)) && (
                        <div
                          className="desktop-day-separator"
                          role="separator"
                          aria-label={messageDayLabel(m.createdAt, today)}
                        >
                          <span>{messageDayLabel(m.createdAt, today)}</span>
                        </div>
                      )}
                      <div className="desktop-message-content">
                        {m.role === "user" && (m.attachments?.length || m.selectedArea) ? (
                          <div className="desktop-history-files">
                            {(state.messagePreviews?.[m.id] || m.attachments || [{name:"Area pilihan",kind:"area" as const}]).map((file,i) => <AttachmentCard key={i} file={file} />)}
                          </div>
                        ) : null}
                        <div
                          className={`desktop-message-hit ${m.cards?.length ? "has-cards" : ""}`}
                          data-chat-hit
                          data-welcome-message={
                            m.id === state.greeting?.messageId
                              ? m.id
                              : undefined
                          }
                          style={
                            greetingHandoff &&
                            m.id === state.greeting?.messageId
                              ? { visibility: "hidden" }
                              : undefined
                          }
                          inert={
                            greetingHandoff &&
                            m.id === state.greeting?.messageId
                          }
                        >
                          <div className="desktop-reply-bubbles">
                            <AnimatePresence initial={false}>
                              {displayedBubbles.map((body, bubbleIndex) => (
                                <Bubble
                                  key={`${m.id}:${bubbleIndex}`}
                                  className={`bubble desktop-bubble ${m.kind === "welcome" || m.kind === "notification" ? "desktop-welcome-bubble" : ""}`}
                                  side={m.role === "user" ? "user" : "bito"}
                                  appear={
                                    !seenBubbles.current.has(
                                      `${m.id}:${bubbleIndex}`,
                                    )
                                  }
                                  reduced={reduced}
                                  liquid
                                >
                                  {body ? (
                                    <MessageText
                                      text={withWebCitations(body, m.webSearch)}
                                      openLink={openLink}
                                    />
                                  ) : (
                                    <span
                                      className="typing"
                                      aria-label={
                                        state.replyActivity?.phase ===
                                        "searching"
                                          ? "Bito sedang mencari di internet"
                                          : "Bito sedang mengetik"
                                      }
                                    >
                                      <i />
                                      <i />
                                      <i />
                                      {state.replyActivity?.phase ===
                                        "searching" && (
                                        <span className="desktop-search-label">
                                          Lagi cari…
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </Bubble>
                              ))}
                            </AnimatePresence>
                          </div>
                          {m.webSearch && (
                            <SearchSources
                              search={m.webSearch}
                              openLink={openLink}
                            />
                          )}
                          {!!m.cards?.length && (
                            <ResponseCards
                              message={m}
                              state={state}
                              act={act}
                              reduced={reduced}
                              seen={seenCards.current}
                            />
                          )}
                          {m.role === "assistant" &&
                            (m.status === "interrupted" ||
                              m.status === "error") && (
                              <div
                                className={`desktop-message-status ${m.status}`}
                              >
                                <span role="status">
                                  {m.status === "interrupted" ? (
                                    <Pause size={11} />
                                  ) : (
                                    <AlertCircle size={12} />
                                  )}
                                  {m.status === "interrupted"
                                    ? "Dihentikan"
                                    : m.cards?.length
                                      ? "Tindakan tersimpan; balasan terhenti"
                                      : "Jawaban gagal"}
                                </span>
                                {!m.cards?.length && (
                                  <BitoButton
                                    type="button"
                                    disabled={
                                      state.busy ||
                                      !retryText(state.messages, m.id)
                                    }
                                    onClick={() => retryReply(m)}
                                  >
                                    <RefreshCw size={11} />
                                    Coba lagi
                                  </BitoButton>
                                )}
                              </div>
                            )}
                          <time
                            className="desktop-message-time"
                            dateTime={new Date(m.createdAt).toISOString()}
                            aria-label={messageFullTime(m.createdAt)}
                          >
                            {messageTime(m.createdAt)}
                          </time>
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.section
            key={panel}
            className="desktop-tool-panel"
            data-chat-hit
            initial={false}
          >
            <BitoButton
              className="desktop-tool-back"
              aria-label="Kembali ke percakapan"
              onClick={() => setPanel("chat")}
            >
              <ArrowLeft size={19} />
            </BitoButton>
            {panels[panel]}
          </motion.section>
        )}
        <motion.div
          className="desktop-composer-area"
          ref={composerArea}
          inert={!contentVisible}
          initial={false}
          style={{ paddingTop: contextSpace }}
        >
          <AnimatePresence>
            {showLatest &&
              panel === "chat" &&
              state.chatOpen &&
              contentVisible && (
                <MotionBitoButton
                  type="button"
                  className="desktop-jump-latest"
                  data-chat-hit
                  aria-label="Ke pesan terbaru"
                  initial={{
                    opacity: 0,
                    y: reduced ? 0 : 5,
                    scale: reduced ? 1 : 0.94,
                  }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    y: reduced ? 0 : 3,
                    scale: reduced ? 1 : 0.96,
                  }}
                  transition={{ duration: reduced ? 0 : 0.16 }}
                  onClick={() => {
                    following.current = true;
                    setShowLatest(false);
                    followBottom();
                  }}
                >
                  <ArrowDown size={18} />
                </MotionBitoButton>
              )}
          </AnimatePresence>
          <ChatProjectSelector
            state={state}
            act={act}
            top={attachmentHeight}
            reduced={!!reduced}
            disabled={
              state.busy ||
              fileBusy ||
              !!files.length ||
              !!state.selectedArea
            }
            onGeometry={reportRegions}
          />
          <AnimatePresence>
            {filesVisible && (
              <motion.div
                ref={fileRail}
                key="files"
                layout
                className="desktop-files"
                data-chat-hit
                {...popoverMotion}
              >
                {state.selectedArea && <motion.div key="area" className="desktop-file-chip" layout>
                  <AttachmentCard file={{name:"Area pilihan",kind:"area",thumbnail:state.selectedArea.thumbnail}} />
                  <BitoButton type="button" aria-label="Lepas area pilihan" disabled={state.busy} onClick={()=>void act("clear-selected-area")}><X size={13}/></BitoButton>
                </motion.div>}
                {fileBusy ? (
                  <span role="status" className="desktop-file-status">
                    Menambahkan lampiran…
                  </span>
                ) : null}
                {files.map((file) => (
                  <motion.div
                    layout
                    key={file.id}
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    className="desktop-file-chip"
                    title={file.warnings?.join(" ")}
                  >
                    <AttachmentCard file={file.preview || {name:file.name,kind:file.kind}} />
                    <BitoButton
                      type="button"
                      disabled={state.busy}
                      aria-label={`Lepas ${file.name}`}
                      onClick={() => {
                        setFiles((prev) =>
                          prev.filter((item) => item.id !== file.id),
                        );
                        void act("chat-release-files", { ids: [file.id] });
                      }}
                    >
                      <X size={13} />
                    </BitoButton>
                  </motion.div>
                ))}
                {state.busy && files.length > 0 && <span className="desktop-file-status" role="status">Membaca lampiran…</span>}
                {fileError && (
                  <span className="desktop-file-error" role="alert">
                    {fileError}
                    <BitoButton
                      type="button"
                      aria-label="Tutup pesan"
                      onClick={() => setFileError("")}
                    >
                      <X size={12} />
                    </BitoButton>
                  </span>
                )}
                {files
                  .flatMap((file) => file.warnings || [])
                  .map((warning, index) => (
                    <small key={index} className="desktop-file-warning">
                      {warning}
                    </small>
                  ))}
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div
            className="desktop-composer-reveal"
            data-chat-hit
            initial={false}
            animate={{ height: composerHeight }}
            transition={{
              height: {
                duration: reduced || state.chatResizing ? 0 : 0.24,
                ease: [0.22, 1, 0.36, 1],
              },
            }}
            onUpdate={reportRegions}
          >
            <motion.form
              ref={composer}
              className="desktop-composer"
              style={{ width: composerWidth, height: composerHeight }}
              initial={false}
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <ChatComposer
                className="bito-chat-composer"
                density="compact"
                elevation="none"
                value={text}
                onChange={setText}
                onSubmit={() => void send()}
                input={
                  <textarea
                    ref={textarea}
                    aria-label="Pesan untuk Bito"
                    placeholder="Tulis pesan…"
                    rows={1}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                }
                footerActions={
                  <MotionBitoButton
                    ref={dots}
                    type="button"
                    className="desktop-more"
                    data-chat-menu
                    aria-label="Pilihan percakapan"
                    aria-haspopup="menu"
                    aria-expanded={menu}
                    whileTap={reduced ? undefined : { scale: 0.88 }}
                    onClick={() => {
                      setMessageMenu(null);
                      setMenu((value) => !value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setMenu(true);
                        requestAnimationFrame(() =>
                          root.current
                            ?.querySelector<HTMLButtonElement>(
                              ".desktop-options [role=menuitem]",
                            )
                            ?.focus(),
                        );
                      }
                    }}
                  >
                    <MoreVertical size={23} strokeWidth={3} />
                  </MotionBitoButton>
                }
                sendButton={
                  <MotionBitoButton
                    type={state.busy ? "button" : "submit"}
                    className="desktop-send"
                    aria-label={state.busy ? "Hentikan jawaban" : "Kirim pesan"}
                    disabled={
                      !state.busy &&
                      ((!text.trim() && !files.length && !state.selectedArea) ||
                        fileBusy ||
                        (!state.hasKey && !state.demoMode))
                    }
                    whileTap={reduced ? undefined : { scale: 0.88 }}
                    onClick={state.busy ? () => void act("stop") : undefined}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={state.busy ? "stop" : "send"}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={{ duration: reduced ? 0 : 0.1 }}
                      >
                        {state.busy ? (
                          <Square size={15} fill="currentColor" />
                        ) : (
                          <ArrowUp size={25} strokeWidth={2.6} />
                        )}
                      </motion.span>
                    </AnimatePresence>
                  </MotionBitoButton>
                }
              />
            </motion.form>
          </motion.div>
          <AnimatePresence>
            {menu && (
              <ChatPopover anchor={dots} onGeometry={reportRegions}><motion.div
                className="desktop-options desktop-popover"
                role="menu"
                aria-label="Pilihan percakapan"
                data-chat-hit
                data-chat-menu
                {...popoverMotion}
                onKeyDown={menuKeys}
              >
                <BitoButton
                  role="menuitem"
                  disabled={state.busy}
                  onClick={() =>
                    action(() => {
                      void prepareFiles();
                    })
                  }
                >
                  <Paperclip size={15} />
                  Lampirkan dokumen
                </BitoButton>
                <BitoButton
                  role="menuitem"
                  disabled={state.busy}
                  onClick={() =>
                    action(() => {
                      void act("select-area");
                    })
                  }
                >
                  <ScanLine size={15} />
                  Tanya area layar
                </BitoButton>
                <BitoButton
                  role="menuitem"
                  disabled={state.busy}
                  onClick={() =>
                    action(() => {
                      void act("project-open");
                    })
                  }
                >
                  <FolderOpen size={15} />
                  {state.activeProjectId ? "Buka proyek" : "Semua proyek"}
                </BitoButton>
                <BitoButton
                  role="menuitem"
                  onClick={() =>
                    action(() => {
                      void act("show-settings", "settings");
                    })
                  }
                >
                  <Settings size={15} />
                  Pengaturan
                </BitoButton>
              </motion.div></ChatPopover>
            )}
          </AnimatePresence>
        </motion.div>
        <AnimatePresence>
          {messageMenu && (
            <motion.div
              className="desktop-message-menu desktop-popover"
              role="menu"
              aria-label="Pilihan pesan"
              data-chat-hit
              data-chat-menu
              style={{ left: messageMenu.x, top: messageMenu.y }}
              {...popoverMotion}
              onKeyDown={menuKeys}
            >
              <time
                className="desktop-message-menu-time"
                dateTime={new Date(messageMenu.message.createdAt).toISOString()}
              >
                {messageDayLabel(messageMenu.message.createdAt, today)} ·{" "}
                {messageTime(messageMenu.message.createdAt)}
              </time>
              <BitoButton
                role="menuitem"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(messageMenu.message.text)
                    .then(() => setCopied(true));
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}Salin
              </BitoButton>
              {messageMenu.message.role === "assistant" && (
                <BitoButton
                  role="menuitem"
                  onClick={() =>
                    action(() => {
                      void act("save-note", messageMenu.message.text);
                    })
                  }
                >
                  <Bookmark size={15} />
                  Simpan catatan
                </BitoButton>
              )}
              {(messageMenu.message.status === "error" ||
                messageMenu.message.status === "interrupted") && (
                <BitoButton
                  role="menuitem"
                  disabled={
                    state.busy ||
                    !retryText(state.messages, messageMenu.message.id)
                  }
                  onClick={() =>
                    action(() => {
                      retryReply(messageMenu.message);
                    })
                  }
                >
                  <RefreshCw size={15} />
                  Coba lagi
                </BitoButton>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  );
}
