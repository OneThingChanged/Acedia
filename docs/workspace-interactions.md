---
type: Product Behavior
title: Workspace interactions
description: "Durable navigation, session, pane, terminal, document, source-control, and notification behavior."
tags:
  - ux
  - workspace
  - sessions
status: stable
last_updated: 2026-10-04
stale_after: 2026-11-30
sources:
  - id: session-workers
    resource: ../app/src/lib/sessionWorkers.ts
    title: "Worker models, reasoning effort and launch instructions"
  - id: worker-role-config
    resource: ../app/electron/services/worker-role-config.mjs
    title: "Per-worker Codex configuration layers"
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
  - id: context-menus
    resource: ../app/src/components/Menus.tsx
    title: "Workspace context menus"
  - id: terminal-area
    resource: ../app/src/components/TerminalArea.tsx
    title: "Terminal and chat surface"
  - id: terminal-links
    resource: ../app/src/lib/terminal.ts
    title: "Terminal path matching and pointer ranges"
  - id: terminal-links-smoke
    resource: ../app/scripts/electron-terminal-links-smoke.mjs
    title: "Native terminal link pointer verification"
  - id: terminal-path-service
    resource: ../app/electron/services/terminal-path-service.mjs
    title: "Local filesystem and file URL resolution"
  - id: chat-view
    resource: ../app/src/components/ChatView.tsx
    title: "Persistent chat history and artifacts"
  - id: file-tree
    resource: ../app/src/components/FileTreePanel.tsx
    title: "File tree panel"
  - id: git-discovery
    resource: ../app/electron/services/git-submodules.mjs
    title: "Child Git repository discovery"
  - id: git-runtime
    resource: ../app/electron/services/git-runtime.mjs
    title: "Installed and bundled Git executable selection"
  - id: git-command
    resource: ../app/electron/services/git-command.mjs
    title: "Scoped Git commands and typed failures"
  - id: git-bundle
    resource: ../app/scripts/bundle-git-runtime.mjs
    title: "Pinned Windows MinGit packaging"
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
Screens. The session filters below search offer **All / Active / Sleeping**, with
counts of all configured sessions in each category. Active includes running,
starting, recovering, working, and question/permission-waiting sessions.
Sleeping means the steady blue, deferred session that can start or resume when
selected; it has no active process. Never-started, explicitly deactivated,
exited, and unreachable entries remain available in All.[^sidebar]

Search by project, folder, session, or path stays within the chosen status.
Projects, virtual folders, and machines with no matching sessions are hidden
under Active or Sleeping. An empty result offers a reset to All and clears the
search. The selected status survives reopening the app; the previous active-only
preference migrates to Active. Screen shortcuts remain available above the
project tree. Filtering and folder/project collapse change visibility without
deleting or activating sessions.[^sidebar]

The shared Dashboard/Remote sidebar uses these same All/Active/Sleeping categories,
with global counts and a browser-local saved selection. Search stays within the
category; empty results can reset to All. See [Remote session filters](remote-service.md#session-filters)
for state projection and source validation.

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
Only previously activated or already-standby sessions have a steady blue Sleeping dot;
never-started and explicitly deactivated sessions remain gray/inactive.
Standby eligibility is persisted separately from the allocation guard, so an
unclicked standby session stays blue through repeated restarts. Explicit
deactivation clears that eligibility. Selecting a session, tab, or pane
starts only that session; merely displaying other panes in a split does not
start their processes. Sleeping entries appear under All or Sleeping and are
excluded from Active. Returning from the tray reconnects sessions confirmed live by
the host and keeps the others dormant.[^app-shell][^pane-slot][^sidebar]

New Codex sessions and existing Luna presets resolve to `gpt-6-luna` with `max`
reasoning. Settings > Codex, the creation dialog and session properties expose
separate provider, model and reasoning-effort fields for documentation/Markdown
and HTML. The model dropdown always shows the full suggestion list, including Luna, Sol
and Astra; a separate custom option accepts a model ID. Known
Codex models show their supported effort levels; custom model availability
depends on the installed CLI and account. Both workers can be disabled.
Changes apply on the next PTY launch, including resumed conversations.
Local Codex workers receive independent, content-addressed TOML role layers;
SSH launches instead request explicit model/effort spawn overrides and never
reference local role-file paths.[^session-workers][^worker-role-config]

Project, project-folder and session deletion use in-app confirmation instead
of blocking native dialogs. Deletion-blocked notices also remain in the
renderer. Context-menu and drag backdrops are cleared before confirmation;
asynchronous PTY cleanup must not clear a new menu opened in the meantime.
The surviving pane's deferred terminal focus and deletion focus restoration
both respect open modals, menus, inputs, selects and editable controls.
Confirmation rechecks ownership and guards against duplicate deletion requests.
Layout state and imperative refs advance together. The Electron deletion smoke
checks cancellation and confirmation with real pointer input and native select
keyboard interaction, in addition to React lifecycle assertions.
[^session-lifecycle-actions][^workspace-focus]

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

Right-clicking a local session tab offers **Open current project** to open its
own project's root folder in Windows File Explorer. The target comes from the
clicked session, even when another project is selected. Sessions without a
local project folder and SSH sessions omit this action. Document tabs retain
their separate **Reveal in File Explorer** action. The menu closes after the
click, and a failed folder open reports a toast.[^app-shell][^context-menus]

## Terminal and chat

The Terminal settings panel controls font, size, line height, cursor, scrollback,
selection copying and right-click pasting for local and SSH terminal views.
Preferences retain the legacy font-size value, share the Ctrl+wheel setting,
update existing views across windows and apply to new terminals. Lower scrollback
limits can trim screen history without deleting stored conversations. See the
[settings roadmap](settings-expansion-roadmap.md) for defaults, scope and validation.

Highlighted filesystem paths stop at the ANSI foreground-color boundary. For
example, green `03_Development/GitHub/SubStorage` followed by ordinary `는` opens
`SubStorage`; the particle has no link underline or click action. Hover links and
direct mouse hit detection use the same boundary. Palette and RGB highlights,
Korean folder names (including names ending in `는`), and wrapped paths retain
their full path text. Uncolored paths keep the existing filename matching;
URLs and OSC 8 hyperlinks keep their separate recognition.[^terminal-links][^terminal-links-smoke]

File URLs such as `file:///C:/Users/name/.codex/generated_images/result.png`
use the local filesystem resolver. Clicking the scheme, drive, or a wrapped
continuation opens the same target; OSC 8 links with a visible label follow the
same routing. Encoded spaces, Unicode and filename characters are decoded once,
including `file://localhost/` addresses. Images outside the project open in the
image viewer, while documents and folders use their existing open actions.
Malformed URLs and missing targets fail without falling back to a shorter path.
HTTP links keep their configured browser behavior.[^terminal-links][^terminal-path-service][^terminal-links-smoke]

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

The pending source update resolves Git from installed executable paths before
falling back to the Windows x64 package's bundled MinGit. Builds verify the
official archive's pinned size and SHA256, include the complete runtime and
licenses, and check that it runs without Git on PATH. The development tree can
also use its local `.build-tools/mingit` cache; no Git binaries are committed.
[^git-runtime][^git-bundle]

Git commands trust the selected, canonical worktree only for that invocation,
including submodule/worktree `.git` files and projects opened below the root.
On Windows they enable `core.longpaths` for the same invocation. Acedia does not
write either setting to the user's global Git configuration. Ownership errors,
invalid metadata, missing executables, timeouts, and oversized output remain
query failures instead of being presented as a non-repository.[^git-command]

Source Control keeps query errors and a retry button visible until the next
successful query. Loading disables retry. Switching project/repository removes
the previous rows and selections; older results or errors cannot replace the
new repository's state. The actual Electron Git panel smoke checks error
persistence beyond five seconds, retry, slow queries, and project switching.
[^file-tree]

The pending update was verified on 2026-10-04: the Electron panel displayed all
34 changes from an existing submodule project with different-owner Git metadata;
the full suite passed 155 files / 1,002 tests, and TypeScript/Vite built
successfully. A Standard unpacked build included verified MinGit and passed the
packaged bridge/Dashboard smoke, including staged files with paths longer than
260 characters and untracked files. This verification does not publish or
install the pending update.

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
[^session-workers]: Worker models, reasoning effort and launch instructions
[^worker-role-config]: Per-worker Codex configuration layers
[^session-lifecycle-actions]: Session deletion and runtime lifecycle actions
[^workspace-focus]: Active terminal focus recovery
[^sidebar]: Project and session sidebar
[^pane-slot]: Pane and tab host
[^context-menus]: Workspace context menus
[^terminal-area]: Terminal and chat surface
[^terminal-links]: Terminal path matching and pointer ranges
[^terminal-links-smoke]: Native terminal link pointer verification
[^terminal-path-service]: Local filesystem and file URL resolution
[^chat-view]: Persistent chat history and artifacts
[^file-tree]: File tree panel
[^git-discovery]: Child Git repository discovery
[^git-runtime]: Installed and bundled Git executable selection
[^git-command]: Scoped Git commands and typed failures
[^git-bundle]: Pinned Windows MinGit packaging
[^document-viewer]: Document viewer
[^settings]: Settings surface
[^app-language]: Application language preference
[^session-storage-ui]: Session JSONL storage catalog UI
[^session-storage-service]: Session JSONL metadata catalog
[^conversation-store]: Per-session conversation store
