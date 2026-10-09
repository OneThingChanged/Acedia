---
name: acedia-browser
description: Show and connect Acedia's embedded browser beside the current conversation. Use when the user asks to open a browser on the right, display a page beside chat, connect an existing Acedia tab, or says 우측에 브라우저 띄워줘, 오른쪽 브라우저, 브라우저 연결해줘. Does not select external Chrome or Edge when those are explicitly requested.
---

# Acedia browser beside chat

Research and browser automation run in background tabs. Show a page in the
workspace only when the user explicitly asks to see it beside chat or in a tab.
“Use the browser”, “research this” or “open this URL” alone does not request a
visible pane. Use the Acedia browser bridge for the requested work.

1. List `browser_tabs` using the Acedia MCP tools. Reuse a tab matching the requested URL or the tab explicitly identified by the user. When no URL was specified, prefer the current session's `activeTabId`; otherwise open the configured home page. Do not choose another session's tab merely because it exists in the catalog.
2. Reuse a matching tab, or call `browser_open` with the requested HTTP(S) URL to create a background tab; omit URL for the configured home page. Keep its tab ID and perform subsequent actions without showing it. Only after an explicit display request, call `browser_show` once with that tab ID and `placement: "right"` (or `"tab"` when requested). An already separated tab keeps its placement without creating repeated splits.
3. Read `browser_snapshot` for that exact tab to confirm the page while continuing background work. If display was explicitly requested, a successful show response means the app accepted the placement request; do not claim visual layout verification based on a page snapshot alone. Report the page title and any load/sign-in error briefly.

Keep the returned tab ID for the rest of the task. Do not repeat `browser_show`
before snapshots, navigation, clicks or typing. Connection requests preserve the
user's current session and pane selection; a browser in another Screen stays there.

Use `placement: "tab"` only when the user asks for a tab in the conversation pane. Preserve the chosen browser profile; use IDs returned by `browser_tabs`, never invent them. Leave existing conversation tabs open.

## If MCP tools are unavailable in the current session

Run the bundled helper with Python 3. Resolve the script relative to this SKILL.md, not the project cwd:

```text
python <skill-directory>/scripts/browser.py tabs
python <skill-directory>/scripts/browser.py open --url https://example.com
# Only when the user explicitly asks to display the page:
python <skill-directory>/scripts/browser.py show --tab-id <returned-id> --placement right
python <skill-directory>/scripts/browser.py snapshot --tab-id <returned-id>
```

The helper uses only the local Acedia session's MULTIAGENT_PORT, MULTIAGENT_TOKEN and MULTIAGENT_AGENT_ID environment variables. Never print their values, copy tokens into commands, or change an agent ID to control a different session. If the environment is missing, report that an Acedia-launched session is needed. If `show` is unsupported, explain that the running Acedia build needs updating; do not silently open an external browser or make repeated new tabs.

Opening or connecting a browser does not authorize submitting forms, uploading files, sending messages or purchases. Use the existing browser tools within the user's task authorization.
