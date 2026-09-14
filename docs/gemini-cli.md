---
type: Integration
title: Gemini and Antigravity CLI terminal sessions
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

# Gemini and Antigravity CLI terminal sessions

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

## Gemini CLI

Gemini CLI is available in the new-project/session picker and in Settings →
Agents → Gemini CLI. Install it with `npm install -g @google/gemini-cli`, then
run `gemini` to complete the CLI's login flow. Acedia detects the executable on
PATH and uses the existing CLI login and configuration. Refresh installation
status after installation; restart Acedia if its inherited PATH is stale.

Normal sessions launch `gemini` with approval prompts enabled. Explicitly
enabling Dangerous mode adds `--approval-mode=yolo`. Per-tool defaults and
local session overrides support an executable path, arguments (for example
`--model` plus the desired model), and non-reserved environment variables.
Gemini/Google API keys and credential-file environment settings stay outside
the persisted advanced-options editor, like other provider credentials.

Gemini participates in terminal panes, splits, Remote session creation and SSH
launching. Windows SSH hosts use `gemini.cmd` unless shim preference is disabled.
The CLI must be installed and authenticated on the SSH host. Local CLI sessions
use `/quit` for graceful shutdown and the existing agent process lifecycle.
Inherited `NO_COLOR` is removed when creating the PTY.

Both integrations are terminal-only. Acedia does not yet capture their hooks or
automatically configure its browser MCP, recover a specific conversation,
index Gemini chat history, manage multiple Gemini accounts, or collect Gemini
usage/quotas. Restarting starts a new CLI conversation unless the user supplies
an explicit resume argument. Existing Gemini CLI configuration is not rewritten.

## Verification

Gemini CLI was updated locally from 0.34.0 to 0.59.0 and its executable version
was verified. The update does not restore retired personal-account access.
Automated coverage checks normal/Dangerous command generation, SSH shim
selection, default persistence, advanced arguments, CLI lifecycle and Remote
session creation. Electron settings smoke verifies Gemini arguments and
Antigravity settings/new-session selection. The complete unit suite passed
717 tests; native and cmd-shim PTY smoke checks passed. Actual model requests
and remote-host Google CLI execution are not part of these checks.
