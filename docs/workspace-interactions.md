---
type: Product Behavior
title: Workspace interactions
description: "Durable navigation, session, pane, terminal, document, source-control, and notification behavior."
tags:
  - ux
  - workspace
  - sessions
status: stable
stale_after: 2026-11-30
sources:
  - id: app-shell
    resource: ../app/src/App.tsx
    title: "Workspace shell and actions"
  - id: session-lifecycle-actions
    resource: ../app/src/hooks/useSessionLifecycleActions.ts
    title: "Session deletion and runtime lifecycle actions"
  - id: workspace-focus
    resource: ../app/src/lib/workspaceFocus.ts
    title: "Active terminal focus recovery"
  - id: sidebar
    resource: ../app/src/components/Sidebar.tsx
    title: "Project and session sidebar"
  - id: pane-slot
    resource: ../app/src/components/PaneSlot.tsx
    title: "Pane and tab host"
  - id: terminal-area
    resource: ../app/src/components/TerminalArea.tsx
    title: "Terminal and chat surface"
  - id: chat-view
    resource: ../app/src/components/ChatView.tsx
    title: "Persistent chat history and artifacts"
  - id: file-tree
    resource: ../app/src/components/FileTreePanel.tsx
    title: "File tree panel"
  - id: git-discovery
    resource: ../app/electron/services/git-submodules.mjs
    title: "Child Git repository discovery"
  - id: document-viewer
    resource: ../app/src/components/DocViewer.tsx
    title: "Document viewer"
  - id: agent-settings
    resource: ../app/src/components/AgentsSettings.tsx
    title: "Per-tool settings tabs"
  - id: agent-defaults
    resource: ../app/src/lib/agentDefaults.ts
    title: "New session launch defaults"
  - id: settings
    resource: ../app/src/components/SettingsModal.tsx
    title: "Settings surface"
  - id: app-language
    resource: ../app/src/lib/appLanguage.tsx
    title: "Application language preference"
  - id: session-storage-ui
    resource: ../app/src/components/SessionStorageList.tsx
    title: "Session JSONL storage catalog UI"
  - id: session-storage-service
    resource: ../app/electron/services/session-service.mjs
    title: "Session JSONL metadata catalog"
  - id: conversation-store
    resource: ../app/electron/services/conversation-store.mjs
    title: "Per-session conversation store"
---

# Workspace interactions

## Navigation and visibility

The left sidebar organizes project folders, projects, configured sessions, and
Screens. Search, active-only filtering, and folder/project collapse change what
is visible; they do not delete or activate sessions.[^sidebar]

A fixed Browser Hub entry sits above the project tree and reports the global
browser count. Opening it preserves the active Screen layout but replaces the
center surface with tabs for every application-owned browser, including parked
background tabs. Selecting a session or Screen, or opening a project document
or Git history, returns the center surface to the preserved session layout.
Browser creation and closure in the Hub update every workspace window through
the main-process browser catalog.[^app-shell][^sidebar]

Removing a session from the sidebar deactivates its live PTY. Permanent session
deletion is a separate confirmed action from the session context menu. Project
creation can create an initial session using the tool and dangerous-mode choice
made in the creation flow.[^app-shell]

After a full restart, saved Screen layouts appear without starting processes.
Only previously activated or already-standby sessions have a steady blue dot;
never-started and explicitly deactivated sessions remain gray/inactive.
Standby eligibility is persisted separately from the allocation guard, so an
unclicked standby session stays blue through repeated restarts. Explicit
deactivation clears that eligibility. Selecting a session, tab, or pane
starts only that session; merely displaying other panes in a split does not
start their processes. Standby entries stay visible under the active-only
sidebar filter. Returning from the tray reconnects sessions confirmed live by
the host and keeps the others dormant.[^app-shell][^pane-slot][^sidebar]

New Codex sessions default both the documentation/Markdown worker and the HTML
worker to Codex Luna with max reasoning. The creation dialog keeps these
choices editable, including explicitly disabling both workers; launch-only
worker settings take effect when the PTY starts.[^app-shell]

Permanent deletion uses an in-app confirmation modal instead of blocking
`window.confirm()`, keeping form interaction within the renderer. MultiAgent
first commits removal of context-menu and drag backdrops. Whether confirmation
is cancelled or deletion finishes, transient interaction state is cleared again
and the surviving active terminal is focused after its pane mounts, unless a
modal or form control has taken focus. Confirmation rechecks session ownership
and guards against duplicate deletion requests. Layout
state and imperative refs advance together so deletion cannot leave keyboard or
pointer input bound to the removed session.[^session-lifecycle-actions][^workspace-focus]

## Screens, tabs, and splits

The center workspace uses one layout tree for terminal, document, and Git
history tabs. Dragging can reorder tabs, move a tab to another pane, or create a
split. Moving an agent removes its previous layout placement; the same terminal
cannot be rendered in two panes simultaneously.[^pane-slot]

Separate browser tabs can be active in separate split panes at the same time.
Each pane owns the visibility and bounds of its native browser view, so selecting
or navigating one pane does not blank the browser beside it.[^pane-slot]

Closing a terminal tab changes layout ownership but does not mean “delete this
session.” Process activation/deactivation and tab placement remain separate
operations.

## Terminal and chat

The Terminal settings panel controls font, size, line height, cursor, scrollback,
selection copying and right-click pasting for local and SSH terminal views.
Preferences retain the legacy font-size value, share the Ctrl+wheel setting,
update existing views across windows and apply to new terminals. Lower scrollback
limits can trim screen history without deleting stored conversations. See the
[settings roadmap](settings-expansion-roadmap.md) for defaults, scope and validation.

All agents, including [Antigravity CLI](gemini-cli.md), have a terminal view. Codex and Claude additionally have a
transcript-backed chat view; other tools remain terminal-only. Sending to an
inactive chat-capable session first activates it and then waits for startup
readiness before delivery.[^terminal-area]

Chat history is loaded from a durable SQLite index keyed by MultiAgent agent,
provider, and provider session ID. Recent blocks appear first, older blocks are
paged on demand, and local composer text is recorded before PTY delivery then
confirmed against the provider transcript without duplication. Referenced local
files appear as session artifacts that can be opened from the chat view. The
rendered thread keeps tool calls in transcript order, groups only adjacent tool
work, labels assistant output by provider, and exposes a jump-to-latest control
when the operator reads above newly arriving output.[^chat-view][^conversation-store]

Runtime state and work state are distinct. Starting/recovering describes the
process lifecycle; working/waiting/blocked/done comes from hooks. A completion
highlight clears when the user opens the session or submits new work.

## Session transcript storage

MultiAgent keeps a metadata-only catalog of local Codex and Claude JSONL
transcripts under Electron user data. Project ownership is derived from each
transcript's `cwd` and session ID instead of the provider's date-based folder
layout. Multiple files with one session ID, including Claude child-agent
records, are grouped into one session total.[^session-storage-service]

Project properties separate overview, current sessions, commands/startup and history
management. History distinguishes currently linked records from past conversations
and supports name/ID/path/tool filtering. Session properties separate basic identity,
launch options and conversation history. Options remain a local draft until explicitly
saved. Both property dialogs use a responsive 1120px layout with fixed actions and
wrapping paths. See [property dialogs](properties-and-usage.md). The history tab exposes the
current record's aggregate size, file count, last modification time, and primary
path. Each panel scrolls independently while dialog actions remain available.
Remote session storage is not scanned.[^session-storage-ui]

Deletion requires confirmation and moves the matched JSONL files to the OS
Recycle Bin. MultiAgent refuses deletion while the associated session has a
live terminal, then removes the deleted paths from its catalog after a
successful move.[^session-storage-ui][^session-storage-service]

## Files, Git, and documents

The right sidebar selects the project root or a discovered child Git repository,
filters the file tree, opens the native Explorer location, and exposes Git
changes/history. Filtered folders with no matching descendants are omitted.[^file-tree]

The repository selector also works when the project root itself is not a Git
repository. Discovery includes nested `.git` directories and worktree `.git`
files, while retaining declared submodules (uninitialized ones stay disabled).
The scan skips common dependency, build and Unreal generated folders, does not
traverse directory symlinks, and is limited to 10,000 directories and 200 entries.
Selecting a child scopes both files and Source Control to that repository; the
selection is remembered per project.[^file-tree][^git-discovery]

Markdown renders in the React document viewer, images use the image viewer, and
HTML opens in the isolated embedded browser. Document and Git tabs participate
in the same Screen layout without becoming agents.[^document-viewer]

## Settings and notifications

Settings covers the entire workspace below the window title bar with an opaque
screen. The left navigation contains search and **Back to app**; the selected
category occupies the main content area. There is no centered popup, outer
click-to-dismiss area, or Done button. **Back to app** and Escape restore the
workspace. Covered sessions remain mounted and keep running; their controls are
inert and workspace keyboard shortcuts are suspended. Native browser views stay
occluded until settings (and any nested guide) closes. The SSH guide handles
Escape independently so it does not also dismiss settings.[^settings][^app-shell]

Application display language has its own **Language** navigation tab next to
General. System default, Korean, English, Simplified Chinese, Traditional Chinese
(Taiwan), Japanese, and Spanish apply immediately and persist on this PC.
General contains theme, notification sound, and Desktop Pet settings.

Agents settings has General, Codex, Claude, Antigravity CLI, Qwen, and Cline tabs with keyboard
arrow/Home/End navigation. General owns the usage-bar toggle and installation
status overview. Each tool owns its enabled toggle; Codex contains account
management, Claude contains independent local account management, Qwen contains
region selection, and Cline describes its existing CLI login environment.
Codex and Claude can run different accounts in separate sessions simultaneously;
see [Claude account profiles](claude-accounts.md).

New-session defaults are stored in `multiagent.agentDefaults.v1`. Codex supports
a default local account, Dangerous mode, Alt-screen, and document/HTML workers;
Claude supports a default local account and Dangerous mode; Qwen supports
Dangerous mode. New Session and New Project creation
load these defaults and allow overrides. Explicitly disabled workers remain off
after reload. Existing sessions retain their own accounts and options. Local
Codex and Claude accounts are not applied to SSH sessions. Failed preference writes are
shown as errors rather than reported as saved.

Settings govern available tools, hooks, shortcuts, Remote, SSH, appearance,
session defaults, and the conversation-store directory. Moving that directory
uses a verified database migration; resetting returns to the application-data
default. Launch-only settings apply on the next PTY start rather than mutating
an existing process.[^settings][^conversation-store]

The Language page stores the preference in `multiagent.appLanguage.v1` and updates
the document language. System default uses the first supported OS/browser language;
Chinese Hant/Taiwan/Hong Kong/Macau resolves to `zh-TW`, while Hans and other Chinese
locales resolve to `zh-CN`. An explicit script takes priority over the region.
Unsupported languages fall back to English; isolated previews retain Korean.
The catalogs in `app/src/lib/locales/` translate settings navigation, account
management, session/project creation, and common workspace controls. Some legacy
technical help, dynamic messages, and backend errors still use English fallback.
User-entered account/project names and terminal output are not translated.
Electron smoke coverage exercises all four added languages, account-name
preservation, preference persistence across remounts, and switching back to Korean.
[^settings][^app-language]

Completion attention is visual and can also drive desktop/Remote notifications.
Notification state must never be treated as authoritative work completion; hook
state remains the source for activity.

The domain invariants behind these interactions are documented in
[System architecture](system-architecture.md).

[^app-shell]: Workspace shell and actions
[^session-lifecycle-actions]: Session deletion and runtime lifecycle actions
[^workspace-focus]: Active terminal focus recovery
[^sidebar]: Project and session sidebar
[^pane-slot]: Pane and tab host
[^terminal-area]: Terminal and chat surface
[^chat-view]: Persistent chat history and artifacts
[^file-tree]: File tree panel
[^git-discovery]: Child Git repository discovery
[^document-viewer]: Document viewer
[^settings]: Settings surface
[^app-language]: Application language preference
[^session-storage-ui]: Session JSONL storage catalog UI
[^session-storage-service]: Session JSONL metadata catalog
[^conversation-store]: Per-session conversation store
