import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { ChatMarkdown } from "./ChatMarkdown";
import { ChatCopyButton } from "./ChatCopyButton";
import { ChatIcon } from "./ChatIcon";
import { ChatModelPicker } from "./ChatModelPicker";
import { ChatImage } from "./ChatImage";
import { ChatFiles } from "./ChatFiles";
import { ChatDiff } from "./ChatDiff";
import { chatFilesForTurn, mergeChatFiles, sameChatFiles } from "../lib/chatFiles";
import { splitChatImagePaths } from "../lib/chatPaths";
import { isChatWorking } from "../lib/chatWorkState";
import { isChatSessionModelChanging, useChatSessionModelChanging } from "../lib/chatSessionModel";
import { openDialog } from "../platform/plugins";
import "./ChatView.css";
import { invoke, listen } from "../platform/runtime";
import { electronBridge } from "../platform/electronBridge";
import { extractDroppedFilePaths, formatDroppedPathForTerminal, hasExternalFiles } from "../lib/fileDrop";
import { parseChatPrompt, promptSignature, type ChatPromptOption } from "../lib/chatPrompt";
import { answerTerminalStartupPrompt, parseTerminalStartupPrompt, type TerminalStartupPrompt } from "../lib/terminalStartupPrompt";
import {
  applyAutocomplete,
  detectAutocomplete,
  filterSlashCommands,
  slashCommandsForTool,
  type AutocompleteTrigger,
} from "../lib/composerAutocomplete";
import type { AppThemeId } from "../lib/appTheme";
import { mergeChatHistory } from "../lib/chatHistory";
import type { ChatBlock, ChatBlocksResult, ChatDiffLine, ConversationArtifact, ChatImageSource } from "../platform/ipcContract";
import type { AgentStatus } from "../types";
import { useAppLanguage } from "../lib/appLanguage";
import { QuestionForm } from './QuestionForm';
import type { ChatAnswer } from '../../electron/shared/chat-prompt.mjs';
import { questionDetails } from '../../electron/shared/chat-prompt.mjs';

// While the agent is working, composer sends are queued and drained one at a
// time once it's ready for input (with a short cooldown so a message doesn't
// fire during the brief lag before "working" registers).
const DEAD_STATUSES: AgentStatus[] = ["exited", "unreachable"];
const QUEUE_COOLDOWN_MS = 1200;

// Reserved (queued) messages, kept per session outside the component so they
// survive the ChatView unmount/remount when toggling terminal ↔ chat.
const queueStore = new Map<string, string[]>();
// The in-progress composer draft + image attachments, likewise kept per session
// so switching to the terminal and back doesn't lose them.
const draftStore = new Map<string, string>();
// Composer attachments: a pasted/dropped image (path + preview), or a large
// pasted text block collapsed to a chip (like a terminal's pasted-text token).
type Attachment =
  | { kind: "image"; path: string; dataUrl: string }
  | { kind: "text"; text: string };
const attachStore = new Map<string, Attachment[]>();
type ComposerContext = { mode: "reuse" | "quote"; value: string };
type ComposerIntent = ComposerContext & { storageKey: string };
const composerContextStore = new Map<string, ComposerContext>();
const appliedComposerIntents = new WeakSet<ComposerIntent>();
const directBlockKeys = new WeakMap<ChatBlock, number>();
let nextDirectBlockKey = 0;
function blockRenderKey(block: ChatBlock) {
  if (block.sequence != null) return `sequence-${block.sequence}`;
  let key = directBlockKeys.get(block);
  if (key === undefined) { key = ++nextDirectBlockKey; directBlockKeys.set(block, key); }
  return `direct-${key}`;
}
// A text paste at/above this size collapses into a chip instead of filling the
// input inline.
const PASTE_COLLAPSE_CHARS = 300;
const PASTE_COLLAPSE_LINES = 5;

// Desktop conversation view: renders the session-specific conversation kept in
// MultiAgent's SQLite store. Provider JSONL is incrementally ingested by the
// Electron backend, so unmounting this renderer never loses or mixes history.

type Status = "loading" | "unsupported" | "empty" | "ready";

// Render only the most recent N turns so a long transcript paints fast;
// older turns are revealed on demand.
const CHAT_PAGE = 10;
const CHAT_DB_PAGE = 400;

const UserMessage = memo(function UserMessage({ text: message, agentId, sequence, folder, onOpenPath, onReuse, imageOnly = false }: {
  text: string; agentId?: string; sequence?: number; folder?: string; imageOnly?: boolean; onOpenPath?: (path: string) => void; onReuse?: (message: string) => void;
}) {
  const { text } = useAppLanguage();
  const { rest, images } = splitChatImagePaths(message);
  const [nativeImages, setNativeImages] = useState<ChatImageSource[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const hasPaths = images.length > 0;
  useEffect(() => {
    let cancelled = false;
    setNativeImages([]);
    setLoadingImages(false);
    if (hasPaths || !agentId || !sequence) return;
    setLoadingImages(true);
    void invoke<ChatImageSource[]>("read_chat_images", { id: agentId, sequence }).then(result => {
      if (!cancelled && Array.isArray(result)) setNativeImages(result);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoadingImages(false); });
    return () => { cancelled = true; };
  }, [agentId, sequence, hasPaths]);
  const visibleText = nativeImages.length ? rest.replace(/\[Image\s+#?\d+\]/gi, "").trim() : rest;
  return (
    <>
    <div className="chat-user">
      {visibleText && <div className="chat-user-text">{visibleText}</div>}
      <div className="chat-user-images">
      {images.map((p, i) => (
        <ChatImage key={`${p}-${i}`} path={p} folder={folder} onOpenPath={onOpenPath} />
      ))}
      {nativeImages.map((source, i) => <ChatImage key={`native-${i}`} {...source} alt={text(`첨부 이미지 ${i + 1}`, `Attached image ${i + 1}`)} folder={folder} onOpenPath={onOpenPath} />)}
      </div>
      {imageOnly && !nativeImages.length && <span className="chat-image-note">{loadingImages ? text("이미지 불러오는 중…", "Loading image…") : text("이미지 · 원본을 불러올 수 없습니다", "Image · original unavailable")}</span>}
    </div>
    <div className="chat-user-footer"><span>{text("나", "You")}</span>{message && <div className="chat-user-actions"><ChatCopyButton value={message} label={text("메시지 복사", "Copy message")} />{onReuse && <button type="button" className="chat-copy-button chat-user-reuse" onClick={() => onReuse(message)} title={text("수정해서 다시 요청", "Edit and send again")} aria-label={text("수정해서 다시 요청", "Edit and send again")}><ChatIcon name="edit" /></button>}</div>}</div>
    </>
  );
});

function toolLabel(block: { name?: string; summary?: string; input?: unknown }): string {
  // Prefer the server-computed summary; fall back to deriving from input.
  let arg = block.summary ?? "";
  if (!arg) {
    const input = block.input;
    if (typeof input === "string") arg = input;
    else if (input && typeof input === "object") {
      const o = input as Record<string, unknown>;
      arg = String(o.command ?? o.cmd ?? o.file_path ?? o.path ?? o.pattern ?? JSON.stringify(o));
    }
  }
  arg = arg.replace(/\s+/g, " ").slice(0, 120);
  return arg ? `${block.name ?? "tool"} · ${arg}` : block.name ?? "tool";
}

function workLabel(name: string, text: (ko: string, en: string) => string): string {
  const tool = name.split(/[.:/]/).pop() || name;
  if (/^(?:exec_command|run_command|bash|shell|local_shell_call|write_stdin)$/i.test(tool)) return text("명령 실행", "Running command");
  if (/^(?:web|browse|fetch)/i.test(tool)) return text("웹 확인", "Browsing");
  if (/^(?:read|view|open)/i.test(tool)) return text("파일 확인", "Reading files");
  if (/^(?:apply_patch|write|edit)/i.test(tool)) return text("파일 수정", "Editing files");
  if (/^(?:search|find|grep|glob)/i.test(tool)) return text("검색", "Searching");
  return text("도구 실행", "Using tools");
}

function ToolDetails({ tool }: { tool: ToolPair }) {
  const { text } = useAppLanguage();
  const [open, setOpen] = useState(false);
  const state = tool.isError ? "error" : tool.completed ? "done" : "pending";
  return <details className="chat-tool" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
    <summary><span className={`chat-tool-state ${state}`} aria-label={state} /><span className="chat-tool-label"><span className="chat-tool-k">$</span> {toolLabel(tool)}</span></summary>
    {open && <>{tool.diff && <ChatDiff diff={tool.diff} />}{(tool.output !== undefined || !tool.diff) && <pre className={tool.isError ? "err" : ""}>{tool.output ?? text("(출력 없음)", "(no output)")}</pre>}</>}
  </details>;
}

type ToolPair = {
  name?: string;
  input?: unknown;
  summary?: string;
  diff?: ChatDiffLine[];
  output?: string;
  isError?: boolean;
  completed?: boolean;
};

type AssistantSegment =
  | { kind: "block"; block: ChatBlock; sourceIndex: number }
  | { kind: "tools"; tools: ToolPair[] };

export function groupAssistantBlocks(run: ChatBlock[]): AssistantSegment[] {
  const segments: AssistantSegment[] = [];
  let currentTools: ToolPair[] | null = null;
  let awaitingResults: ToolPair[] = [];

  const toolsForCurrentPosition = () => {
    if (currentTools) return currentTools;
    currentTools = [];
    segments.push({ kind: "tools", tools: currentTools });
    return currentTools;
  };

  run.forEach((block, index) => {
    if (block.kind === "tool-call") {
      const tool = { name: block.name, input: block.input, summary: block.summary, diff: block.diff };
      toolsForCurrentPosition().push(tool);
      awaitingResults.push(tool);
    } else if (block.kind === "tool-result") {
      const pending = awaitingResults.shift();
      if (pending) {
        pending.output = block.output;
        pending.completed = true;
        pending.isError = block.isError;
        if (!pending.diff && block.diff) pending.diff = block.diff;
      } else {
        toolsForCurrentPosition().push({
          name: "result",
          completed: true,
          output: block.output,
          isError: block.isError,
          diff: block.diff,
        });
      }
    } else {
      currentTools = null;
      awaitingResults = [];
      segments.push({ kind: "block", block, sourceIndex: index });
    }
  });

  return segments.filter((segment) => segment.kind !== "tools" || segment.tools.length > 0);
}

function ToolGroup({ tools }: { tools: ToolPair[] }) {
  const { text } = useAppLanguage();
  const [open, setOpen] = useState(false);
  const failed = tools.filter((tool) => tool.isError).length;
  const finished = tools.filter((tool) => tool.completed).length;
  return (
    <details className="chat-work chat-work-tools" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
      <summary>
        <span>{text(`작업 ${tools.length}개`, `Tasks ${tools.length}`)}</span>
        <span className={`chat-work-meta ${failed ? "err" : ""}`}>
          {failed
            ? text(`오류 ${failed}`, `Errors ${failed}`)
            : finished === tools.length
              ? text("완료", "Complete")
              : text("진행 중", "In progress")}
        </span>
      </summary>
      {open && <div className="chat-tools">{tools.map((tool, index) => <ToolDetails key={index} tool={tool} />)}</div>}
    </details>
  );
}

function assistantLabel(tool?: string) {
  const normalized = tool?.toLowerCase() ?? "";
  if (normalized.includes("codex")) return "Codex";
  if (normalized.includes("claude")) return "Claude";
  if (normalized.includes("qwen")) return "Qwen";
  return "Assistant";
}

const AssistantTurn = memo(function AssistantTurn({ run, files, tool, onOpenPath, onQuote, folder }: { run: ChatBlock[]; files: ConversationArtifact[]; tool?: string; folder?: string; onOpenPath?: (path: string) => void; onQuote?: (message: string) => void }) {
  const { text } = useAppLanguage();
  const segments = groupAssistantBlocks(run);
  const answer = run.filter(block => block.kind === "text").map(block => block.text || "").filter(Boolean).join("\n\n");
  const root = useRef<HTMLDivElement>(null);
  return (
    <div className="chat-turn assistant" ref={root}>
      <div className="chat-role">
        <span className="chat-av" aria-hidden="true"><img src="app-icon.png" alt="" /></span> {assistantLabel(tool)}<span className="chat-role-meta">· Acedia</span>
      </div>
      {segments.map((segment, index) => {
        if (segment.kind === "tools") {
          return <ToolGroup key={`tools-${index}`} tools={segment.tools} />;
        }
        const { block, sourceIndex } = segment;
        if (block.kind === "reasoning") {
          return (
            <details key={`r${sourceIndex}`} className="chat-work">
              <summary>{text("추론", "Reasoning")}</summary>
              <pre className="chat-reason">{block.text}</pre>
            </details>
          );
        }
        if (block.kind === "text") {
          return (
            <div key={`t${sourceIndex}`} className="chat-md">
              <ChatMarkdown onOpenPath={onOpenPath} folder={folder}>
                {block.text ?? ""}
              </ChatMarkdown>
            </div>
          );
        }
        if (block.kind === "image") {
          return <div key={`i${sourceIndex}`} className="chat-md chat-image-note">🖼 {text("이미지", "Image")}</div>;
        }
        return null;
      })}
      <ChatFiles files={files} folder={folder} onOpenPath={onOpenPath} />
      {answer && <div className="chat-message-actions"><ChatCopyButton value={answer} label={text("답변 복사", "Copy response")} />{onQuote && <button type="button" className="chat-copy-button chat-quote-button" title={text("답변 인용", "Quote response")} aria-label={text("답변 인용", "Quote response")} onClick={() => { const selection = window.getSelection(); onQuote(selection?.toString().trim() && root.current?.contains(selection.anchorNode) && root.current?.contains(selection.focusNode) ? selection.toString().trim() : answer); }}><ChatIcon name="quote" /></button>}</div>}
    </div>
  );
}, (previous, next) => previous.tool === next.tool && previous.folder === next.folder && previous.onOpenPath === next.onOpenPath && previous.onQuote === next.onQuote && sameChatFiles(previous.files, next.files) && previous.run.length === next.run.length && previous.run.every((block, index) => block === next.run[index]));

export function ChatView({
  agentId,
  active,
  agentStatus,
  sessionId,
  question,
  assistantMessage,
  folder,
  projectName,
  connectionLabel,
  provider,
  modelEditingSupported = true,
  modelSettingsKey,
  workStartedAt,
  activeTool,
  questionToken,
  readTerminalScreen,
  onOpenTerminal,
  onOpenPath,
}: {
  agentId: string;
  active: boolean;
  theme: AppThemeId;
  agentStatus: AgentStatus;
  sessionId?: string;
  question?: string | null;
  assistantMessage?: string | null;
  folder?: string;
  projectName?: string;
  connectionLabel?: string;
  provider?: string;
  modelEditingSupported?: boolean;
  modelSettingsKey?: string;
  workStartedAt?: number;
  activeTool?: string;
  questionToken?: number;
  readTerminalScreen?: () => string;
  onOpenTerminal: () => void;
  onOpenPath?: (path: string) => void;
}) {
  const { text } = useAppLanguage();
  const modelChanging = useChatSessionModelChanging(agentId);
  const storeKey = `${agentId}:${sessionId || "unbound"}`;
  const currentStoreKey = useRef(storeKey);
  currentStoreKey.current = storeKey;
  const openPathRef = useRef(onOpenPath);
  openPathRef.current = onOpenPath;
  const openPath = useCallback((path: string) => openPathRef.current?.(path), []);
  const stableOpenPath = onOpenPath ? openPath : undefined;
  const [composerIntent, setComposerIntent] = useState<ComposerIntent | null>(null);
  const reuseMessage = useCallback((value: string) => setComposerIntent({ storageKey: storeKey, mode: "reuse", value }), [storeKey]);
  const quoteMessage = useCallback((value: string) => setComposerIntent({ storageKey: storeKey, mode: "quote", value: value.slice(0, 2000) }), [storeKey]);
  const [blocks, setBlocks] = useState<ChatBlock[]>([]);
  const blocksRef = useRef<ChatBlock[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [artifacts, setArtifacts] = useState<ConversationArtifact[]>([]);
  const [tool, setTool] = useState<string | undefined>(undefined);
  // Turn lifecycle from the transcript — overrides a stale hook "working".
  const [lifecycle, setLifecycle] = useState<"working" | "idle" | undefined>(undefined);
  const [lifecycleAt, setLifecycleAt] = useState<number | undefined>();
  const [transcriptTool, setTranscriptTool] = useState<string | undefined>();
  const [dispatchAt, setDispatchAt] = useState(0);
  const [workClock, setWorkClock] = useState(Date.now());
  const [busySince, setBusySince] = useState(0);
  const [pendingQuestion, setPendingQuestion] = useState<ChatBlocksResult["pendingQuestion"]>(null);
  // Transcript signature + the value at the moment the user hit 중단/Esc, so an
  // interrupt immediately unsticks a stuck "working" until genuinely new content
  // arrives (msgKey changes).
  const [msgKey, setMsgKey] = useState("");
  const msgKeyRef = useRef("");
  const [stoppedKey, setStoppedKey] = useState<string | null>(null);
  // Block duplicate answers while keeping the wait visible until work resumes.
  const [answeredPromptSig, setAnsweredPromptSig] = useState("");
  const [respondingPromptSig, setRespondingPromptSig] = useState("");
  const [promptError, setPromptError] = useState("");
  const promptSigRef = useRef("");
  const respondingRef = useRef(false);
  const [terminalPromptState, setTerminalPromptState] = useState<{ agentId: string; prompt: TerminalStartupPrompt | null }>({ agentId, prompt: null });
  const [visible, setVisible] = useState(CHAT_PAGE);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  // Reserved (queued) messages waiting to be sent while the agent is working.
  // Restored from the module store so switching to the terminal and back keeps
  // them; every mutation writes back through mutateQueue.
  const [queue, setQueue] = useState<string[]>(() => queueStore.get(storeKey) ?? []);
  const lastDispatchRef = useRef(0);
  // Messages just sent from the composer, echoed instantly so the chat updates
  // without waiting for the next poll; dropped once the transcript includes them.
  const [pending, setPending] = useState<string[]>([]);
  const keyRef = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const followBottomRef = useRef(true);
  const fetchRef = useRef<() => void>(() => {});
  // First paint (session open / terminal→chat switch) should land at the
  // bottom (most recent), not the top.
  const firstLoadRef = useRef(true);
  // When we reveal older turns, remember the scroll height taken just before so
  // the layout effect can restore the viewport position (content grows above).
  const anchorHeightRef = useRef<number | null>(null);
  // Set to the transcript signature at the moment "/clear" is sent. While the
  // transcript still matches it (the agent hasn't cut over to a fresh
  // conversation yet), the view stays empty instead of flashing the old messages
  // back. Released once the transcript signature changes.
  const clearedSigRef = useRef<string | null>(null);

  useEffect(() => {
    keyRef.current = "";
    blocksRef.current = [];
    setStatus("loading");
    setBlocks([]);
    setHasOlder(false);
    setLoadingOlder(false);
    setIndexing(false);
    setArtifacts([]);
    setVisible(CHAT_PAGE);
    setShowJumpToLatest(false);
    setPending([]);
    setQueue(queueStore.get(storeKey) ?? []); // restore this exact conversation's reservations
    setAnsweredPromptSig("");
    setPendingQuestion(null);
    setPromptError("");
    setStoppedKey(null);
    setLifecycle(undefined); setLifecycleAt(undefined); setTranscriptTool(undefined); setDispatchAt(0);
    firstLoadRef.current = true;
    followBottomRef.current = true;
    clearedSigRef.current = null;
  }, [agentId, sessionId, storeKey]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false, refreshAgain = false;
    let followup: number | undefined;
    const fetchBlocks = async () => {
      if (cancelled) return;
      if (inFlight) { refreshAgain = true; return; }
      inFlight = true;
      try {
        const result = await invoke("chat_blocks", {
          id: agentId,
          sessionId,
          limit: CHAT_DB_PAGE,
        });
        if (cancelled) return;
        if (result.unsupported) {
          setPendingQuestion(null);
          setStatus("unsupported");
          return;
        }
        const incoming = result.blocks ?? [];
        const switchingToPersistentHistory =
          incoming.some((block) => block.sequence != null) &&
          blocksRef.current.some((block) => block.sequence == null);
        const next = switchingToPersistentHistory
          ? incoming
          : mergeChatHistory(blocksRef.current, incoming);
        setHasOlder(result.hasOlder === true);
        setIndexing(result.indexing === true);
        if (result.artifacts) setArtifacts(previous => mergeChatFiles(previous, result.artifacts!, incoming));
        if (result.tool) setTool(result.tool);
        setLifecycle(result.lifecycle);
        setLifecycleAt(result.lifecycleAt);
        setTranscriptTool(result.activeTool);
        setPendingQuestion(result.pendingQuestion ?? null);
        // Drop optimistic echoes now present in the transcript (exact match on
        // a user text block) so we don't show them twice.
        const userTexts = new Set(
          next.filter((b) => b.role === "user" && b.kind === "text").map((b) => b.text ?? "")
        );
        setPending((prev) => { const next = prev.filter((t) => !userTexts.has(t)); return next.length === prev.length ? prev : next; });
        const last = next[next.length - 1];
        const key = `${next.length}:${last?.sequence ?? "direct"}:${JSON.stringify(last ?? {}).slice(-160)}`;
        // After "/clear", keep the view empty until the transcript actually
        // changes (agent emptied it or cut over to a new session). Restoring the
        // pre-clear content on the next poll would undo the clear visually.
        if (clearedSigRef.current !== null) {
          if (key === clearedSigRef.current) return;
          clearedSigRef.current = null;
        }
        if (key === keyRef.current && next === blocksRef.current) return;
        keyRef.current = key;
        msgKeyRef.current = key;
        setMsgKey(key);
        const el = scrollRef.current;
        const firstLoad = firstLoadRef.current;
        const nearBottom = el
          ? el.scrollHeight - el.scrollTop - el.clientHeight < 80
          : true;
        blocksRef.current = next;
        setBlocks(next);
        setStatus(next.length ? "ready" : "empty");
        // Follow live updates only when the user was already near the bottom.
        // The first-paint bottom-pin is handled by the layout effect below (it
        // runs after the new blocks commit to the DOM); doing it here with a rAF
        // could fire before the commit, leaving scrollHeight stale so the view
        // sticks at the top when re-entering the chat from another session.
        if (nearBottom && !firstLoad) {
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              setShowJumpToLatest(false);
            }
          });
        } else if (!nearBottom && !firstLoad) {
          setShowJumpToLatest(true);
        }
      } catch {
        // Keep the last conversation on a transient IPC error.
      } finally {
        inFlight = false;
        if (refreshAgain && !cancelled) { refreshAgain = false; followup = window.setTimeout(fetchBlocks, 250); }
      }
    };
    fetchRef.current = fetchBlocks;
    // Load once whenever the view is shown (even for an inactive pane in a
    // Screen split); only the focused pane keeps polling to limit work.
    void fetchBlocks();
    if (!active) return () => { cancelled = true; window.clearTimeout(followup); };
    const timer = window.setInterval(fetchBlocks, 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(followup);
      window.clearInterval(timer);
    };
  }, [agentId, active, sessionId]);

  // Instant refresh when the transcript file changes on disk (fs.watch push),
  // instead of waiting for the 3s poll. Only the focused pane subscribes.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let unlisten = () => {};
    let timer: number | undefined;
    void listen<{ agentId?: string; path?: string }>("chat:changed", ({ payload }) => {
      if (payload.agentId && payload.agentId !== agentId) return;
      if (!payload.agentId && payload.path && sessionId && !payload.path.toLowerCase().includes(sessionId.toLowerCase())) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fetchRef.current(), 180);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unlisten();
    };
  }, [active, agentId, sessionId]);

  // User images belong to the user, including an image-only message. Always
  // advance the cursor so an unknown block cannot trap the grouping loop.
  const ranges = useMemo(() => {
    const isUserBlock = (block: ChatBlock) => block.role === "user" && (block.kind === "text" || block.kind === "image");
    const ranges: { user: boolean; start: number; end: number }[] = [];
    let i = 0;
    while (i < blocks.length) {
      const b = blocks[i];
      if (isUserBlock(b)) {
        ranges.push({ user: true, start: i, end: i + 1 });
        i += 1;
      } else {
        const start = i;
        do {
          i += 1;
        } while (i < blocks.length && !isUserBlock(blocks[i]));
        ranges.push({ user: false, start, end: i });
      }
    }
    return ranges;
  }, [blocks]);

  const hidden = Math.max(0, ranges.length - visible);
  const historyAvailable = hidden > 0 || hasOlder;

  const loadOlder = async () => {
    if (loadingOlder) return;
    followBottomRef.current = false;
    const el = scrollRef.current;
    anchorHeightRef.current = el ? el.scrollHeight : null;
    if (hidden > 0) {
      setVisible((v) => v + CHAT_PAGE * 2);
      return;
    }
    const beforeSequence = blocksRef.current[0]?.sequence;
    if (!beforeSequence) {
      anchorHeightRef.current = null;
      setHasOlder(false);
      return;
    }
    setLoadingOlder(true);
    try {
      const result: ChatBlocksResult = await invoke("chat_blocks", {
        id: agentId,
        sessionId,
        beforeSequence,
        limit: CHAT_DB_PAGE,
      });
      if (currentStoreKey.current !== storeKey) return;
      const known = new Set(
        blocksRef.current.map((block) => block.sequence).filter((value) => value != null)
      );
      const older = (result.blocks ?? []).filter(
        (block) => block.sequence == null || !known.has(block.sequence)
      );
      if (older.length > 0) {
        const next = older.concat(blocksRef.current);
        blocksRef.current = next;
        setBlocks(next);
        setVisible((value) => value + CHAT_PAGE * 2);
      } else {
        anchorHeightRef.current = null;
      }
      setHasOlder(result.hasOlder === true);
      if (result.artifacts) setArtifacts(previous => mergeChatFiles(previous, result.artifacts!, result.blocks ?? []));
    } catch {
      if (currentStoreKey.current === storeKey) anchorHeightRef.current = null;
    } finally {
      if (currentStoreKey.current === storeKey) setLoadingOlder(false);
    }
  };

  // Auto-reveal older turns when the user scrolls to the top (button remains
  // as an explicit affordance). The anchor guard blocks re-entry until the
  // layout effect below has restored position for the pending load.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    followBottomRef.current = distanceFromBottom < 80;
    setShowJumpToLatest(distanceFromBottom > 160);
    if (status === "ready" && historyAvailable && el.scrollTop < 80 && anchorHeightRef.current === null) {
      void loadOlder();
    }
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    followBottomRef.current = true;
    setShowJumpToLatest(false);
  };

  // Prepending older turns grows content above the viewport; shift scrollTop by
  // the added height so the previously-visible messages stay put (no jump).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && anchorHeightRef.current !== null) {
      el.scrollTop += el.scrollHeight - anchorHeightRef.current;
      anchorHeightRef.current = null;
    }
  }, [visible, blocks]);

  // First paint after a fresh mount (opening the chat, or re-entering it from
  // another session) pins to the bottom once the blocks have actually committed
  // to the DOM — a layout effect sees the final scrollHeight, unlike a rAF fired
  // from inside the async fetch, so the view no longer sticks at the top.
  useLayoutEffect(() => {
    if (!firstLoadRef.current || status !== "ready") return;
    if (anchorHeightRef.current !== null) return; // loadOlder prepend in flight
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    followBottomRef.current = true;
    setShowJumpToLatest(false);
    firstLoadRef.current = false;
  }, [status, blocks, visible]);

  // A lazy image can grow after the first transcript paint. Keep the latest
  // message visible only while following the bottom; never pull someone away
  // from earlier history when an image finishes loading.
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const el = scrollRef.current;
      if (el && followBottomRef.current && !firstLoadRef.current && anchorHeightRef.current === null) {
        el.scrollTop = el.scrollHeight;
        setShowJumpToLatest(false);
      }
    });
    observer.observe(thread);
    return () => observer.disconnect();
  }, [storeKey]);

  const visibleTurns: ReactNode[] = useMemo(() => ranges.slice(hidden).map((range) =>
    range.user ? (
      <div key={`u-${blockRenderKey(blocks[range.start])}`} className="chat-turn user">
        <UserMessage text={blocks[range.start].text ?? ""} agentId={agentId} sequence={blocks[range.start].sequence} imageOnly={blocks[range.start].kind === "image"} folder={folder} onOpenPath={stableOpenPath} onReuse={reuseMessage} />
      </div>
    ) : (
      <AssistantTurn key={`a-${blockRenderKey(blocks[range.start])}`} run={blocks.slice(range.start, range.end)} files={chatFilesForTurn(artifacts, blocks.slice(range.start, range.end))} tool={provider || tool} folder={folder} onOpenPath={stableOpenPath} onQuote={quoteMessage} />
    )
  ), [ranges, hidden, blocks, agentId, folder, stableOpenPath, reuseMessage, artifacts, provider, tool, quoteMessage]);

  // Combine current transcript work with fresh hooks. Completion timestamps
  // end stale work without concealing a turn that started after that completion.
  const stoppedHere = stoppedKey !== null && stoppedKey === msgKey;
  const initializing = agentStatus === "starting" || agentStatus === "recovering";
  const alive = !DEAD_STATUSES.includes(agentStatus);
  const canReadStartupPrompt = alive && agentStatus !== "idle" && (provider || tool) === "codex" && !!readTerminalScreen;
  useEffect(() => {
    const refresh = () => {
      const next = canReadStartupPrompt ? parseTerminalStartupPrompt(readTerminalScreen!(), "codex") : null;
      setTerminalPromptState(previous => previous.agentId === agentId && JSON.stringify(previous.prompt) === JSON.stringify(next)
        ? previous : { agentId, prompt: next });
    };
    refresh();
    if (!canReadStartupPrompt) return;
    const timer = window.setInterval(refresh, 200);
    return () => window.clearInterval(timer);
  }, [agentId, canReadStartupPrompt, readTerminalScreen]);
  const startupPrompt = canReadStartupPrompt && terminalPromptState.agentId === agentId ? terminalPromptState.prompt : null;
  const nativeQuestion = alive && !initializing && agentStatus !== "idle" && !stoppedHere ? pendingQuestion : null;
  const questionRaw = nativeQuestion?.answeredIndices?.length ? JSON.stringify({ questions: questionDetails(nativeQuestion.question).questions.filter((_, i) => !nativeQuestion.answeredIndices!.includes(i)).map(q => ({ id: q.id, question: q.text, options: q.options })) }) : nativeQuestion?.question || question;
  const prompt = startupPrompt || parseChatPrompt(nativeQuestion ? "waiting" : agentStatus, questionRaw, assistantMessage, provider || tool);
  const promptSig = prompt ? startupPrompt
    ? `${agentId}|startup|${promptSignature(startupPrompt)}`
    : `${storeKey}|${nativeQuestion?.id || questionToken || ""}|${promptSignature(prompt)}` : "";
  promptSigRef.current = promptSig;
  useEffect(() => { setAnsweredPromptSig(""); setPromptError(""); }, [promptSig]);
  const busy = isChatWorking({ status: agentStatus, lifecycle, lifecycleAt, workStartedAt,
    dispatchAt, now: Math.max(workClock, Date.now()), stopped: stoppedHere, waiting: !!prompt && !nativeQuestion?.async && !initializing });
  useEffect(() => {
    if (!busy) { setBusySince(0); return; }
    setBusySince(Math.max(workStartedAt || 0, dispatchAt || 0) || Date.now());
    setWorkClock(Date.now());
    const timer = window.setInterval(() => setWorkClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy, workStartedAt, dispatchAt]);
  const elapsed = busySince ? Math.max(0, Math.floor((workClock - busySince) / 1000)) : 0;
  const runningTool = transcriptTool || (agentStatus === "working" ? activeTool : undefined);

  // Cancel the in-progress turn by sending Esc to the PTY — same as pressing
  // Esc in the Codex/Claude TUI. Re-poll so the transcript updates promptly.
  const interrupt = useCallback(() => {
    void invoke("write_pty", { id: agentId, data: "\x1b" }).catch(() => {});
    // Unstick the UI immediately: treat the session as idle until new content
    // (a changed transcript signature) arrives, so a stuck "working" after an
    // interrupt doesn't trap sends in the queue.
    setStoppedKey(msgKeyRef.current);
    window.setTimeout(() => fetchRef.current(), 500);
  }, [agentId]);

  // Keep waiting visible until the CLI resumes. Failed writes must not hide
  // the question or send the remaining keys into a different prompt.
  const respondPrompt = async (option: ChatPromptOption) => {
    if (!prompt || respondingRef.current || answeredPromptSig === promptSig) return;
    respondingRef.current = true;
    setRespondingPromptSig(promptSig);
    setPromptError("");
    const keys = prompt.answerStyle === "arrow"
      ? [...Array(Math.max(0, Number(option.send) - 1)).fill("\x1b[B"), "\r"]
      : [option.send, "\r"];
    try {
      if (startupPrompt) {
        await answerTerminalStartupPrompt(startupPrompt, Number(option.send) - 1,
          () => promptSigRef.current === promptSig ? parseTerminalStartupPrompt(readTerminalScreen!(), "codex") : null,
          key => invoke("write_pty", { id: agentId, data: key }),
          () => new Promise(resolve => window.setTimeout(resolve, 60)));
        lastDispatchRef.current = Date.now();
        // The hook review opens a full-screen details view; keep it visible.
        if (startupPrompt.startupKind === "hook-review" && option.send === "1") onOpenTerminal();
      } else {
        for (const key of keys) {
          if (promptSigRef.current !== promptSig) return;
          await invoke("write_pty", { id: agentId, data: key });
          await new Promise(resolve => window.setTimeout(resolve, 60));
        }
      }
      if (promptSigRef.current === promptSig) setAnsweredPromptSig(promptSig);
      window.setTimeout(() => fetchRef.current(), 400);
    } catch {
      if (promptSigRef.current === promptSig) setPromptError(text("답변을 보내지 못했습니다. 터미널에서 질문을 확인해 주세요.", "Could not send the answer. Check the question in the terminal."));
    } finally {
      respondingRef.current = false;
      setRespondingPromptSig("");
    }
  };

  const respondQuestions = async (answers: ChatAnswer[]) => {
    if (!nativeQuestion || respondingRef.current || answeredPromptSig === promptSig) return;
    respondingRef.current = true; setRespondingPromptSig(promptSig); setPromptError('');
    try {
      await invoke('answer_question', { id: agentId, sessionId, questionId: nativeQuestion.id, answers });
      if (promptSigRef.current === promptSig) setAnsweredPromptSig(promptSig);
      window.setTimeout(() => fetchRef.current(), 400);
    } catch {
      if (promptSigRef.current === promptSig) setPromptError(text('답변을 보내지 못했습니다. 터미널에서 질문을 확인해 주세요.', 'Could not send the answer. Check the question in the terminal.'));
    } finally { respondingRef.current = false; setRespondingPromptSig(''); }
  };

  // Esc cancels the in-progress turn from anywhere in the focused chat pane
  // (not just when the composer has focus) while the agent is working.
  useEffect(() => {
    if (!active || !busy || initializing || startupPrompt) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector(".image-viewer-backdrop")) {
        e.preventDefault();
        interrupt();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, busy, initializing, startupPrompt, interrupt]);

  // Actually write a message to the PTY + echo it instantly. Text and Enter go
  // as separate writes (80ms apart) so Codex/Claude don't treat "text\r" as a
  // multiline paste.
  const dispatch = useCallback(
    (value: string) => {
      lastDispatchRef.current = Date.now();
      setDispatchAt(lastDispatchRef.current);
      setWorkClock(lastDispatchRef.current);
      setStoppedKey(null);
      if (value.trim() === "/clear") {
        // /clear resets the agent's conversation — mirror it in the view right
        // away and suppress the pre-clear transcript until it changes on disk.
        clearedSigRef.current = keyRef.current || "empty";
        keyRef.current = "";
        blocksRef.current = [];
        setBlocks([]);
        setPending([]);
        setVisible(CHAT_PAGE);
        setStatus("empty");
        setStoppedKey(null);
        firstLoadRef.current = true;
      } else {
        setPending((p) => [...p, value]);
        void invoke("conversation_record_user_message", {
          id: agentId,
          sessionId,
          text: value,
        }).catch(() => {});
      }
      void invoke("write_pty", { id: agentId, data: value }).catch(() => {});
      window.setTimeout(() => {
        void invoke("write_pty", { id: agentId, data: "\r" }).catch(() => {});
      }, 80);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
      // Re-poll soon so the real transcript (and reply) lands fast, not on the 3s tick.
      window.setTimeout(() => fetchRef.current(), 700);
      window.setTimeout(() => fetchRef.current(), 1600);
    },
    [agentId, sessionId]
  );

  // Mutate the queue and mirror it into the module store so it survives the
  // ChatView unmount/remount on a terminal ↔ chat switch.
  const mutateQueue = useCallback(
    (fn: (q: string[]) => string[]) => {
      setQueue((prev) => {
        const next = fn(prev);
        if (next.length) queueStore.set(storeKey, next);
        else queueStore.delete(storeKey);
        return next;
      });
    },
    [storeKey]
  );

  // Composer submit: send now if the agent is ready and nothing is queued;
  // otherwise reserve it in the queue to be drained when the agent frees up.
  const sendMessage = (raw: string) => {
    if (isChatSessionModelChanging(agentId)) return;
    const value = raw.trim();
    if (!value) return;
    const cooled = Date.now() - lastDispatchRef.current >= QUEUE_COOLDOWN_MS;
    const liveStartup = canReadStartupPrompt && parseTerminalStartupPrompt(readTerminalScreen!(), "codex");
    if (alive && !busy && !prompt && !liveStartup && queue.length === 0 && cooled) dispatch(value);
    else mutateQueue((q) => [...q, value]);
  };

  // Drain the queue one message per cooldown while the agent is ready.
  useEffect(() => {
    if (busy || prompt || modelChanging || !alive || queue.length === 0) return;
    const wait = Math.max(0, QUEUE_COOLDOWN_MS - (Date.now() - lastDispatchRef.current));
    const timer = window.setTimeout(() => {
      if (isChatSessionModelChanging(agentId)) return;
      if (canReadStartupPrompt && parseTerminalStartupPrompt(readTerminalScreen!(), "codex")) return;
      dispatch(queue[0]);
      mutateQueue((q) => q.slice(1));
    }, wait);
    return () => window.clearTimeout(timer);
  }, [busy, promptSig, modelChanging, agentId, alive, queue, dispatch, mutateQueue, canReadStartupPrompt, readTerminalScreen]);

  const cancelQueued = (index: number) =>
    mutateQueue((q) => q.filter((_, i) => i !== index));

  return (
    <div className="chat-view chat-view-modern">
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {status === "unsupported" && (
          <div className="chat-empty">{text("대화 보기를 지원하지 않는 세션입니다 (codex/claude).", "This session does not support conversation view (codex/claude).")}</div>
        )}
        {status === "loading" && <div className="chat-empty">{text("대화를 불러오는 중…", "Loading conversation…")}</div>}
        {status === "empty" && !pending.length && (
          <div className="chat-empty">{text("아직 대화 기록이 없습니다.", "There is no conversation history yet.")}</div>
        )}
        {status === "ready" && historyAvailable && (
          <button type="button" className="chat-more" onClick={loadOlder} disabled={loadingOlder}>
            {loadingOlder
              ? text("이전 대화를 불러오는 중…", "Loading earlier conversation…")
              : hidden > 0
                ? text(`▲ 이전 대화 더 보기 (${hidden})`, `▲ Show earlier conversation (${hidden})`)
                : text("▲ 저장된 이전 대화 더 보기", "▲ Show saved earlier conversation")}
          </button>
        )}
        {indexing && (
          <div className="chat-indexing">{text("이전 대화를 저장소에 정리하는 중… 최근 대화는 바로 볼 수 있습니다.", "Indexing earlier conversation in storage… Recent conversation is available immediately.")}</div>
        )}
        <div className="chat-thread" ref={threadRef}>
          {status === "ready" && visibleTurns}
          {pending.map((t, i) => (
            <div key={`pending-${i}`} className="chat-turn user pending">
              <UserMessage text={t} folder={folder} onOpenPath={stableOpenPath} onReuse={reuseMessage} />
            </div>
          ))}
          {busy && !startupPrompt && status !== "unsupported" && status !== "loading" && (
            <div className="chat-thinking" aria-live="polite">
              <span className="chat-thinking-dots">
                <i />
                <i />
                <i />
              </span>
              {agentStatus === "recovering"
                ? text("복구 중…", "Recovering…")
                : initializing
                  ? text("시작 중…", "Starting…")
                  : text("작업 중…", "Working…")}
            </div>
          )}
        </div>
      </div>
      {showJumpToLatest && (
        <button type="button" className="chat-jump-latest" onClick={jumpToLatest}>
          ↓ {text("최신 대화로 이동", "Jump to latest")}
        </button>
      )}
      {prompt && (
        <div className={`chat-prompt ${prompt.kind}${startupPrompt ? " chat-prompt-startup" : ""}`} role="status" aria-live="polite">
          <strong className="chat-prompt-heading">{startupPrompt?.startupKind === "folder-trust" ? text("프로젝트 폴더 신뢰 확인", "Trust this project folder") : startupPrompt?.startupKind === "hook-review" ? text("시작 훅 확인", "Review startup hooks") : prompt.kind === "authentication" ? text("Claude 로그인 필요", "Claude sign-in required") : nativeQuestion?.async ? text("작업 중 질문 · 답변을 선택해 주세요", "Question while working · choose your answer") : text("답변 대기 중", "Answer needed")}</strong>
          {prompt.answerStyle === 'codex-form' && prompt.questions ? <QuestionForm key={promptSig} questions={prompt.questions}
            disabled={!nativeQuestion || respondingPromptSig === promptSig || answeredPromptSig === promptSig || !!promptError} onSubmit={answers => { void respondQuestions(answers); }}/>
          : <div className="chat-prompt-text">
            {prompt.kind === "permission" || prompt.kind === "authentication" ? "🔒 " : "❓ "}
            {prompt.text || text("에이전트가 질문 또는 승인을 기다리고 있습니다. 터미널에서 내용을 확인하고 답변해 주세요.", "The agent is waiting for a question or approval. Open the terminal to review and answer it.")}
          </div>}
          <div className="chat-prompt-hint">{prompt.kind === "authentication"
            ? text("이 세션의 터미널에서 /login을 실행하고 브라우저에서 로그인해 주세요. 로그인 후 요청을 다시 보내세요.", "Run /login in this session's terminal and sign in through the browser. Then resend your request.")
            : answeredPromptSig === promptSig
            ? text("답변을 보냈습니다. 계속 대기하면 터미널에서 확인해 주세요.", "Answer sent. If waiting continues, check the terminal.")
            : startupPrompt && prompt.options.length ? text("내용을 확인한 뒤 아래에서 선택해 주세요. 선택한 답변만 터미널에 전달합니다.", "Review the details and choose below. Your selected answer will be sent to the terminal.")
            : nativeQuestion?.async ? text('작업은 계속 진행됩니다. 보내기를 누르면 Codex 질문에 답합니다.', 'Work continues. Send your answers to the queued Codex question.')
            : prompt.answerStyle === 'codex-form' ? text('답변을 선택한 뒤 보내기를 누르면 작업이 이어집니다.', 'Choose your answers and send them to continue.')
            : text("답변을 기다리는 상태입니다. 터미널에서 질문에 답하면 작업이 이어집니다.", "Waiting for your answer. Respond in the terminal to continue.")}</div>
          {promptError && <div className="chat-prompt-error" role="alert">{promptError}</div>}
          <div className="chat-prompt-options">
            {prompt.options.map((option, i) => (
              <button
                key={i}
                type="button"
                className="chat-prompt-option"
                disabled={respondingPromptSig === promptSig || answeredPromptSig === promptSig || Boolean(promptError)}
                onClick={() => { void respondPrompt(option); }}
              >
                {option.label}
              </button>
            ))}
            <button type="button" className="chat-prompt-option" onClick={onOpenTerminal}>{prompt.kind === "authentication" ? text("로그인할 터미널 열기", "Open terminal to sign in") : text("터미널에서 답변", "Answer in terminal")}</button>
          </div>
        </div>
      )}
      {queue.length > 0 && (
        <div className="chat-queue">
          <div className="chat-queue-head">
            {text(`예약 대기열 ${queue.length}`, `Queued ${queue.length}`)}
            {busy && <span className="chat-queue-hint">{text("· 대기 상태가 되면 순서대로 전송", "· sent in order when ready")}</span>}
          </div>
          {queue.map((t, i) => (
            <div key={`q${i}`} className="chat-queue-item">
              <span className="chat-queue-text">{t}</span>
              <button
                type="button"
                className="chat-queue-cancel"
                title={text("예약 취소", "Cancel queued message")}
                onClick={() => cancelQueued(i)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {status !== "unsupported" && (
        <>
        {busy && !startupPrompt && <div className="chat-work-status" role="status">
          <span className="chat-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
          <strong>{agentStatus === "recovering" ? text("복구 중", "Recovering") : initializing ? text("세션 시작 중", "Starting session") : text("작업 중", "Working")}</strong>
          {runningTool && <span className="chat-work-current" title={runningTool}>{workLabel(runningTool, text)}</span>}
          <span className="chat-work-elapsed" aria-hidden="true">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
          <button type="button" className="chat-work-details" onClick={() => { const details = scrollRef.current?.querySelectorAll<HTMLDetailsElement>(".chat-work-tools"); const latest = details?.[details.length - 1]; if (latest) { latest.open = true; latest.scrollIntoView({ block: "center", behavior: "smooth" }); } else jumpToLatest(); }}>{text("작업 내역", "Work details")}</button>
        </div>}
        <ChatComposer storageKey={storeKey} onSend={sendMessage} busy={busy || !!prompt} waitingForAnswer={!!prompt} authenticationRequired={prompt?.kind === "authentication"} tool={provider || tool} folder={folder}
          agentId={agentId} active={active} sessionId={sessionId} modelEditingSupported={modelEditingSupported} modelSettingsKey={modelSettingsKey}
          modelBusy={busy || !!prompt || initializing || queue.length > 0}
          projectName={projectName} connectionLabel={connectionLabel} intent={composerIntent} onInterrupt={busy && !initializing && !prompt ? interrupt : undefined} />
        </>
      )}
    </div>
  );
}

// Composer for sending additional instructions to the session from the chat
// view. The draft text and image attachments are persisted per session (module
// stores) so switching to the terminal and back keeps them. On send, attachment
// paths are appended to the message so Codex/Claude can read the images.
type AcItem = { value: string; label: string; desc?: string };

function ChatComposer({
  agentId,
  active,
  sessionId,
  modelEditingSupported,
  modelSettingsKey,
  modelBusy,
  storageKey,
  onSend,
  busy,
  waitingForAnswer,
  authenticationRequired,
  tool,
  folder,
  projectName,
  connectionLabel,
  onInterrupt,
  intent,
}: {
  agentId: string;
  active: boolean;
  sessionId?: string;
  modelEditingSupported: boolean;
  modelSettingsKey?: string;
  modelBusy: boolean;
  storageKey: string;
  onSend: (text: string) => void;
  busy: boolean;
  waitingForAnswer: boolean;
  authenticationRequired: boolean;
  tool?: string;
  folder?: string;
  projectName?: string;
  connectionLabel?: string;
  onInterrupt?: () => void;
  intent?: ComposerIntent | null;
}) {
  const { text: localize } = useAppLanguage();
  const modelChanging = useChatSessionModelChanging(agentId);
  const [text, setText] = useState(() => draftStore.get(storageKey) ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(
    () => attachStore.get(storageKey) ?? []
  );
  const [context, setContext] = useState<ComposerContext | null>(() => composerContextStore.get(storageKey) ?? null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  // Autocomplete popup (/slash or @file).
  const [ac, setAc] = useState<{ items: AcItem[]; index: number; trigger: AutocompleteTrigger } | null>(null);
  const acTriggerRef = useRef<AutocompleteTrigger | null>(null);
  const fileSeqRef = useRef(0);
  const fileTimerRef = useRef<number | undefined>(undefined);

  const refreshAutocomplete = (value: string, caret: number) => {
    const trigger = detectAutocomplete(value, caret);
    acTriggerRef.current = trigger;
    if (!trigger) {
      setAc(null);
      return;
    }
    if (trigger.kind === "slash") {
      const items = filterSlashCommands(slashCommandsForTool(tool), trigger.query).map((c) => ({
        value: c.name,
        label: `/${c.name}`,
        desc: c.desc,
      }));
      setAc(items.length ? { items, index: 0, trigger } : null);
      return;
    }
    // @file — debounced backend search under the session folder.
    window.clearTimeout(fileTimerRef.current);
    const seq = ++fileSeqRef.current;
    if (!folder) {
      setAc(null);
      return;
    }
    fileTimerRef.current = window.setTimeout(() => {
      void invoke("search_files", { folder, query: trigger.query, limit: 20 })
        .then((paths) => {
          const current = acTriggerRef.current;
          if (seq !== fileSeqRef.current || !current || current.kind !== "file") return;
          const list = Array.isArray(paths) ? (paths as string[]) : [];
          const items = list.map((p) => ({ value: p, label: p }));
          setAc(items.length ? { items, index: 0, trigger: current } : null);
        })
        .catch(() => {});
    }, 140);
  };

  const acceptAutocomplete = (item: AcItem) => {
    const trigger = ac?.trigger;
    if (!trigger) return;
    const result = applyAutocomplete(text, trigger, item.value);
    updateText(result.text);
    setAc(null);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = result.caret;
      }
    });
  };

  // Auto-grow the textarea to fit its content up to a max height, then scroll —
  // so a long message is fully visible instead of trapped in one scrolling row.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  // Restore the persisted draft/attachments when the session changes.
  useEffect(() => {
    setText(draftStore.get(storageKey) ?? "");
    setAttachments(attachStore.get(storageKey) ?? []);
    setContext(composerContextStore.get(storageKey) ?? null);
  }, [storageKey]);

  useEffect(() => {
    if (!intent || intent.storageKey !== storageKey || appliedComposerIntents.has(intent)) return;
    appliedComposerIntents.add(intent);
    const next = { mode: intent.mode, value: intent.value };
    composerContextStore.set(storageKey, next);
    setContext(next);
    if (intent.mode === "reuse") {
      const existing = draftStore.get(storageKey)?.trim();
      updateText(existing ? `${existing}\n\n${intent.value}` : intent.value);
    }
    requestAnimationFrame(() => taRef.current?.focus());
  }, [intent, storageKey]);

  const updateText = (value: string) => {
    setText(value);
    if (value) draftStore.set(storageKey, value);
    else draftStore.delete(storageKey);
  };
  const updateAttachments = (fn: (a: Attachment[]) => Attachment[]) => {
    setAttachments((prev) => {
      const next = fn(prev);
      if (next.length) attachStore.set(storageKey, next);
      else attachStore.delete(storageKey);
      return next;
    });
  };

  const send = () => {
    if (authenticationRequired || isChatSessionModelChanging(agentId)) return;
    // Expand attachments on send: pasted-text blocks and image paths join the
    // typed text so the agent receives everything.
    const texts = attachments.filter((a) => a.kind === "text").map((a) => a.text);
    const paths = attachments
      .filter((a) => a.kind === "image")
      .map((a) => formatDroppedPathForTerminal((a as { path: string }).path))
      .filter(Boolean);
    const request = [text.trim(), ...texts, ...paths].filter(Boolean).join("\n").trim();
    if (!request) return;
    const value = context?.mode === "quote" ? `${context.value.split(/\r?\n/).map(line => `> ${line}`).join("\n")}\n\n${request}` : request;
    onSend(value);
    updateText("");
    updateAttachments(() => []);
    setContext(null); composerContextStore.delete(storageKey);
  };

  const addImage = (filePath: string) => {
    void invoke<{ dataUrl?: string } | string | null>("read_image_data_url", { path: filePath })
      .then((res) => {
        const dataUrl = typeof res === "string" ? res : res?.dataUrl ?? "";
        updateAttachments((a) => [...a, { kind: "image", path: filePath, dataUrl }]);
      })
      .catch(() => updateAttachments((a) => [...a, { kind: "image", path: filePath, dataUrl: "" }]));
  };

  // Append a file path to the input (like dropping into the terminal).
  const insertSnippet = (snippet: string) => {
    if (!snippet) return;
    updateText(text.trim() ? `${text.replace(/\s*$/, "")} ${snippet} ` : `${snippet} `);
  };

  const attachFiles = async () => {
    setAttaching(true); setAttachmentError("");
    try {
      const selection = await openDialog({ multiple: true });
      const paths = typeof selection === "string" ? [selection] : selection || [];
      const files = paths.filter(path => !/\.(?:png|jpe?g|gif|webp|bmp)$/i.test(path));
      if (files.length) insertSnippet(files.map(formatDroppedPathForTerminal).join(" "));
      paths.filter(path => /\.(?:png|jpe?g|gif|webp|bmp)$/i.test(path)).forEach(addImage);
    } catch { setAttachmentError(localize("파일을 선택하지 못했습니다. 다시 시도해 주세요.", "Could not select files. Please try again.")); }
    finally { setAttaching(false); }
  };

  // Ctrl+V: a clipboard image saves to a temp file and shows as a chip; a large
  // text paste collapses into a "pasted text" chip (like a terminal) instead of
  // flooding the input; small text pastes go inline as normal.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    const hasImage = items && Array.from(items).some((it) => it.type.startsWith("image/"));
    if (hasImage) {
      e.preventDefault();
      void invoke<string | null>("save_clipboard_image")
        .then((filePath) => {
          if (filePath) addImage(filePath);
        })
        .catch(() => {});
      return;
    }
    const pasted = e.clipboardData?.getData("text") ?? "";
    const lines = pasted.split(/\r?\n/).length;
    if (pasted.length > PASTE_COLLAPSE_CHARS || lines > PASTE_COLLAPSE_LINES) {
      e.preventDefault();
      updateAttachments((a) => [...a, { kind: "text", text: pasted }]);
    }
    // else: let the small paste insert inline.
  };

  // Drag & drop a file/image → insert its path (Electron resolves the real path).
  const onDragOver = (e: DragEvent<HTMLTextAreaElement>) => {
    if (hasExternalFiles(e.dataTransfer)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    if (!hasExternalFiles(e.dataTransfer)) return;
    e.preventDefault();
    const bridge = electronBridge();
    const paths = extractDroppedFilePaths(
      e.dataTransfer,
      bridge ? (file) => bridge.getPathForFile(file) : undefined
    )
      .map(formatDroppedPathForTerminal)
      .filter(Boolean);
    if (paths.length) insertSnippet(paths.join(" "));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    // Autocomplete popup takes priority over the send/newline keys.
    if (ac) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAc({ ...ac, index: (ac.index + 1) % ac.items.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAc({ ...ac, index: (ac.index - 1 + ac.items.length) % ac.items.length });
        return;
      }
      if ((e.key === "Enter" && !e.ctrlKey && !e.metaKey) || e.key === "Tab") {
        e.preventDefault();
        acceptAutocomplete(ac.items[ac.index]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setAc(null);
        return;
      }
    }
    // Esc-to-cancel is handled by a window listener in ChatView.
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.shiftKey) return;
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Enter inserts a newline at the cursor (a textarea has no
      // default newline for this combo, so do it manually).
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      const next = `${text.slice(0, start)}\n${text.slice(end)}`;
      updateText(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 1;
      });
      return;
    }
    // Plain Enter sends.
    e.preventDefault();
    send();
  };

  const canSend = !authenticationRequired && !modelChanging && Boolean(text.trim() || attachments.length);
  const sendLabel = busy ? localize("대기열에 예약", "Queue message") : localize("메시지 전송", "Send message");
  const contextName = projectName || folder?.split(/[\\/]/).filter(Boolean).pop();

  return (
    <div className="chat-composer-area">
      {contextName && <div className="chat-composer-context"><span title={folder}><ChatIcon name="folder" />{contextName}</span>{connectionLabel && <><span aria-hidden="true">·</span><span><ChatIcon name="computer" />{connectionLabel}</span></>}</div>}
      <div className="chat-composer">
      {context && <div className="chat-composer-reference">
        <ChatIcon name={context.mode === "quote" ? "quote" : "edit"} />
        <span><strong>{context.mode === "quote" ? localize("답변 인용", "Quoted response") : localize("수정해서 다시 요청 · 새 메시지로 전송", "Edit and send again · sends a new message")}</strong><span className="chat-composer-reference-text" title={context.value}>{context.value}</span></span>
        <button type="button" className="chat-copy-button chat-reference-clear" onClick={() => { setContext(null); composerContextStore.delete(storageKey); }} title={localize("인용·다시 요청 취소", "Remove quote or reused request")} aria-label={localize("인용·다시 요청 취소", "Remove quote or reused request")}><ChatIcon name="close" /></button>
      </div>}
      {attachments.length > 0 && (
        <div className="chat-attachments">
          {attachments.map((a, i) =>
            a.kind === "image" ? (
              <div key={`img-${i}`} className="chat-attachment" title={a.path}>
                {a.dataUrl ? (
                  <img src={a.dataUrl} alt={localize("첨부 이미지", "Attached image")} />
                ) : (
                  <span className="chat-attachment-file">🖼</span>
                )}
                <button
                  type="button"
                  className="chat-attachment-remove"
                  title={localize("첨부 제거", "Remove attachment")}
                  onClick={() => updateAttachments((arr) => arr.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ) : (
              <div
                key={`txt-${i}`}
                className="chat-attachment-textchip"
                title={a.text.slice(0, 2000)}
              >
                <span className="chat-attachment-texticon">📄</span>
                {localize(`붙여넣은 텍스트 · ${a.text.length.toLocaleString()}자`, `Pasted text · ${a.text.length.toLocaleString()} characters`)}
                <button
                  type="button"
                  className="chat-attachment-textremove"
                  title={localize("첨부 제거", "Remove attachment")}
                  onClick={() => updateAttachments((arr) => arr.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            )
          )}
        </div>
      )}
      {ac && (
        <div className="chat-ac">
          {ac.items.map((item, i) => (
            <button
              type="button"
              key={item.value}
              className={`chat-ac-item ${i === ac.index ? "on" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                acceptAutocomplete(item);
              }}
            >
              <span className="chat-ac-label">{item.label}</span>
              {item.desc && <span className="chat-ac-desc">{item.desc}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="chat-composer-row">
        <textarea
          ref={taRef}
          className="chat-composer-input"
          aria-label={localize("메시지 입력", "Message input")}
          value={text}
          onChange={(e) => {
            updateText(e.target.value);
            refreshAutocomplete(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(() => setAc(null), 120)}
          onPaste={onPaste}
          onDragOver={onDragOver}
          onDrop={onDrop}
          placeholder={
            authenticationRequired ? localize('로그인 필요 · 터미널에서 /login을 실행하세요', 'Sign-in required · run /login in the terminal') : waitingForAnswer ? localize('답변 대기 중 · 새 메시지는 예약됩니다', 'Waiting for an answer · new messages will be queued') : busy
              ? localize("작업 중입니다. 다음 메시지를 예약해 보세요", "Work is in progress. Queue your next message")
              : localize("이어서 이야기해 보세요…", "Continue the conversation…")
          }
          rows={1}
        />
      </div>
      <div className="chat-composer-toolbar">
        <button type="button" className="chat-composer-attach" title={localize("파일 또는 이미지 첨부", "Attach files or images")} aria-label={localize("파일 또는 이미지 첨부", "Attach files or images")} disabled={attaching} onClick={() => { void attachFiles(); }}><ChatIcon name="plus" /></button>
        {modelEditingSupported && (tool === "codex" || tool === "claude")
          ? <ChatModelPicker agentId={agentId} provider={tool} active={active} busy={modelBusy} sessionId={sessionId} settingsKey={modelSettingsKey} />
          : <span className="chat-composer-provider">{assistantLabel(tool)}</span>}
        <div className="chat-composer-controls">
        {onInterrupt && <button type="button" className="chat-composer-stop" onClick={onInterrupt} title={localize("진행 중단 (Esc)", "Stop progress (Esc)")} aria-label={localize("진행 중단", "Stop progress")}><ChatIcon name="stop" /></button>}
        <button
          type="button"
          className="chat-composer-send"
          onClick={send}
          disabled={!canSend}
          aria-label={sendLabel} title={sendLabel}
        >
          <ChatIcon name={busy ? "queue" : "send"} />
        </button>
        </div>
      </div>
      {attachmentError && <div className="chat-composer-error" role="alert">{attachmentError}</div>}
      {modelChanging && <div className="chat-model-notice" role="status">{localize("모델을 적용하고 있습니다. 작성한 메시지는 유지됩니다.", "Applying model settings. Your draft is kept.")}</div>}
      </div>
      <div className="chat-composer-hint">{busy ? localize("Enter 예약", "Enter to queue") : localize("Enter 전송", "Enter to send")}<span aria-hidden="true">·</span>{localize("Shift + Enter 줄바꿈", "Shift + Enter for a new line")}<span aria-hidden="true">·</span>{localize("/명령  @파일", "/commands  @files")}</div>
    </div>
  );
}
