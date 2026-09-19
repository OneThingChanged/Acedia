---
type: Integration
title: External codex-lb connection
description: "Opt-in Codex CLI routing through a separately managed codex-lb server, with encrypted connection credentials."
tags:
  - codex
  - accounts
  - proxy
status: stable
sources:
  - resource: ../app/electron/services/codex-lb.mjs
  - resource: ../app/electron/services/terminal-launcher.mjs
  - resource: ../app/src/components/CodexLbSettings.tsx
  - resource: ../app/electron/ipc-contract.cjs
  - resource: ../app/scripts/codex-lb-cli-smoke.mjs
  - resource: ../app/scripts/electron-codex-lb-smoke.mjs
  - resource: https://soju06.github.io/codex-lb/client-setup/
  - resource: https://soju06.github.io/codex-lb/routing/
---

# External codex-lb connection

Acedia can launch local Codex sessions against a separately running codex-lb
server. This integration is off by default. Acedia manages the connection and
CLI launch settings; codex-lb owns OAuth accounts, quotas, routing strategies,
upstream retries and conversation affinity. It does not embed or start a
codex-lb server, copy local account credentials into it, or implement a second
account-selection algorithm.

## Setup

1. Run codex-lb separately and register its ChatGPT accounts in its dashboard.
2. Open **Settings → Agents → Codex → codex-lb account routing**.
3. Enter the server origin or its `/backend-api/codex` endpoint. The default
   is `http://127.0.0.1:2455/backend-api/codex`, the external project's default;
   Acedia does not allocate or listen on this port. Reverse-proxy prefixes are
   supported. `/v1` is rejected for this native Codex connection.
4. Enter a server-issued API key when authentication is enabled. Remote
   servers require HTTPS and a key; loopback HTTP without authentication can
   leave the key empty. The key is not a ChatGPT login token.
5. Use **Test connection** to query the model catalog, then enable the
   connection and choose **Save connection**. Testing a draft does not save it.
6. Start or reopen a local Codex session. Existing live processes and SSH
   sessions retain their original settings.

**Server dashboard** opens the corresponding dashboard in the external browser.
Accounts and round-robin/capacity/sticky settings are configured there. Acedia's
test checks `/models`; it does not consume a model turn or prove that a server
account can generate, that WebSockets work, or that failover succeeds.

## Launch and credential boundaries

The Electron main process adds invocation-local `-c` provider settings:
`model_provider="codex-lb"`, provider name `openai`, the configured base URL,
Responses wire API, optional WebSocket support, `requires_openai_auth=true`,
and an environment-key reference. It preserves the selected local `CODEX_HOME`,
resume arguments, model/effort settings, hooks, browser MCP and worker settings.
Provider overrides follow user-supplied extra arguments and precede an automatic
handoff prompt. No `config.toml` or `auth.json` is rewritten.

The key is encrypted with Electron `safeStorage` in `codex-lb.json` under the
active application profile. Read IPC returns only key presence. Saving clears
the password field, and the key is passed to the child environment as
`ACEDIA_CODEX_LB_API_KEY`, never embedded in command arguments. An unauthenticated
loopback connection uses a placeholder bearer so the CLI's ChatGPT bearer is
not used as the server credential. The CLI's normal sign-in requirements still
apply to the documented authenticated-provider configuration.

Changing server origins requires explicitly replacing or removing the saved
key. Remote HTTP, credentials/query/fragment in URLs, redirects during probes,
malformed IPC and stale-window saves are rejected. Probe responses are bounded
and timed out; raw upstream errors and bodies are not shown. Storage or key
decryption failures stop launch rather than silently routing directly.

Disabling the connection restores ordinary launch behavior on the next CLI
start. It does not stop a running CLI or a separately managed server. Clearing
the key is an explicit saved operation.

## Conversations and usage

Codex labels sessions with their provider. Existing direct-provider history may
not appear in the codex-lb resume picker. Acedia preserves explicit saved resume
IDs but does not retag history or migrate upstream continuation state. Prefer a
new conversation when changing connection modes; existing continuation may
remain bound to an account and fail when that owner is unavailable.

The local account selector still determines local credentials and transcript
storage; it does not choose codex-lb's upstream account. Acedia's local quota
display likewise does not represent the server pool. Inspect the server
dashboard for routed accounts and pool usage. See [local account profiles](codex-accounts.md).

## Verification

Focused tests cover normalization, encrypted storage, stale saves, malformed
IPC, launch isolation, actual loopback HTTP probing, redirects, authentication
errors and failure without direct fallback. The Electron smoke checks the real
preload/main IPC path, Windows encryption, save/reload and error feedback, labels,
and narrow layouts in dark/light themes.

`node app/scripts/codex-lb-cli-smoke.mjs` requires `ACEDIA_CODEX_BINARY` pointing
to an installed Codex executable. It uses a temporary home, synthetic login
metadata and a loopback server. The installed CLI's actual catalog request was
verified to use the configured endpoint and the provider-specific bearer.
No live ChatGPT credentials or generation requests are used.

Real codex-lb account routing, quota exhaustion, long conversations, WebSocket
transport and production deployment remain unverified by these offline checks.
