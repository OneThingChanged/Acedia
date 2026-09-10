---
type: Integration
title: Claude account profiles
description: "Independent local Claude logins, simultaneous account-bound sessions, scoped resume and per-account usage windows."
tags:
  - claude
  - accounts
  - sessions
status: stable
sources:
  - resource: ../app/electron/services/provider-accounts.mjs
  - resource: ../app/electron/services/claude-accounts.mjs
  - resource: ../app/electron/services/provider-accounts.test.mjs
  - resource: ../app/electron/main.mjs
  - resource: ../app/src/components/ProviderAccounts.tsx
  - resource: ../app/src/lib/codexAccounts.ts
  - resource: ../app/src/lib/spawn.ts
  - resource: ../app/electron/services/session-service.mjs
  - resource: ../app/electron/services/usage-service.mjs
  - resource: ../app/scripts/electron-codex-accounts-smoke.mjs
---

# Claude account profiles

## User workflow

Open **Settings → Agents → Claude → Login accounts**, add a label, and choose
**Browser login**. MultiAgent runs `claude auth login` with that account's own
configuration directory. Complete authentication with the intended account in
the browser. A label is user supplied, not a verified account identity.

Select the default for new local Claude sessions in the same settings tab.
New Session and New Project allow an override. Existing sessions retain their
own selection: deactivate the session before changing **Session properties →
Launch options → Claude account**. Account A and account B can run in separate
sessions simultaneously. Changing the new-session default does not change either
running process.

Switching a configured session to an account it has not used starts a new
conversation. Switching back restores that account's previous conversation when
its local transcript remains available. Account bindings and conversation maps
persist through full app restarts. The switch clears the session's terminal
buffer and group conversation pins and leaves it inactive.

## Isolation and storage

Managed profiles live under the app's user-data directory at
`claude-accounts/<uuid>/.claude`. Each local PTY receives its own
`CLAUDE_CONFIG_DIR`; the shared default login is not overwritten. Native Windows
realpath resolution supplies the physical path to external CLI processes,
including when legacy MSIX paths are redirected. EXE and Store use the
[shared user profile](shared-user-data.md); explicit development/test profiles
remain separate.

The registry stores only IDs and labels. Claude owns `.credentials.json`,
settings and `projects/` transcripts inside each managed directory. Global
credentials, settings, skills and plugins are not copied from the default home.
Project hook/MCP setup still applies. **Existing login** retains the inherited
`CLAUDE_CONFIG_DIR`, or `~/.claude` if unset.

Managed launches remove inherited Anthropic API/OAuth credentials, custom
authorization headers, endpoint and alternate-provider environment overrides.
On Windows the removal also handles differently cased environment names.
Other accounts and the parent environment remain unchanged.

One managed login per provider can be pending at a time, with cancellation and
a five-minute deadline. Reauthentication is rejected while that profile has a
live local PTY. A session cannot start while its selected profile is logging in.
OAuth process output is not returned to the renderer or persisted; only bounded
in-memory output is examined for a known configuration-path failure. Login status
reports saved credentials, not live token validation. The current credential
completion check targets the file storage used on Windows; macOS Keychain-only
authentication has not been implemented or verified.

## Conversation and usage scope

Automatic resume and manual relinking search only the selected account's
transcript root. Managed sessions fail startup when validation is unavailable or
a group pin cannot be verified for that account. Account-switch generations
reject stale startup requests. Hook/chat paths are constrained to the account
binding, and the transcript catalog includes all managed Claude roots.

Usage history includes locally indexed transcripts. Quota refresh uses each
profile's own saved credential and stores separate windows under account-specific
keys, labeled with the account name. An unavailable credential keeps the previous
snapshot. No token refresh or automatic account rotation is performed.

SSH sessions use authentication on the remote host and do not receive these
local profiles. Conversations are not copied between accounts.

## Verification

Unit coverage includes concurrent real child processes with distinct fixture
homes, unchanged default environment, scoped resume/relinking, persisted account
bindings, credential-output exclusion, physical-path resolution, and independent
quota snapshots. The hidden Electron account smoke covers both Codex and Claude
registration, simulated login, default selection, new-session creation and the
live-session account-change guard. Real provider OAuth, live simultaneous model
requests and packaged installation remain unverified for this change.

The upstream CLI documents [authentication commands](https://code.claude.com/docs/en/cli-usage)
and [CLAUDE_CONFIG_DIR](https://code.claude.com/docs/en/env-vars).
