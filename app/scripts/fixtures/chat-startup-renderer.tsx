import { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { PaneSlot, type RenderCtx } from "../../src/components/PaneSlot";
import type { Agent, AgentStatus, TerminalEntry } from "../../src/types";
import { AppLanguageProvider } from "../../src/lib/appLanguage";
import { startupTrust } from "./codex-startup-screens.mjs";
import "../../src/App.css";
import "@xterm/xterm/css/xterm.css";

localStorage.setItem("multiagent.appLanguage.v1", "ko");
const calls = [];
let screen = startupTrust;
let getEntry = () => null;
const terminalData = () => "\x1b[2J\x1b[H" + screen.replace(/\n/g, "\r\n");
const writeScreen = () => new Promise<void>(resolve => getEntry()?.term.write(terminalData(), resolve));
window.multiAgentElectron = {
  invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === "spawn_pty") return { reattached: false };
    if (command === "attach_terminal") {
      const data = terminalData();
      return { data, sequenceStart: 0, sequenceEnd: data.length, resetRequired: true, truncated: false };
    }
    if (command === "write_pty") {
      if (args.data === "\x1b[B" || args.data === "\x1b[A") {
        const lines = screen.split("\n");
        const selected = lines.findIndex(line => /^›\s*\d+\./.test(line));
        if (selected >= 0) {
          const step = args.data === "\x1b[B" ? 1 : -1;
          lines[selected] = lines[selected].replace(/^›/, " ");
          lines[selected + step] = lines[selected + step].replace(/^ /, "›");
          screen = lines.join("\n");
          await writeScreen();
        }
      }
    }
    if (command === "chat_blocks") return { sessionId: null, blocks: [], pendingQuestion: null };
    if (command === "session_notifications_get") return { enabled: true, revision: 0 };
    if (command === "account_session_status") return { mode: "direct", label: "기존 로그인" };
    if (command === "session_web_servers" || command === "session_deliveries_get") return [];
    if (command === "codex_capacity_retry_state") return { state: "idle" };
    return null;
  },
  onEvent: () => () => {},
};
const noop = () => {};
const project = { id: "p", name: "Startup fixture", folder: "K:/AI/Nogari", createdAt: 1 };

function Harness() {
  const [status, setStatus] = useState<AgentStatus>("starting");
  const [chat, setChat] = useState(true);
  const termsRef = useRef(new Map<string, TerminalEntry>());
  getEntry = () => termsRef.current.get("startup");
  const setAgentStatus = useCallback((_id: string, next: AgentStatus) => setStatus(next), []);
  const toggleChat = useCallback(() => setChat(value => !value), []);
  const agent: Agent = { id: "startup", projectId: "p", name: "시작 질문 확인", folder: project.folder, aiToolId: "codex", aiLabel: "Codex", dangerous: false, status, createdAt: 1 };
  window.startupFixture = { calls, setStatus, toggleChat,
    patchScreen: async next => { screen = next; await writeScreen(); },
  };
  const ctx: RenderCtx = { agents: [agent], projects: [project], theme: "soft", sessionPins: null, activePath: [], dragState: null, dropTarget: null, termsRef,
    setAgentStatus, setAgentSessionId: noop, setActivePath: noop, onCloseTab: noop, onSelectTab: noop, onResizeAt: noop, onDragStart: noop, onDragEnd: noop,
    onDropTargetChange: noop, onDrop: noop, onTabContextMenu: noop, chatModeAgents: new Set(chat ? [agent.id] : []), onToggleChat: toggleChat,
    getDocumentOwner: () => null, fallbackDocumentAgentId: null, onOpenBrowser: noop, onOpenMarkdownPath: noop, onOpenImagePath: noop, onOpenFolderPath: noop, onOpenTerminalPath: noop,
  };
  return <PaneSlot leaf={{ type: "leaf", id: "startup-leaf", tabs: [agent.id], activeIndex: 0 }} path={[]} ctx={ctx} />;
}
createRoot(document.getElementById("root")!).render(<AppLanguageProvider><Harness /></AppLanguageProvider>);
