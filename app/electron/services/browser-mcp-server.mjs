// Minimal stdio MCP bridge for the browser owned by Acedia. It deliberately
// has no Electron dependency: the child inherits MULTIAGENT_PORT, token and
// agent id from the PTY that launched Codex/Claude, then talks only to the
// authenticated loopback integration API.

const port = String(process.env.MULTIAGENT_PORT || "").trim();
const token = String(process.env.MULTIAGENT_TOKEN || "").trim();
const agentId = String(process.env.MULTIAGENT_AGENT_ID || "").trim();
const baseUrl = port ? `http://127.0.0.1:${port}/integration/v1/browser/${encodeURIComponent(agentId)}` : "";

const targetSchema = {
  type: "object",
  description: "A semantic target from browser_snapshot. Prefer targetId; selector is a legacy fallback.",
  properties: {
    targetId: { type: "string" },
    selector: { type: "string" },
    id: { type: "string" },
    testId: { type: "string" },
    name: { type: "string" },
    label: { type: "string" },
    role: { type: "string" },
    formId: { type: "string" },
  },
  additionalProperties: false,
};

const tools = [
  {
    name: 'acedia_projects',
    description: 'List registered Acedia projects, sessions, active status, current conversationId/state/reason and available AI tools on this host PC. Use session IDs and the current conversationId for acedia_session_send.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'acedia_project_create',
    description: 'Register an existing absolute local folder as an Acedia project and create its first AI session (Codex by default). Reuses an already registered folder without adding a session. Saves through the desktop coordinator. Check active and startError in the result; creation does not guarantee a CLI is ready. Does not create directories or submit a prompt.',
    inputSchema: { type: 'object', properties: { folder: { type: 'string' }, name: { type: 'string', maxLength: 120 }, aiToolId: { type: 'string', default: 'codex' } }, required: ['folder'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'acedia_session_create',
    description: 'Create an additional AI session in a registered local Acedia project. Use a new requestKey (letters, digits, _ or -) for each intended session and reuse it when retrying the same request in this running app. Codex is the default. Check active and startError in the result. Does not submit a prompt.',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, name: { type: 'string', maxLength: 120 }, aiToolId: { type: 'string', default: 'codex' }, requestKey: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,128}$' } }, required: ['projectId', 'requestKey'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'acedia_session_send',
    description: 'Send a user-authorized task to a DIFFERENT existing active local Codex session. First read acedia_projects and use the exact session id and current conversationId. Rejects busy sessions, drafts and questions. Use a new requestKey per intended task and reuse it for retries: the same key never sends twice, including after app restart. Returns sending/sent/received/started/failed/unconfirmed with evidence timestamps. Only started confirms a new task_started for the exact delivered user message; sent is NOT task acceptance. On unconfirmed, inspect acedia_session_delivery and the receiving session; do not resend with another key or press Enter blindly. Do not delegate without user authorization.',
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, expectedConversationId: { type: 'string' }, message: { type: 'string', description: 'Task context and instructions to forward (up to 8 KiB); no terminal control characters.' }, requestKey: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,128}$' }, waitMs: { type: 'integer', minimum: 0, maximum: 10000, default: 8000 } }, required: ['sessionId', 'expectedConversationId', 'message', 'requestKey'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'acedia_session_delivery',
    description: 'Read a delivery receipt created by this calling Acedia session, using its original requestKey. Does not type, resend, activate or interrupt the receiving session. Reports explicit sent/received/started timestamps, or failure/unconfirmed reason. Optional waitMs waits up to 10 seconds for confirmation.',
    inputSchema: { type: 'object', properties: { requestKey: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,128}$' }, waitMs: { type: 'integer', minimum: 0, maximum: 10000, default: 0 } }, required: ['requestKey'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "browser_tabs",
    description: "List the tabs available to the current Acedia session.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_open",
    description: "Open an Acedia browser tab in the background for research or automation, without adding a visible tab or split pane. Reuse its tabId for subsequent actions. Uses the configured home page when URL is omitted. Only call browser_show afterward if the user explicitly asks to display the page beside chat or in a visible tab.",
    inputSchema: { type: "object", properties: { url: { type: "string" }, profileId: { type: "string", description: "Profile ID from browser_tabs. Omit to use the default profile." } }, additionalProperties: false },
  },
  {
    name: "browser_show",
    description: "Display an existing Acedia browser tab only when the user explicitly asks to see the page beside chat or in a visible tab. Research and automation use background tabs without this tool. Preserves the user's current session and pane selection. Reuses the tab without navigating or creating a duplicate; call once for the requested display, then use tabId for subsequent actions.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" }, placement: { type: "string", enum: ["right", "tab"], default: "right" } }, required: ["tabId"], additionalProperties: false },
  },
  {
    name: "browser_navigate",
    description: "Navigate a browser tab to an HTTP(S) URL.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" }, url: { type: "string" } }, required: ["url"], additionalProperties: false },
  },
  {
    name: "browser_snapshot",
    description: "Read a sanitized text/link/control snapshot of the active browser tab.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "browser_screenshot",
    description: "Capture the active browser tab and return a local image path.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "browser_click",
    description: "Click a non-password element using a CSS selector.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" }, selector: { type: "string" } }, required: ["selector"], additionalProperties: false },
  },
  {
    name: "browser_type",
    description: "Type into a non-password form control using a CSS selector.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" }, selector: { type: "string" }, text: { type: "string" } }, required: ["selector", "text"], additionalProperties: false },
  },
  {
    name: "browser_upload_files",
    description: "Select explicitly authorized local files in a unique input[type=file] using its CSS selector, including hidden inputs. Paths must be absolute on the Acedia host PC. Supports 1–20 files when the input allows multiple. Selection may immediately transmit files to the site: use only files authorized by the user for this destination. Do not click the OS file chooser first. Verify upload completion with browser_snapshot/browser_wait_for; selection is not server acceptance. Top-level document only; no directories or iframe inputs.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "string" }, selector: { type: "string", minLength: 1, maxLength: 500 }, files: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 } },
      required: ["selector", "files"], additionalProperties: false,
    },
  },
  {
    name: "browser_get_control",
    description: "Read the current sanitized state of one browser form control. Prefer a targetId from browser_snapshot.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" }, target: targetSchema, selector: { type: "string" } }, anyOf: [{ required: ["target"] }, { required: ["selector"] }], additionalProperties: false },
  },
  {
    name: "browser_form_state",
    description: "Read sanitized controls and validation state for the page or one form/fieldset scope.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" }, scopeSelector: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "browser_set_checked",
    description: "Idempotently set a checkbox, radio, or ARIA switch to the requested checked state and verify it.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" }, target: targetSchema, selector: { type: "string" }, checked: { type: "boolean" } }, required: ["checked"], anyOf: [{ required: ["target"] }, { required: ["selector"] }], additionalProperties: false },
  },
  {
    name: "browser_select_option",
    description: "Select and verify one native select or visible ARIA combobox/listbox option by label, safe value, or index.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        target: targetSchema,
        selector: { type: "string" },
        option: {
          type: "object",
          properties: { label: { type: "string" }, value: { type: "string" }, index: { type: "integer", minimum: 0 } },
          additionalProperties: false,
        },
        optionLabel: { type: "string" },
        optionValue: { type: "string" },
        optionIndex: { type: "integer", minimum: 0 },
      },
      anyOf: [{ required: ["target"] }, { required: ["selector"] }],
      additionalProperties: false,
    },
  },
  {
    name: "browser_clear",
    description: "Clear and verify a non-sensitive text input, textarea, or contenteditable control.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" }, target: targetSchema, selector: { type: "string" } }, anyOf: [{ required: ["target"] }, { required: ["selector"] }], additionalProperties: false },
  },
  {
    name: "browser_scroll_into_view",
    description: "Scroll a form control into the browser viewport and return its updated sanitized state.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" }, target: targetSchema, selector: { type: "string" } }, anyOf: [{ required: ["target"] }, { required: ["selector"] }], additionalProperties: false },
  },
  {
    name: "browser_wait_for",
    description: "Wait for a bounded control, URL, or navigation condition and return the final sanitized state.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        target: targetSchema,
        selector: { type: "string" },
        condition: { type: "string", enum: ["visible", "hidden", "enabled", "disabled", "checked", "selected", "valid", "text", "valueState", "url", "navigationComplete"] },
        expected: { oneOf: [{ type: "string" }, { type: "boolean" }] },
        timeoutMs: { type: "integer", minimum: 100, maximum: 30000 },
      },
      required: ["condition"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_back",
    description: "Navigate the active browser tab back.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "browser_forward",
    description: "Navigate the active browser tab forward.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "browser_reload",
    description: "Reload the active browser tab.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "browser_attach_annotation",
    description: "Capture the explicitly selected/hovered page element as sanitized HTML, JSON metadata and an image path.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
  },
];

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function errorResult(message) {
  return {
    isError: true,
    content: [{ type: "text", text: String(message) }],
  };
}

async function callBrowser(action, body = {}, method = "POST") {
  if (!baseUrl || !token || !agentId) {
    throw new Error("Acedia browser bridge environment is missing");
  }
  const response = await fetch(`${baseUrl}/${action}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok && !(action === "upload-files" && payload?.result)) throw new Error(payload?.error || `browser request failed (${response.status})`);
  return payload;
}

async function callTool(name, args) {
  const body = args && typeof args === "object" ? { ...args } : {};
  if (['acedia_projects', 'acedia_project_create', 'acedia_session_create', 'acedia_session_send', 'acedia_session_delivery'].includes(name)) {
    if (!baseUrl || !token || !agentId) throw new Error('Acedia workspace bridge environment is missing');
    const method = name === 'acedia_projects' ? 'GET' : 'POST';
    const endpoint = name === 'acedia_session_create' ? 'sessions' : name === 'acedia_session_send' ? 'send' : name === 'acedia_session_delivery' ? 'delivery' : 'projects';
    const response = await fetch(`http://127.0.0.1:${port}/integration/v1/workspace/${endpoint}`, {
      method, headers: { authorization: `Bearer ${token}`, 'x-acedia-agent-id': agentId, 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Acedia request failed (${response.status})`);
    return result;
  }
  switch (name) {
    case "browser_tabs": return callBrowser("status", {}, "GET");
    case "browser_open": return callBrowser("open", body);
    case "browser_show": return callBrowser("show", body);
    case "browser_navigate": return callBrowser("navigate", body);
    case "browser_snapshot": return callBrowser("snapshot", body);
    case "browser_screenshot": return callBrowser("screenshot", body);
    case "browser_click": return callBrowser("click", body);
    case "browser_type": return callBrowser("type", body);
    case "browser_upload_files": return callBrowser("upload-files", body);
    case "browser_get_control": return callBrowser("get-control", body);
    case "browser_form_state": return callBrowser("form-state", body);
    case "browser_set_checked": return callBrowser("set-checked", body);
    case "browser_select_option": return callBrowser("select-option", body);
    case "browser_clear": return callBrowser("clear", body);
    case "browser_scroll_into_view": return callBrowser("scroll-into-view", body);
    case "browser_wait_for": return callBrowser("wait-for", body);
    case "browser_back": return callBrowser("back", body);
    case "browser_forward": return callBrowser("forward", body);
    case "browser_reload": return callBrowser("reload", body);
    case "browser_attach_annotation": return callBrowser("annotate", body);
    default: throw new Error(`Unknown browser tool: ${name}`);
  }
}

async function handle(message) {
  if (!message || typeof message !== "object") return;
  const id = message.id;
  const method = message.method;
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;
  if (method === "ping") {
    if (id !== undefined) write({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (method === "initialize") {
    write({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "multiagent-browser", version: "0.1.0" },
      },
    });
    return;
  }
  if (method === "tools/list") {
    write({ jsonrpc: "2.0", id, result: { tools } });
    return;
  }
  if (method === "tools/call") {
    try {
      const result = await callTool(String(message.params?.name || ""), message.params?.arguments);
      write({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
          ...(result?.ok === false ? { isError: true } : {}),
        },
      });
    } catch (error) {
      write({ jsonrpc: "2.0", id, result: errorResult(error?.message || error) });
    }
    return;
  }
  if (id !== undefined) {
    write({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${String(method)}` } });
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } });
      continue;
    }
    void handle(message).catch((error) => {
      if (message?.id !== undefined) write({ jsonrpc: "2.0", id: message.id, result: errorResult(error?.message || error) });
    });
  }
});
process.stdin.on("end", () => process.exit(0));
