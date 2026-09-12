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
---

# Usage accounting

Usage data is a local derived index of supported provider transcripts. It is not
provider billing truth and is not an exact measure of monetary cost.[^usage-service]

## Incremental collection

The Electron service scans Codex and Claude transcript sources, parses supported
token events, and stores source identity and offsets so later refreshes process
only new material. Events are deduplicated and rolled into daily aggregates;
reopening the usage page does not require rebuilding all history.[^usage-service][^usage-tests]

Remote SSH transcripts that do not exist on this PC are outside this ingestion
model.

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
as well as active ones, with at most two simultaneous requests per provider. Duplicate
refreshes share one job; a partial failure does not stop remaining account queries.
Refresh failures preserve the last useful snapshot and its timestamp, with separate
login-required, timeout, failure and unavailable states. A passive cache read cannot
discard a live refresh response. Codex helpers are stopped on completion or timeout.

Account-wide and model limits are grouped by provider and account ID. Registered
Codex and Claude profiles appear separately even without linked sessions or quota
snapshots. An independent profile inventory carries these accounts; missing quotas
show a pending message instead of a made-up percentage. Default logins appear when
they have a snapshot or a live lookup result, including missing authentication.
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
[^usage-ui]: Dashboard and Remote usage UI
[^status-bar]: Desktop account-limit status bar
