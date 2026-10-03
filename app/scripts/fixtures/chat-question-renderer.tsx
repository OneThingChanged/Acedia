import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatView } from "../../src/components/ChatView";
import "../../src/App.css";

let chat = null;
const pendingReads = [];
const listeners = new Set();
const writes = [];
const answers = [];
let failWrites = false;
window.multiAgentElectron = {
  invoke: async (command, args) => {
    if (command === "chat_blocks") return chat ?? new Promise(resolve => pendingReads.push(resolve));
    if (command === "write_pty") {
      writes.push(args.data);
      if (failWrites) throw new Error("fixture PTY write failure");
    }
    if (command === 'answer_question') { answers.push(args); if (failWrites) throw new Error('fixture answer failure'); return { status: 'sent' }; }
    return null;
  },
  onEvent: (name, listener) => {
    if (name === "chat:changed") listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function Harness() {
  const [state, setState] = useState({ agentStatus: "waiting", provider: "codex", question: null, questionToken: 1 });
  window.questionFixture = {
    writes,
    answers,
    patch: patch => {
      if (patch.state) setState(current => ({ ...current, ...patch.state }));
      if ("failWrites" in patch) failWrites = patch.failWrites;
      if (patch.chat) {
        chat = patch.chat;
        pendingReads.splice(0).forEach(resolve => resolve(chat));
        listeners.forEach(listener => listener({}));
      }
    },
  };
  return <ChatView {...state} agentId="fixture" sessionId="fixture-session" active theme="soft"
    onOpenTerminal={() => { window.questionTerminalOpened = true; }} />;
}
createRoot(document.getElementById("root")).render(<Harness />);
