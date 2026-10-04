---
type: Operational Model
title: Usage accounting
description: "Local transcript-derived token indexing, historical aggregation, and account-limit display."
tags:
  - usage
  - tokens
  - sqlite
status: stable
stale_after: 2026-10-31
sources:
  - id: usage-service
    resource: ../app/electron/services/usage-service.mjs
    title: "Electron usage service"
  - id: usage-tests
    resource: ../app/electron/services/usage-service.test.mjs
    title: "Usage aggregation tests"
  - id: usage-ui
    resource: ../app/electron/remote-pwa/app.js
    title: "Dashboard and Remote usage UI"
  - id: status-bar
    resource: ../app/src/components/UsageStatusBar.tsx
    title: "Desktop account-limit status bar"
  - id: account-pool
    resource: ../app/electron/services/account-pool.mjs
    title: "Routed request outcomes and response usage"
---

# Usage accounting

Usage data is a local derived index of supported provider transcripts. It is not
provider billing truth and is not an exact measure of monetary cost.[^usage-service]

## Incremental collection

The Electron service scans Codex and Claude transcript sources, parses supported
token events, and stores source identity and offsets so later refreshes process
only new material. Events are deduplicated and rolled into daily aggregates;
reopening the usage page does not require rebuilding all history.[^usage-service][^usage-tests]

Dashboard returns stored token totals and history immediately while transcript
discovery and collection run in the background. Active sessions have priority
over inactive history, but inactive sessions remain part of the cumulative
totals. This replaces the awaited transcript scan introduced in
[EXE 1.8.1.44](release-1-8-1-44.md): an unindexed multi-GB history must not hold
the Dashboard response open or allocate a buffer the size of the backlog.

Collection reads at most 256 KiB per I/O operation, yields between committed
batches, and persists offsets, model/context and Codex cumulative state together
with events. Incomplete final lines are retried after they are completed.
Completion hooks and concurrent refresh/import requests share in-flight work.
A single JSONL record exceeding 64 MiB stops that file at its last safe
checkpoint and reports an incomplete refresh, rather than dropping usage or
growing memory without a bound. Other files can still be collected.

Passive reads share one job and reuse a completed attempt for up to 30 seconds;
explicit Refresh also requests collection. Ongoing turns and newly discovered
sessions therefore appear without requiring a completion hook. Account quota
lookups continue separately. The visible usage page polls every second while
either collection or quotas are pending, and every 30 seconds otherwise. Polling
pauses while hidden and resumes on return. The record count shows collection
progress and the last successful full refresh separately from quota timestamps;
a failed or partially failed collection preserves stored totals and shows a
retry message instead of claiming that all records are current.
This bounded background collection ships in [EXE 1.8.1.45](release-1-8-1-45.md).

Calendar buckets use the desktop's local timezone. Work spanning midnight belongs
to two dates. Cached input is a subset of provider input, and reasoning output is
a subset of provider output; each is counted once in the total. The input/output
breakdown shows the remaining fresh input/non-reasoning output, with the subsets
listed separately.

Remote SSH transcripts that do not exist on this PC are outside this ingestion
model.

## Routed request usage

[Account routing](account-pool.md) keeps response-reported request tokens separate
from transcript totals. A request without response token data can still consume
tokens; the account card shows transcript totals for recorded assignment periods.
Transcript token events do not carry a routed request ID, so those totals are not
distributed across individual requests or matched by timestamp alone. Reported
zero remains distinct from missing usage.[^account-pool][^usage-ui]

Receiving a completion event takes precedence over a later client disconnect.
Historical disconnect counts are preserved separately because older records
cannot establish whether completion preceded the disconnect.[^account-pool]

## Local storage

SQLite runs in WAL mode and stores event identity, time, project, agent,
provider session, tool, model, working folder, and input/output/cache/reasoning
token dimensions. Daily totals can be rebuilt from indexed events.[^usage-service]

The database belongs to local application data, not Git. Deleting it discards
the local index; a later scan can reconstruct only data still present in
supported transcript sources.

## Historical views

The usage UI supports ISO week, calendar month, and calendar year selection,
previous-period comparison, and appropriate daily or monthly buckets. Available
year bounds are derived from stored events instead of a hard-coded range.[^usage-tests][^usage-ui]

Totals include input, output, cache read/write, and reasoning where the provider
event exposes them. Cache dimensions must not be silently reclassified as fresh
input.

## Account limits

The [1.8.1.46 account-unification change](release-1-8-1-46.md) uses the same Codex account names and
quota snapshots in the desktop footer, Agent usage, Dashboard and owner Remote
views as **Accounts & routing**. Matching local/default logins become aliases
only when both their workspace account ID and user subject match exactly;
unmatched direct logins remain available. Explicit footer selections migrate to
the registered ID, and existing visibility preferences are copied on the first
match unless a canonical preference already exists. Excluding an account from routing does
not hide its quota. The usage dialog links to the existing account-management
page. See [account usage unification](account-pool.md).

Pool quotas come from the pool's encrypted credential workflow and shared
background refresh job. The adapter never copies credentials or changes session
owners, and never attributes an old default transcript quota to a pool account.
Account registration appears before a quota exists. Account removal retains the
last snapshot as an unregistered profile. Non-owner Remote viewers cannot see or
change pool profile visibility through the usage API.

Explicit refresh queries every registered Codex account through the CLI app-server's
`account/rateLimits/read` RPC using that account's isolated login environment. No
thread or model turn is started. Recent transcript `token_count` snapshots remain
a fallback: the scan retains its first 32 prioritized candidates and adds one for
every other account represented in the sources. Claude
limits are fetched from the local Claude Code OAuth usage endpoint only when a
usable local credential exists. These percentages describe provider reset
windows, not “tokens remaining” in the local history database.[^usage-service][^status-bar]

Managed Claude profiles use their own credential files for usage refresh. Each
account has separately keyed overall/model windows labeled with its profile name;
the default login retains its existing keys. Unavailable profiles preserve their
last snapshot without overwriting another account. The transcript scan includes
every managed Claude `projects/` root. See [Claude account profiles](claude-accounts.md).

Footer Refresh and Agent usage → Refresh all accounts query idle and hidden accounts
as well as active ones, with at most two simultaneous requests per account registry. Duplicate
refreshes share one job; a partial failure does not stop remaining account queries.
Refresh failures preserve the last useful snapshot and its timestamp, with separate
login-required, timeout, failure and unavailable states. A passive cache read cannot
discard a live refresh response. Codex helpers are stopped on completion or timeout.

Account-wide and model limits are grouped by provider and account ID. Registered
Codex and Claude profiles appear separately even without linked sessions or quota
snapshots. An independent profile inventory carries these accounts; missing quotas
show a pending message instead of a made-up percentage. An unmatched Codex default
login also appears in the inventory; other default providers appear when they
have a snapshot or a live lookup result, including missing authentication.
Legacy folder-label profiles, unregistered accounts and manually
hidden profiles live in a separate review area. The exact legacy label format is only
a reversible display hint; an explicit visibility choice takes precedence. Users can
hide or explicitly show each profile, including accounts without snapshots, without
changing credentials, history, token totals or snapshots. Preferences persist in
`usage_profile_visibility` and are shared by desktop and Remote/PWA reads. Each limit
retains its own update timestamp; equal names or percentages do not establish account
identity. See [profile display management](properties-and-usage.md).[^usage-service][^usage-ui][^status-bar]

[^usage-service]: Electron usage service
[^usage-tests]: Usage aggregation tests
[^account-pool]: Routed request outcomes and response usage
[^usage-ui]: Dashboard and Remote usage UI
[^status-bar]: Desktop account-limit status bar

## API baseline cost comparison

[API 단가 기준 환산액](usage-cost-comparison.md) documents the shared pricing snapshot, USD display, unsupported-record coverage and separate observed subscription quotas. Central and Remote totals use different datasets. This is a comparison baseline, not provider billing or a monetary weekly allowance.

## Per-session usage

Usage → **Session usage** adds today, rolling seven-day, calendar-month and all-history views with project/provider/status/search filters, parent/child grouping, token details and CSV export. [Session usage](session-usage.md) documents exact conversation and hook ownership, legacy unresolved history, durable attribution, pricing coverage and independent family totals. Shared folders do not establish session ownership. The original period-history and account views remain available.
