// Reuse the isolated workspace fixture; intercept only model transactions.
import "./sidebar-workspace-renderer";

const storeKey = "multiagent.agents.v1";
const agents = JSON.parse(localStorage.getItem(storeKey));
for (const agent of agents) {
  if (agent.id === "routing") agent.modelSettings = { model: "fixture-sol", effort: "high" };
  if (agent.id === "ux") {
    agent.lastSessionId = "same-codex-conversation";
    agent.codexAccountId = "default";
    agent.sessionHierarchy = { parentId: "routing", inheritModel: true };
  }
}
localStorage.setItem(storeKey, JSON.stringify(agents));
const bridge = window.multiAgentElectron;
const originalInvoke = bridge.invoke, originalListen = bridge.onEvent;
const callbacks = new Map();
const pending = new Map();
let current = { model: "fixture-sol", effort: "high" }, counter = 0;
bridge.onEvent = (name, listener) => {
  const nodes = callbacks.get(name) || new Set(); nodes.add(listener); callbacks.set(name, nodes);
  const remove = originalListen(name, listener);
  return () => { nodes.delete(listener); remove(); };
};
bridge.invoke = async (command, args) => {
  if (command === "resolve_cli_session") return args.preferredSessionId || "same-codex-conversation";
  if (command === "spawn_pty") {
    const result = await originalInvoke(command, args);
    setTimeout(() => callbacks.get("agent:hook-event")?.forEach(callback => callback({
      id: args.id, event: "session-start", session_id: "same-codex-conversation", received_at: Date.now(),
    })), 20);
    return result;
  }
  if (command === "get_session_model") return {
    models: ["fixture-sol", "fixture-astra"].map(model => ({ model, label: model === "fixture-sol" ? "GPT-6 Sol" : "GPT-6 Astra",
      efforts: ["high", "xhigh", "ultra"].map(effort => ({ effort, description: "" })), defaultEffort: "high", isDefault: false })),
    accountLabel: "검사용 계정", capabilitiesSource: "account", current, currentSource: "launch", saved: null, canRestart: true, canEdit: true,
  };
  if (command === "set_session_model") {
    const requestId = `chat-model-${++counter}`;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { ...args, resolve, reject });
      callbacks.get("remote:session-model")?.forEach(callback => callback({ ...args, requestId }));
    });
  }
  if (command === "restart_session_model") {
    window.layoutCalls.push({ command, args });
    return { sessionId: "same-codex-conversation" };
  }
  if (command === "complete_remote_session_model") {
    const request = pending.get(args.requestId);
    if (!request) return false;
    pending.delete(args.requestId);
    if (args.ok) { current = request.settings; request.resolve({ id: args.id, restarted: args.restarted }); }
    else request.reject(Error(args.error));
    return true;
  }
  if (command === "chat_blocks") return { tool: "codex", blocks: [], artifacts: [], hasOlder: false, lifecycle: "idle", lifecycleAt: Date.now() };
  return originalInvoke(command, args);
};
