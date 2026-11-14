---
name: acedia-workspace
description: Manage Acedia sessions, parent-child relationships, UTF-8 handoffs, authorized task delegation and Codex routing accounts through the installed application's MCP. Use when the user asks to operate Acedia sessions or assign work between them, not for ordinary coding in the current session.
---

# Operate Acedia sessions through MCP

For an unfamiliar operation, or when tools appear missing, call
`acedia_connection`. Use the running host's capabilities and your tool schemas;
these bundled instructions do not establish that an older host supports a tool.
The installation prerequisite is the Acedia application, which supplies the
MCP connection and this session's identity automatically.

Read only the reference for the requested operation:

- Find, create, start/stop, rename, reparent or relocate sessions:
  [sessions](references/sessions.md).
- Send text, reply, or reconcile saved/read/started handoffs:
  [messages](references/messages.md).
- The user asks for Acedia task delegation or a child to perform work:
  [delegation](references/delegation.md).
- Change a Codex routing account or return it to automatic assignment:
  [routing](references/routing.md).

Use `acedia_projects` for exact Acedia IDs, folders and providers. A native
conversation ID is a separate identity. Do not substitute a similar title,
create a duplicate session to repair a delivery, or rewrite live profile JSON.
MCP/API operations work without activating windows or global keyboard input.

Keep the user's task scope and approvals. Enabling Dangerous, interrupting
running work or answering another session's question is not implied by a tool
failure. Report saved state, process startup, input readiness, message receipt,
work start and completion as distinct evidence.
