---
name: acedia-browser
description: Show and connect Acedia's embedded browser beside the current conversation. Use when the user asks to open a browser on the right, display a page beside chat, connect an existing Acedia tab, or says 우측에 브라우저 띄워줘, 오른쪽 브라우저, 브라우저 연결해줘. Does not select external Chrome or Edge when those are explicitly requested.
---

# Acedia browser beside chat

Show the page in the current session's workspace so the user can see it while conversing. Use the Acedia browser bridge, not an unrelated external browser.

1. List `browser_tabs` using the Acedia MCP tools. Reuse a tab matching the requested URL or the tab explicitly identified by the user. When no URL was specified, prefer the current session's `activeTabId`; otherwise open the configured home page. Do not choose another session's tab merely because it exists in the catalog.
2. For an existing tab, call `browser_show` with its `tabId` and `placement: "right"`. For a new page, call `browser_open` with `placement: "right"` and the requested HTTP(S) URL, omitting URL when the user just wants a browser. Keep the returned tab ID for subsequent actions. An already separated tab remains in its existing pane rather than creating repeated splits.
3. Read `browser_snapshot` for that exact tab to confirm the page and connection. A successful show request means the app was asked to reveal the tab; do not claim visual layout verification based on a page snapshot alone. Report the page title and any load/sign-in error briefly.

Use `placement: "tab"` only when the user asks for a tab in the conversation pane. Preserve the chosen browser profile; use IDs returned by `browser_tabs`, never invent them. Leave existing conversation tabs open.

## If MCP tools are unavailable in the current session

Run the bundled helper with Python 3. Resolve the script relative to this SKILL.md, not the project cwd:

```text
python <skill-directory>/scripts/browser.py tabs
python <skill-directory>/scripts/browser.py open --url https://example.com --placement right
python <skill-directory>/scripts/browser.py show --tab-id <returned-id> --placement right
python <skill-directory>/scripts/browser.py snapshot --tab-id <returned-id>
```

The helper uses only the local Acedia session's MULTIAGENT_PORT, MULTIAGENT_TOKEN and MULTIAGENT_AGENT_ID environment variables. Never print their values, copy tokens into commands, or change an agent ID to control a different session. If the environment is missing, report that an Acedia-launched session is needed. If `show` is unsupported, explain that the running Acedia build needs updating; do not silently open an external browser or make repeated new tabs.

Opening or connecting a browser does not authorize submitting forms, uploading files, sending messages or purchases. Use the existing browser tools within the user's task authorization.
