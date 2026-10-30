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
    name: 'acedia_task_plan',
    description: 'When the user chooses Acedia task delegation, act as A: plan, assign, monitor and review; independent Codex sessions perform research, edits and checks. Submit one plan with scoped tasks, dependencies and acceptance criteria. Host selects configured task models and launches dedicated background sessions without changing focus. The host automatically confirms native Folder access / Trust and continue within the registered local project; other approvals remain explicit. Do not perform worker edits yourself. After planning use acedia_task_wait/get, review submitted results, retry failed tasks at most once, then finish with a final summary only after all required tasks passed. For a small request use a single worker. Worker sessions must not delegate again. Existing user sessions are never assigned.',
    inputSchema: { type: 'object', properties: {
      requestKey: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,128}$' }, title: { type: 'string', maxLength: 200 }, request: { type: 'string', maxLength: 6000 }, concurrency: { type: 'integer', minimum: 1, maximum: 4, default: 2 },
      tasks: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'object', properties: {
        id: { type: 'string' }, title: { type: 'string' }, role: { type: 'string' }, goal: { type: 'string' }, acceptance: { type: 'string' },
        dependsOn: { type: 'array', items: { type: 'string' } }, writeScopes: { type: 'array', items: { type: 'string' }, description: 'Exact relative files or directories; empty for read-only work. Host serializes overlapping scopes; this is not a CLI sandbox.' }, required: { type: 'boolean', default: true },
        assessment: { type: 'object', properties: { complexity: { enum: ['low', 'normal', 'high'] }, risk: { enum: ['low', 'normal', 'high'] }, context: { enum: ['small', 'normal', 'large'] }, tools: { type: 'boolean' } }, additionalProperties: false },
        modelOverride: { type: 'object', properties: { model: { type: 'string' }, effort: { type: 'string' }, serviceTier: { enum: ['default', 'fast'] } }, required: ['model'], additionalProperties: false },
      }, required: ['id', 'title', 'goal', 'acceptance', 'dependsOn', 'writeScopes'], additionalProperties: false } },
    }, required: ['requestKey', 'title', 'request', 'tasks'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  ...['list', 'get', 'wait'].map(action => ({
    name: `acedia_task_${action}`,
    description: action === 'wait' ? 'Wait up to 10 seconds without typing into A or a worker. Pass the last revision; returns durable results/questions or times out. Inspect and review submitted results, keep waiting only while tasks are active. This never replays deliveries.' : action === 'get' ? 'Read a run, dependencies, current attempts, exact conversationId/turnId, requested and observed models, questions, results and validation. Old turn completion is never task completion.' : 'List runs visible to this A or worker session. Pages contain 20 summaries; get details separately.',
    inputSchema: { type: 'object', properties: action === 'list' ? { offset: { type: 'integer', minimum: 0 } } : { runId: { type: 'string' }, revision: { type: 'integer', minimum: 0 }, ...(action === 'wait' ? { waitMs: { type: 'integer', minimum: 0, maximum: 10000, default: 10000 } } : {}) }, required: action === 'list' ? [] : action === 'wait' ? ['runId', 'revision'] : ['runId'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  })),
  {
    name: 'acedia_task_result',
    description: 'Submit the assigned worker result for its exact run/task/attempt/conversation/turn. Read acedia_task_get first. Include actual validation evidence; host checks delivery start and observed runtime model, then A reviews it. A cannot submit a worker result. This is a result submission, not task completion.',
    inputSchema: { type: 'object', properties: { runId: { type: 'string' }, taskId: { type: 'string' }, attemptId: { type: 'string' }, conversationId: { type: 'string' }, turnId: { type: 'string' }, result: { type: 'object', properties: { summary: { type: 'string' }, changedFiles: { type: 'array', items: { type: 'string' } }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, output: { type: 'string' } }, required: ['command', 'passed', 'output'], additionalProperties: false } }, artifacts: { type: 'array', items: { type: 'string' } }, issues: { type: 'string' } }, required: ['summary', 'changedFiles', 'checks'], additionalProperties: false } }, required: ['runId', 'taskId', 'attemptId', 'conversationId', 'turnId', 'result'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'acedia_task_control',
    description: 'A controls its own run: review a submitted attempt with accept/note; retry failed work once with optional next model; pause/resume new assignments; cancel and verify worker stops; reconcile uncertain state without resending; finish with summary after every required task is validated. For questions/approvals use the user UI; do not approve on the user behalf. Pausing does not interrupt an active CLI.',
    inputSchema: { type: 'object', properties: { action: { enum: ['review', 'retry', 'pause', 'resume', 'cancel', 'reconcile', 'finish'] }, runId: { type: 'string' }, taskId: { type: 'string' }, attemptId: { type: 'string' }, accept: { type: 'boolean' }, note: { type: 'string' }, summary: { type: 'string' }, modelOverride: { type: 'object', properties: { model: { type: 'string' }, effort: { type: 'string' }, serviceTier: { enum: ['default', 'fast'] } }, required: ['model'], additionalProperties: false } }, required: ['action', 'runId'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'acedia_projects',
    description: 'List registered Acedia projects, sessions, active status, current conversationId/state/reason and available AI tools on this host PC. Start an OFFLINE session with acedia_session_start in the background, then refresh this list for its current conversationId/state before acedia_session_send.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'acedia_sessions_organize',
    description: 'Rename existing local Acedia sessions and assign, change or remove their organization-chart parents in one durable transaction (up to 20 changes). First read acedia_projects. For a rename pass name and the exact expectedName; for parenting pass parentSessionId and the exact expectedParentSessionId (null means no parent). Parents must be in the same project; cycles are rejected. Works for active and OFFLINE sessions. Preserves conversations, effective working folders, model/effort/Fast, accounts, Dangerous and instructions; changed parent links do not enable new inheritance. Does not start, stop, select sessions or activate windows. Read back after a timeout before retrying.',
    inputSchema: { type: 'object', properties: { changes: { type: 'array', minItems: 1, maxItems: 20, items: {
      type: 'object', properties: { sessionId: { type: 'string' }, name: { type: 'string', minLength: 1, maxLength: 120 }, expectedName: { type: 'string', maxLength: 120 }, parentSessionId: { type: ['string', 'null'] }, expectedParentSessionId: { type: ['string', 'null'] } },
      required: ['sessionId'], additionalProperties: false,
    } } }, required: ['changes'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'acedia_session_stop',
    description: 'Stop a user-authorized existing local Acedia session in the background, interrupting its running CLI if active. Preserves its registration, conversation, model/effort/Fast, accounts, Dangerous, parent links, panes and input drafts. Saves standby state so it does not auto-restart; use acedia_session_start to resume later or acedia_sessions_relocate to change its folder while stopped. Already stopped targets remain stopped. Cannot stop the calling session, another window owner or a session reserved by task orchestration. Does not activate a window. active=false is returned only after process exit and durable standby storage are verified.',
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string', minLength: 1, maxLength: 128 } }, required: ['sessionId'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'acedia_sessions_relocate',
    description: 'Update existing local Acedia session project membership and working folders while the app stays open. First read acedia_projects for exact IDs, projectId and folder. Targets must be inactive; never stops or starts them. Use moves for up to 20 sessions in one saved registry transaction. Each target folder must already exist on this host. Does not move physical files. Move linked parents/children to the same project together; include children inheriting a changed folder. Preserves conversation IDs and stored model, effort, account and Dangerous settings, panes and focus. After a timeout read back before retrying.',
    inputSchema: { type: 'object', properties: { moves: { type: 'array', minItems: 1, maxItems: 20, items: {
      type: 'object', properties: { sessionId: { type: 'string' }, projectId: { type: 'string' }, folder: { type: 'string' }, expectedProjectId: { type: 'string' }, expectedFolder: { type: 'string' } },
      required: ['sessionId', 'projectId', 'folder', 'expectedProjectId', 'expectedFolder'], additionalProperties: false,
    } } }, required: ['moves'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'acedia_session_settings',
    description: 'Read or save Dangerous mode for an existing local Acedia session, including OFFLINE sessions. Pass sessionId alone to read. To change a user-authorized permission setting, include dangerous and the previously read expectedDangerous boolean. Saves durably without starting/restarting a session, selecting a pane or changing focus. Applies on the next session start; active=true does NOT mean the running CLI permission policy changed. Do not enable Dangerous mode merely to bypass a question or approval. After a timeout read again before retrying.',
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string', minLength: 1, maxLength: 256 }, dangerous: { type: 'boolean' }, expectedDangerous: { type: 'boolean' } }, required: ['sessionId'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'acedia_project_create',
    description: 'Register an existing absolute local folder as an Acedia project and create its first AI session (Codex by default). Reuses an already registered folder without adding a session. Saves through the desktop coordinator using the same per-tool Dangerous default as the creation UI: ON when unconfigured, preserving explicit ON/OFF/remember, OFF for unsupported tools. Existing sessions and running CLIs are unchanged. For API-created local Codex sessions, the host automatically confirms native Folder access / Trust and continue within the registered project, without window activation or separate project opt-in. Other approvals remain explicit. Check active and startError in the result; creation does not guarantee a CLI is ready. Does not create directories or submit a prompt.',
    inputSchema: { type: 'object', properties: { folder: { type: 'string' }, name: { type: 'string', maxLength: 120 }, aiToolId: { type: 'string', default: 'codex' }, start: { type: 'boolean', default: true, description: 'false durably registers the first session in standby without starting its CLI.' } }, required: ['folder'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'acedia_session_create',
    description: 'Create an additional AI session in a registered local Acedia project without selecting a pane or activating a window. Uses the same per-tool Dangerous default as the creation UI: ON when unconfigured, preserving explicit ON/OFF/remember, OFF for unsupported tools. Does not copy parent permissions or alter existing sessions/running CLIs. Optional parentSessionId sets any same-project parent; null creates an independent session; omitted defaults to the same-project caller. Optional folder selects an existing absolute local working folder instead of inheriting the parent folder. start=false registers durably in standby without starting the CLI (default true). Use a new requestKey per intended session and reuse it with identical options when retrying in this running app. Codex is the default. API-created local Codex sessions auto-confirm native Folder access / Trust and continue only within the registered project; other approvals remain explicit. Check active and startError; does not submit a prompt.',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, name: { type: 'string', maxLength: 120 }, aiToolId: { type: 'string', default: 'codex' }, requestKey: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,128}$' }, parentSessionId: { type: ['string', 'null'], description: 'Same-project parent; null removes implicit caller parenting.' }, folder: { type: 'string', description: 'Existing absolute local working folder.' }, start: { type: 'boolean', default: true } }, required: ['projectId', 'requestKey'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'acedia_session_start',
    description: 'Start a user-authorized existing inactive local Acedia AI session in the BACKGROUND without showing, focusing or restoring the Acedia window, selecting a pane or changing the input draft. First read acedia_projects for its exact sessionId. Supports Codex, Claude, Qwen and Antigravity in the coordinator window. API-created local Codex sessions retain automatic Folder access / Trust and continue confirmation within their registered project or explicit dedicated working folder; other approvals remain explicit. An already-running session is left running; never restarts it. Does not create a session or send a prompt. active=true confirms a live terminal, not CLI readiness or task acceptance. Read acedia_projects again for its current conversationId/state before acedia_session_send. On timeout read status before retrying.',
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string', minLength: 1, maxLength: 256 } }, required: ['sessionId'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'acedia_session_message_send',
    description: 'Send a user-authorized UTF-8 message to another Acedia session without typing its body into the terminal. Pass exactly one of message (Unicode text), messageBase64 (Base64 of UTF-8 bytes), or messageFile (existing absolute UTF-8 file on this host, up to 64 KiB). Saves the original body and SHA-256 in a durable inbox. By default notifies an active local Codex with an ASCII reference instructing it to call acedia_session_message_receive; captures its current conversationId automatically. A pristine new local launch can receive its first notification before a conversationId exists; the host verifies the empty native composer and binds the new ID only from that exact notification and started turn. Resumed sessions and existing input still require their current conversation. Optional expectedConversationId pins that identity. notify=false stores for any registered provider or OFFLINE session without starting/typing anything. Same requestKey never notifies twice, including after app restart. saved means stored, delivery.started means notification task started, and readAt means the receiver actually fetched the body; none means work completed. To reply, target the original sender and set replyTo to the received messageId. After uncertain delivery inspect the same key/outbox; do not use a new key blindly.',
    inputSchema: { type: 'object', properties: {
      sessionId: { type: 'string' }, requestKey: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,128}$' }, message: { type: 'string' }, messageBase64: { type: 'string' }, messageFile: { type: 'string' }, expectedSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, expectedConversationId: { type: 'string' }, notify: { type: 'boolean', default: true }, replyTo: { type: 'string' }, waitMs: { type: 'integer', minimum: 0, maximum: 10000, default: 8000 },
    }, required: ['sessionId', 'requestKey'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'acedia_session_message_receive',
    description: 'Fetch original UTF-8 messages for THIS calling Acedia session, with sender IDs, SHA-256, byte count and read receipt. Use messageId from a notification to read that exact message, even if already read. With no ID, reads up to 10 unread inbox messages in sequence (max 128 KiB per response), marking them read durably. markRead=false previews without a read receipt. direction=outbox reads your sent messages and their notification/read status; unreadOnly=false includes previously read inbox messages. after/nextAfter and hasMore paginate; keep the cursor only after processing the returned messages. includeBase64=true also returns UTF-8 Base64 for encoding diagnostics. No terminal input, session start or window activation. Does not acknowledge task completion.',
    inputSchema: { type: 'object', properties: { messageId: { type: 'string' }, direction: { type: 'string', enum: ['inbox', 'outbox'], default: 'inbox' }, unreadOnly: { type: 'boolean', default: true }, markRead: { type: 'boolean', default: true }, includeBase64: { type: 'boolean', default: false }, after: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'acedia_session_send',
    description: 'Direct terminal handoff to a DIFFERENT active local Codex session. Prefer acedia_session_message_send for Unicode text and durable sender/receiver inbox access; it types only an ASCII reference. For this direct route, first read acedia_projects and pin the exact session id and current conversationId. Rejects busy sessions, drafts and questions. Use a new requestKey per intended task and reuse it for retries: the same key never sends twice, including after restart. Returns sending/sent/received/started/failed/unconfirmed with evidence timestamps. Only started confirms a new task_started for the exact delivered user message; sent is NOT task acceptance. On unconfirmed, inspect acedia_session_delivery and the receiving session; do not resend with another key or press Enter blindly. Do not delegate without user authorization.',
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
  if (name.startsWith('acedia_task_')) {
    if (!baseUrl || !token || !agentId) throw new Error('Acedia workspace bridge environment is missing');
    const action = name === 'acedia_task_control' ? body.action : name.slice('acedia_task_'.length);
    if (name === 'acedia_task_control') delete body.action;
    const response = await fetch(`http://127.0.0.1:${port}/integration/v1/workspace/tasks`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-acedia-agent-id': agentId, 'content-type': 'application/json' },
      body: JSON.stringify({ action, body }), signal: AbortSignal.timeout(60_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Acedia task request failed (${response.status})`);
    return result;
  }
  if (['acedia_projects', 'acedia_project_create', 'acedia_session_create', 'acedia_session_settings', 'acedia_session_start', 'acedia_session_stop', 'acedia_sessions_organize', 'acedia_sessions_relocate', 'acedia_session_send', 'acedia_session_delivery', 'acedia_session_message_send', 'acedia_session_message_receive'].includes(name)) {
    if (!baseUrl || !token || !agentId) throw new Error('Acedia workspace bridge environment is missing');
    const method = name === 'acedia_projects' ? 'GET' : 'POST';
    const endpoint = name === 'acedia_session_message_send' ? 'messages/send' : name === 'acedia_session_message_receive' ? 'messages/receive' : name === 'acedia_sessions_organize' ? 'organize-sessions' : name === 'acedia_session_stop' ? 'stop' : name === 'acedia_sessions_relocate' ? 'relocate-sessions' : name === 'acedia_session_start' ? 'start' : name === 'acedia_session_settings' ? 'session-settings' : name === 'acedia_session_create' ? 'sessions' : name === 'acedia_session_send' ? 'send' : name === 'acedia_session_delivery' ? 'delivery' : 'projects';
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
