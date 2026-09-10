---
type: Integration
title: Codex account profiles
description: "Independent local Codex logins, per-session account selection, and account-scoped conversation recovery."
tags:
  - codex
  - accounts
  - sessions
status: stable
sources:
  - resource: ../app/electron/services/provider-accounts.mjs
  - resource: ../app/electron/services/codex-accounts.mjs
  - resource: ../app/electron/main.mjs
  - resource: ../app/src/components/CodexAccounts.tsx
  - resource: ../app/src/lib/codexAccounts.ts
  - resource: ../app/src/lib/persistence.ts
  - resource: ../app/src/lib/spawn.ts
  - resource: ../app/electron/services/session-service.mjs
  - resource: ../app/electron/services/usage-service.mjs
---

# Codex account profiles

## User workflow

Open **Settings → Agents → Codex → Login accounts**, enter a label, and add an account.
Choose **Browser login** and complete Codex's browser authentication with the
intended ChatGPT account. The label is user supplied; MultiAgent does not infer
or verify the account email. Only one managed login runs at a time. A pending
login can be cancelled and expires after five minutes. Reauthentication is
blocked while a local session is running with that profile.

The Codex tab also stores the default account for new local sessions.
Select or override the account when creating a local project or session. For an existing
session, deactivate it first and select the account under **Session properties
→ Launch options**. A newly selected profile starts a new conversation. Switching
back restores that profile's last conversation, if its transcript is available.
Account changes leave the session inactive until explicitly opened.

Different accounts can run simultaneously in separate sessions. The shared
account service/UI also implements [Claude account profiles](claude-accounts.md).
Managed Codex startup now rejects an unverifiable group pin or failed scoped
lookup instead of falling back to an unchecked conversation ID. Account selectors
refresh after account creation/login without requiring Settings to be reopened.

## Storage and process boundaries

**Existing login** retains the desktop process's `CODEX_HOME`, or `~/.codex`
when unset. Additional profiles live under Electron's user-data directory:
`codex-accounts/<uuid>/.codex`. Development and installed applications use
different user-data directories; accounts registered in the development app
must be registered and authenticated again in the installed app. The registry
contains only UUIDs and labels.
Store/MSIX virtualizes the logical AppData directory into the package's
`LocalCache/Roaming` tree. Added profile homes use `fs.realpathSync.native` before
passing `CODEX_HOME` to the external CLI, and the same physical home is used for
session startup, transcript lookup, and quota attribution. Ordinary
`fs.realpathSync` leaves the logical Store path unchanged on Windows and is not
sufficient here. The existing/default login home is not rewritten.
Authentication remains in each profile's Codex-managed `auth.json`; credentials
and OAuth process output are never returned to the renderer or written to the
application logs by this integration. Login status indicates saved credentials,
not a live validation of token expiry or account identity.

Each additional profile receives its own `CODEX_HOME` and uses file credential
storage. Managed CLI launches also override `cli_auth_credentials_store=file`
and remove inherited API-key/access-token environment variables. The default
profile's environment is unchanged. Global settings, skills, plugins, and login
credentials are not copied from the existing home. Project-level configuration
and MultiAgent's existing project hook/MCP setup continue to apply.

Login failures may include a fixed `failureReason` code for an inaccessible
account home or missing saved credentials. OAuth output is never sent to the UI
or persisted; only a bounded in-memory tail is inspected for the known home-path
error and discarded on completion/cancellation. Retry clears the prior code.

Profile bindings and per-profile conversation IDs persist with the session.
Switching clears terminal scrollback and group session pins for that session.
The host rejects changes while its PTY is live, rejects stale spawn requests
for a previous profile, and invalidates in-flight startup generations. Resume
and manual relinking searches are restricted to the selected home. Conversation
views and transcript indexing recognize the additional homes.

## Usage and scope

Historical token totals include all indexed profiles. Codex quota snapshots are
stored under separate profile keys and shown with the profile label in the
usage bar; they are snapshots reported by local Codex transcripts. Profiles
without a reported quota snapshot have no quota bar yet. Registering the same
ChatGPT account twice does not create separate provider quotas.

This feature covers local Codex sessions. SSH authentication remains on the
remote host. It does not migrate a conversation between different accounts or
automatically switch accounts when a quota is exhausted.

## Verification

Unit tests cover isolated environments, registry reload/corruption, login
completion/cancellation without credential output, scoped transcript resolution,
per-account quota storage, account round trips, and cold-start persistence.
`node app/scripts/electron-codex-accounts-smoke.mjs` exercises the real account
UI and registry with a simulated authentication process in an isolated Electron
profile. The user confirmed successful account login and use in the development app on
2026-09-07. See [session lifecycle](session-lifecycle-and-resume.md) and
[usage accounting](usage-accounting.md) for the shared runtime behavior.

On 2026-09-08, the installed 1.8.1.0 Store package reproduced a logical
`CODEX_HOME` path-not-found error. Running the corrected resolver under that
package identity produced the physical account path, and an external
`codex login status` reached the expected unauthenticated state instead of a
configuration error. This verifies path resolution, not completed browser OAuth;
the installed binary still requires an update for the correction.
