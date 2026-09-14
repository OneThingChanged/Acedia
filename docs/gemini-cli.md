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

The integration is terminal-only: Acedia does not capture Antigravity hooks,
automatically configure browser MCP, index chat history, manage accounts or
collect usage/quotas. Restarting starts a new conversation unless an explicit
resume argument is supplied.

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
