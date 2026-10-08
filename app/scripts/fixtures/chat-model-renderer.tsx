import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatView } from "../../src/components/ChatView";
import { AppLanguageProvider, useAppLanguage } from "../../src/lib/appLanguage";
import "../../src/App.css";

localStorage.setItem("multiagent.appLanguage.v1", "ko");
const model = (id, label, efforts, defaultEffort = efforts[0]) => ({ model: id, label, efforts: efforts.map(effort => ({ effort, description: `${effort} reasoning` })), defaultEffort, isDefault: false });
const catalogs = {
  codex: { models: [model("fixture-sol", "GPT-6 Sol", ["low", "medium", "high", "xhigh"], "high"),
    model("fixture-astra", "GPT-6 Astra", ["medium", "high", "xhigh", "ultra"], "medium"), model("fixture-lite", "GPT Lite", ["low", "medium"], "medium")],
    accountLabel: "분산 계정 A", capabilitiesSource: "account", current: { model: "fixture-sol", effort: "xhigh" }, saved: null, currentSource: "last-turn", canRestart: true, canEdit: true },
  claude: { models: [model("sonnet", "Sonnet", ["low", "medium", "high"], null), model("opus", "Opus", ["low", "medium", "high", "max"], null)],
    accountLabel: "Claude 개인 계정", capabilitiesSource: "cli-help", current: { model: "sonnet", effort: "medium" }, saved: null, currentSource: "last-turn", canRestart: true, canEdit: true },
};
const calls = [], writes = [], modelUpdates = [], reads = [];
const listeners = new Set();
let state = { agentId: "codex-chat", provider: "codex", agentStatus: "idle", sessionId: "original-conversation", active: true, modelEditingSupported: true };
let failRead = false, failApply = false, holdApply = false, pendingApply = null;
const transcript = {
  blocks: [{ sequence: 1, role: "user", kind: "text", text: "채팅에서도 모델과 추론 강도를 바꾸고 싶어." },
    { sequence: 2, role: "assistant", kind: "text", text: "입력창 아래에서 모델과 추론 강도를 선택할 수 있습니다. 작성한 메시지와 현재 대화는 유지됩니다." }],
  artifacts: [], hasOlder: false,
};
function completeModel(args) {
  const catalog = catalogs[state.provider];
  catalog.current = args.settings; catalog.saved = args.settings; catalog.currentSource = "launch";
  return { id: args.id, restarted: true };
}
window.multiAgentElectron = {
  invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === "get_session_model") { reads.push(args); if (failRead) throw Error("모델 목록 조회 실패"); return structuredClone(catalogs[state.provider]); }
    if (command === "set_session_model") {
      modelUpdates.push(args);
      if (failApply) throw Error("설정은 저장되었습니다. 새 CLI의 시작 hook을 확인하지 못했습니다.");
      if (holdApply) return new Promise(resolve => { pendingApply = () => resolve(completeModel(args)); });
      return completeModel(args);
    }
    if (command === "chat_blocks") return { ...transcript, tool: state.provider, lifecycle: state.agentStatus === "working" ? "working" : "idle", lifecycleAt: Date.now() };
    if (command === "write_pty") writes.push(args);
    if (command === "search_files") return [];
    return null;
  },
  onEvent: (event, callback) => { if (event === "chat:changed") listeners.add(callback); return () => listeners.delete(callback); },
};

function Harness() {
  const [props, setProps] = useState(state);
  const [show, setShow] = useState(true);
  const { setPreference } = useAppLanguage();
  window.modelFixture = {
    calls, reads, writes, modelUpdates,
    patch: change => {
      if (change.state) { state = { ...state, ...change.state }; setProps(state); }
      if ("show" in change) setShow(change.show);
      for (const provider of ["codex", "claude"]) if (change.catalog?.[provider]) Object.assign(catalogs[provider], change.catalog[provider]);
      if ("failRead" in change) failRead = change.failRead;
      if ("failApply" in change) failApply = change.failApply;
      if ("holdApply" in change) holdApply = change.holdApply;
      if (change.theme) document.getElementById("root").className = `app app-theme-${change.theme}`;
      if (change.language) setPreference(change.language);
      listeners.forEach(callback => callback({}));
    },
    complete: () => { pendingApply?.(); pendingApply = null; holdApply = false; },
  };
  return show && <ChatView {...props} theme="soft" projectName="Acedia" folder="C:/fixture/acedia" connectionLabel="이 컴퓨터" onOpenTerminal={() => {}} />;
}
createRoot(document.getElementById("root")).render(<AppLanguageProvider><Harness /></AppLanguageProvider>);
