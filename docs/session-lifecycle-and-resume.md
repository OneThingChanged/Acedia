---
type: Workflow
title: Session lifecycle and resume
description: "How configured sessions start PTYs, report activity, cancel work, shut down, and recover provider conversations."
tags:
  - sessions
  - hooks
  - resume
status: stable
stale_after: 2026-11-30
sources:
  - id: app-shell
    resource: ../app/src/App.tsx
    title: "On-demand workspace restoration and explicit activation"
  - id: pane-slot
    resource: ../app/src/components/PaneSlot.tsx
    title: "Standby placeholders and terminal allocation guard"
  - id: terminal-service
    resource: ../app/electron/services/terminal-session-service.mjs
    title: "PTY lifecycle service"
  - id: terminal-launcher
    resource: ../app/electron/services/terminal-launcher.mjs
    title: "Local and SSH terminal launch preparation"
  - id: session-index
    resource: ../app/electron/services/session-service.mjs
    title: "Provider transcript and session index"
  - id: spawn
    resource: ../app/src/lib/spawn.ts
    title: "Spawn and resume command construction"
  - id: activity
    resource: ../app/src/lib/agentActivity.ts
    title: "Runtime and hook activity state"
  - id: lifecycle
    resource: ../app/src/lib/sessionLifecycle.ts
    title: "Renderer session lifecycle transitions"
  - id: hook-service
    resource: ../app/electron/services/hook-service.mjs
    title: "Hook receiver and configuration"
  - id: reopen-journal
    resource: ../app/electron/services/reopen-journal.mjs
    title: "Full-exit recovery journal"
  - id: conversation-store
    resource: ../app/electron/services/conversation-store.mjs
    title: "Per-session conversation index"
---

# Session lifecycle and resume

## Two independent state models

Configured agent state and a live PTY are separate. Runtime state describes
process availability (`idle`, `starting`, `recovering`, `running`, `exited`, or
`unreachable`); work state describes hook activity (`working`, `waiting`,
`blocked`, or `done`).[^activity]

After application recovery, a session remains `starting` or `recovering` until
PTY output/readiness or a hook confirms that the provider CLI initialized. The
UI must not mark every reopened session as working merely because a process was
spawned.[^lifecycle]

## Start and provider resume

Configure new desktop sessions in the [wide session creation dialog](session-creation.md).
Account and worker choices become session launch settings; the dialog's layout
does not change the provider's start or resume lifecycle.

On a cold desktop start, saved sessions and the previous Screen layout return
without allocating xterm instances or PTYs. Restored sessions show a steady
blue Sleeping marker only when previously activated or already in standby.
Never-started and explicitly deactivated sessions remain gray/inactive, with
terminal allocation still deferred. A persisted eligibility flag preserves
standby through repeated restarts independently of the live-process journal;
explicit deactivation clears it. Legacy records use the remembered running IDs
only when the flag is absent. Clicking a session, tab, or its pane
starts only that session through the normal provider-resume path. Other panes
in the same split remain dormant. The sidebar's All / Active / Sleeping filters
separate these dormant sessions from live processes: Sleeping entries appear
in All or Sleeping, while Active includes starting, recovering, and running
sessions regardless of their work or question state. Search stays within the
chosen status. See [workspace interactions](workspace-interactions.md) for
filter persistence and visibility.[^app-shell][^pane-slot]

Returning from the tray reattaches only IDs confirmed live by the main process;
having one live PTY does not activate the remaining dormant sessions. Explicit
Remote activation continues to support starting a session in the background.[^app-shell]

[Standard EXE 1.8.1.89](release-1-8-1-89.md) also routes the authenticated
integration `sessions/:agentId/activate` endpoint through this background
launcher. It no longer shows/restores/focuses a workspace window or selects the
target pane. The new `acedia_session_start` MCP tool exposes the same operation
for existing local AI sessions. Earlier integration activation opens a visible
window. See [Workspace MCP](workspace-mcp.md#기존-세션-백그라운드-시작).

Spawning resolves the local or SSH command, provider session ID, terminal
compatibility flags, dangerous mode, and optional content-worker settings.
Local Codex and Claude sessions resume through provider session identifiers;
Windows SSH can resume when its reverse-hook path is available.[^spawn][^session-index]

The Electron launcher waits for browser integration, prepares the selected
account's configuration and environment, and checks that the launch generation
is still current before creating a process. Preparation failures release any
reserved SSH reverse port. A Codex account home receives its complete dormant
MCP transport before the CLI starts.[^terminal-launcher]

Changing a provider session pin or another launch-only option requires
deactivating and reopening the PTY. It does not rewrite a running CLI process.

## Attach, deactivate, and cancel

The PTY service owns sequence-buffer replay, renderer attachment, resize order,
and process-tree teardown. Detaching a pane is not termination. Deactivation
closes the PTY process tree while preserving configured session metadata.[^terminal-service]

Cancellation sends the provider interrupt and clears active work state without
claiming successful completion. Once readiness is restored, the session can
accept a new instruction. Active work hooks also expire defensively instead of
remaining permanently busy.[^activity][^hook-service]

## Window close and full exit

### Previous-run recovery confirmation (Standard EXE 1.8.2.25)

Published in [Standard EXE 1.8.2.25](release-1-8-2-25.md); update the installed host to use this behavior.

A full exit now checkpoints the live local Codex/Claude session set before the
renderer receives its save/quit request. The existing workspace snapshot retains
the catalog, tabs, layout, parent relationships and launch settings; the host's
`session-recovery.json` retains exact conversation IDs, account selection scope,
working/idle/question state and routed-account ownership. No credentials or
conversation bodies are copied. Failure to save cancels full exit with an error.
Closing workspace windows to the tray keeps the existing processes running and
does not request a previous-run restore.

On the next cold launch, the coordinator asks **Restore sessions from the
previous run?** No keeps the catalog/layout and dormant sessions without launching
them. Pending mailbox activation/task ticks wait for the decision; task dispatch
also requires a live owner, including after No. Yes restores the captured local
sessions through the existing exact-resume launcher, two at a time, with child
workers before leaders. Completed/idle sessions reopen without another task;
question/approval sessions receive no automatic answer. SSH and arbitrary shell
commands stay dormant instead of being re-executed.

Only previously working sessions receive one continuation request, after their
exact conversation, process, unchanged configuration and empty native composer
are confirmed. The request tells the agent to consult current artifacts, workers
and results before continuing the existing user request. Original tasks are not
copied/replayed. An already-working session or a delivered message/user draft
prevents another request. Unknown transcripts, changed accounts/configuration,
login/questions and startup timeouts remain visible for manual attention.
An unused startup without a conversation ID can reopen fresh only when the host
observed no prior conversation, user input, submitted message or launch-time
prompt. This path rejects old pins/history and does not replay account handoffs
or send a continuation; its existing queued first task uses the normal mailbox.
Submission intent is durable before paste; an uncertain paste or interrupted
launch is not retried. `continued` records successful submission, while ordinary
native work hooks remain the evidence that execution actually started.

Workspace IPC `session_recovery` exposes `offer`, `decide`, `claim`, `launched`
and `status` for the current coordinator. Decisions bind an exact checkpoint ID,
and launches bind exact Acedia/session/account identities. Status contains only
concise metadata. Board renderers and other workspaces cannot launch a restore.

### Claude startup activation (Standard EXE 1.8.2.25)

Published in [Standard EXE 1.8.2.25](release-1-8-2-25.md); update the installed host to use this behavior.

An explicitly activated ordinary local Claude session can now confirm the
registered project/working folder even without API-created provenance. The
native workspace dialog parser recognizes `❯`, `›` and `>` selectors. Automation
moves from No to Yes once, observes the repainted native selection, then sends
Enter once. Actual cwd and canonical registered folder scope must still match.
Unknown folders, transcript/tool prose, SSH, login/API-key prompts and unrelated
approvals remain manual. The existing durable mailbox then waits for actual
composer readiness and exact receipt evidence before reporting task start.

Closing a workspace window can leave sessions owned by the tray process. A full
application exit cannot preserve OS processes: live sessions are journaled and
their process trees are closed. The next launch offers the recovery flow above;
declining keeps dormant placeholders that can still be opened individually
through the normal provider-resume path.[^reopen-journal][^spawn]

Full teardown also invalidates launch generations that are still waiting for
browser or account setup. Completion of that asynchronous preparation cannot
create a new PTY after the pending launch was closed.[^terminal-service]

The provider transcript remains the canonical provider resume record.
MultiAgent incrementally indexes its complete JSONL lines into a session-isolated
SQLite store for chat restoration, paging, locally submitted composer messages,
and referenced artifact discovery. Terminal scrollback is only a display buffer
and must not be treated as durable resume or conversation data.[^conversation-store]

The conversation database defaults to Electron local application data and can
be migrated to a user-selected directory. Migration verifies the copied SQLite
database before activation; an unavailable custom directory is reported instead
of silently opening an empty replacement database.[^conversation-store]

## Constraints

* transcript chat and provider-resume discovery are implemented for Codex and
  Claude, not every terminal tool;
* remote SSH provider files are unavailable to local transcript/usage scanners;
* POSIX SSH does not use the Windows reverse-hook resume path;
* an unavailable or replaced provider session ID must fail guarded external
  input instead of sending to an ambiguous process.

[^terminal-service]: PTY lifecycle service
[^terminal-launcher]: Local and SSH terminal launch preparation
[^app-shell]: On-demand workspace restoration and explicit activation
[^pane-slot]: Standby placeholders and terminal allocation guard
[^session-index]: Provider transcript and session index
[^spawn]: Spawn and resume command construction
[^activity]: Runtime and hook activity state
[^lifecycle]: Renderer session lifecycle transitions
[^hook-service]: Hook receiver and configuration
[^reopen-journal]: Full-exit recovery journal
[^conversation-store]: Per-session conversation index

## Optional idle suspension

Completed local Codex/Claude sessions can be suspended after a configured idle period.
Visibility, ownership, I/O and exact account-scoped transcript recovery are checked again
after asynchronous validation. Suspended sessions retain a strict resume target and remain
in standby until selected. See [idle sessions](idle-sessions.md) for exclusions and verification.
