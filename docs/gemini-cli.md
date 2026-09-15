---
type: Integration
title: Antigravity CLI terminal sessions
description: Google CLI installation, terminal launch settings and current integration boundaries.
status: stable
sources:
  - resource: ../app/src/types.ts
  - resource: ../app/src/components/AgentsSettings.tsx
  - resource: ../app/src/lib/spawn.ts
  - resource: ../app/electron/services/terminal-launcher.mjs
  - resource: ../app/electron/services/web-services.mjs
  - resource: ../app/electron/services/antigravity-usage.mjs
  - resource: https://www.antigravity.google/docs/cli/statusline/
  - resource: https://geminicli.com/docs/get-started/installation/
  - resource: https://geminicli.com/docs/cli/cli-reference/
  - resource: https://antigravity.google/docs/cli/install/
  - resource: https://docs.cloud.google.com/gemini/docs/codeassist/overview
---

# Antigravity CLI terminal sessions

## Antigravity for personal Google accounts

Google ended Gemini CLI service for individual, AI Pro and AI Ultra accounts on
June 18, 2026. Successful browser OAuth followed by `UNSUPPORTED_CLIENT` is a
service eligibility rejection; updating Gemini CLI does not restore that path.
Select **Antigravity CLI** (`agy`) for these accounts. It is a separate tool in
Acedia's settings, new-session picker and Remote catalog. The official Windows
installer places `agy.exe` under `%LOCALAPPDATA%/agy/bin` and updates user PATH.
Restart Acedia after installation so it inherits the new PATH.

Antigravity starts with `agy`; optional Dangerous mode uses its own
`--dangerously-skip-permissions` flag. Native Windows SSH launching keeps `agy`
without an npm `.cmd` suffix. It supports the same terminal-only integration
boundaries described below. Antigravity 1.2.2 was installed and its version/help
checked locally. The user's screenshot confirmed successful Google AI Pro
sign-in and an interactive prompt; a live model response inside Acedia has not
been verified.

## Launch settings and integration boundaries

Antigravity participates in terminal panes, splits, Remote session creation and
SSH launching. Install and authenticate the CLI on each SSH host. Per-tool
and local session defaults support executable paths, arguments and non-reserved
environment variables. Google credentials remain excluded from persisted launch
options. Local sessions use `/quit` for graceful shutdown, and inherited
`NO_COLOR` is removed when creating the PTY.

The integration uses the terminal and official status-line metadata. Acedia does
not yet capture work-state hooks, automatically configure browser MCP, index
chat history, manage accounts or collect token usage. Account quotas and exact
conversation recovery are supported as described below.

## Removed Gemini CLI integration

Gemini CLI is no longer offered in new projects, sessions, settings or the
Remote catalog. Saved Gemini sessions remain recognizable but cannot restart;
the launch error directs users to create a new Antigravity CLI session. Sessions
are not silently converted. Existing CLI installations, credentials and
configuration on the computer are preserved.

## Verification

Automated coverage checks Antigravity command generation, launch defaults,
CLI lifecycle, Remote creation and rejection of saved Gemini launches. Electron
smoke covers Antigravity settings and new-session selection. Actual model
requests and remote-host execution are outside these checks.

## Antigravity account quota in the status bar

Local Antigravity launches install Acedia's status-line bridge in
`~/.gemini/antigravity-cli/acedia-statusline`. The official status-line JSON
provides quota remaining fractions and reset timestamps. The bridge stores only
validated quota fields, a hashed account identifier, plan and receipt time;
credentials, email addresses, prompts and transcripts are not persisted.
Existing custom status-line commands are saved and forwarded the original input.
The native default line remains visible when no custom command exists.

Select **Antigravity** in the status bar's account list. Gemini's five-hour and
weekly quotas share one entry, with other buckets in the details. The shared
used/remaining display setting applies. Desktop polling imports new snapshots;
Remote receives the same provider and quotas. This does not query AI Studio
billing, collect token totals or restore Gemini CLI tool selection.

An already-running CLI needs to restart once to load the bridge. CLI state
changes deliver snapshots; `/usage` in the CLI requests a backend quota refresh.
Acedia's Refresh button rereads the last received snapshot, not Google's backend.
After five minutes without a payload the UI identifies the data as last received.
Empty quota data clears old buckets, including after an account change. SSH
sessions do not install a bridge or contribute local account quotas.

Verified with installed Antigravity 1.2.2 and a real signed-in account without a
model request, plus parser/persistence tests and Electron status-bar UI smoke.
The external CLI's status-line schema remains an integration dependency.

## Automatic conversation recovery

Source version **1.8.1.16** fixes `Invalid account provider` during Antigravity
startup in 1.8.1.15. The shared IPC validator rejected `agy` before the resolver
could run. Session resolution now accepts it; Codex/Claude account relinking
remains unchanged. This is an Acedia validation error, not a Google login error.
The EXE containing this fix has not yet been published.

The status-line bridge reports `conversation_id` (or its `session_id` alias) to
Acedia's authenticated local hook server. Each local Antigravity launch receives
an independent launch identifier. Reports are accepted only for the live owning
PTY; repeated IDs are deduplicated, and reports from an old launch are rejected.
Only session identity and the workspace path are used; transcript contents are
not collected for recovery.

Acedia persists the ID in its per-agent session index and renderer state. On
restart it passes `agy --conversation <ID>`. Agents sharing one folder retain
independent IDs. A pin takes precedence. Recovery never uses `--continue` or
falls back to the most recent conversation in a folder. Invalid IDs, missing
conversation databases and changed indexed workspaces stop the launch with an
error. Conflicting advanced conversation/continue flags must be removed when
automatic recovery is active.

An old session without a captured ID starts fresh. To keep an older conversation,
select it with Antigravity's `/resume`; once its identity is reported, later
restarts recover that exact conversation. SSH and automatic idle suspension are
outside this integration. The local conversation database must remain available,
and the CLI remains responsible for validating the signed-in account.

Verified with two agents sharing a folder, persisted-index reopening, old-launch
rejection and an actual Antigravity 1.2.2 `--conversation` startup. The live check
captured the same ID and resolved it after reopening Acedia's index without
sending a model prompt.
