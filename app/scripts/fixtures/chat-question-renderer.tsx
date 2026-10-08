import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatView } from "../../src/components/ChatView";
import "../../src/App.css";

let chat = null;
let olderChat = null;
const pendingReads = [];
const listeners = new Set();
const writes = [];
const answers = [];
const clipboard = [];
const imageClipboard = [];
const openedPaths = [];
const imageReads = [];
const resolvedPaths = [];
const chatReads = [];
let holdChatReads = false;
const heldChatReads = [];
let imagesBySequence = {};
let previewDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=";
let filesToSelect = [];
let failClipboard = false;
let failWrites = false;
let terminalScreen = "";
let changeScreenOnWrite = undefined;
const readTerminalScreen = () => terminalScreen;
window.multiAgentElectron = {
  invoke: async (command, args) => {
    if (command === "chat_blocks") {
      chatReads.push(args);
      if (holdChatReads) return new Promise(resolve => heldChatReads.push(resolve));
      return (args.beforeSequence ? olderChat : null) ?? chat ?? new Promise(resolve => pendingReads.push(resolve));
    }
    if (command === "write_pty") {
      writes.push(args.data);
      if (failWrites) throw new Error("fixture PTY write failure");
      if (changeScreenOnWrite !== undefined) {
        terminalScreen = changeScreenOnWrite;
        changeScreenOnWrite = undefined;
      } else if (args.data === "\x1b[B" || args.data === "\x1b[A") {
        const lines = terminalScreen.split("\n");
        const selected = lines.findIndex(line => /^›\s*\d+\./.test(line));
        if (selected >= 0) {
          const step = args.data === "\x1b[B" ? 1 : -1;
          lines[selected] = lines[selected].replace(/^›/, " ");
          lines[selected + step] = lines[selected + step].replace(/^ /, "›");
          terminalScreen = lines.join("\n");
        }
      }
    }
    if (command === 'answer_question') { answers.push(args); if (failWrites) throw new Error('fixture answer failure'); return { status: 'sent' }; }
    if (command === "clipboard_write_text") { if (failClipboard) throw Error("fixture clipboard failure"); clipboard.push(args.text); }
    if (command === "read_image_data_url") return previewDataUrl;
    if (command === "read_chat_images") { imageReads.push(args); return imagesBySequence[args.sequence] || []; }
    if (command === "resolve_terminal_path") { resolvedPaths.push(args); return { kind: "image", path: args.path }; }
    if (command === "clipboard_write_image") { imageClipboard.push(args.dataUrl); return; }
    if (command === "search_files") return ["src/ChatView.tsx"];
    return null;
  },
  onEvent: (name, listener) => {
    if (name === "chat:changed") listeners.add(listener);
    return () => listeners.delete(listener);
  },
  showOpenDialog: async () => filesToSelect,
};

function Harness() {
  const [state, setState] = useState({ agentStatus: "waiting", provider: "codex", question: null, questionToken: 1, sessionId: "fixture-session" });
  window.questionFixture = {
    writes,
    answers,
    clipboard,
    imageClipboard,
    imageReads,
    openedPaths,
    resolvedPaths,
    chatReads,
    emit: payload => listeners.forEach(listener => listener(payload)),
    holdReads: () => { holdChatReads = true; },
    releaseReads: () => { holdChatReads = false; heldChatReads.splice(0).forEach(resolve => resolve(chat)); },
    patch: patch => {
      if (patch.state) setState(current => ({ ...current, ...patch.state }));
      if ("failWrites" in patch) failWrites = patch.failWrites;
      if ("failClipboard" in patch) failClipboard = patch.failClipboard;
      if ("filesToSelect" in patch) filesToSelect = patch.filesToSelect;
      if ("terminalScreen" in patch) terminalScreen = patch.terminalScreen;
      if ("changeScreenOnWrite" in patch) changeScreenOnWrite = patch.changeScreenOnWrite;
      if ("imagesBySequence" in patch) imagesBySequence = patch.imagesBySequence;
      if ("olderChat" in patch) olderChat = patch.olderChat;
      if ("previewDataUrl" in patch) previewDataUrl = patch.previewDataUrl;
      if (patch.chat) {
        chat = patch.chat;
        pendingReads.splice(0).forEach(resolve => resolve(chat));
        listeners.forEach(listener => listener({}));
      }
    },
  };
  return <ChatView {...state} agentId="fixture" active theme="soft"
    readTerminalScreen={readTerminalScreen}
    onOpenPath={path => openedPaths.push(path)}
    onOpenTerminal={() => { window.questionTerminalOpened = true; }} />;
}
createRoot(document.getElementById("root")).render(<Harness />);
