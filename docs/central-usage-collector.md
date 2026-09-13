---
type: Integration
title: Central usage collector
description: Employee-attributed Codex collection, standalone packages and central receiver.
status: draft
sources:
  - resource: ../app/electron/usage-collector/collector.mjs
  - resource: ../app/electron/usage-collector/server.mjs
  - resource: ../app/electron/usage-collector/cli.mjs
  - resource: ../app/src/components/UsageCollectorPanel.tsx
  - resource: ../app/electron/usage-collector/collector.test.mjs
---

# Central usage collector

The company collector is separate from the existing [local usage index](usage-accounting.md).
Its shared runtime is bundled in Acedia and can also run under standalone Node.
Settings → Usage collector enrolls a device using a one-time server code, then
explicitly maps transcript folders to permitted server accounts. Codex is the validated delivery scope; Claude Code and ordinary ChatGPT/Claude chats are excluded from this release verification.
Enrollment alone does not enable sending. Development profiles are isolated from
the packaged/standalone default collector profile.

Employees and AI accounts are separate identities. A shared AI account aggregates
multiple employees; a personal account belongs to one employee. Device credentials
determine the employee on the server. Account mapping is explicit and is not
proof of provider identity. One server database is one company boundary.

Administrators can register the actual login email and optional provider identity
fingerprint with its shared/personal classification, or select an observed login.
The receiver matches the fingerprint first, otherwise the case-normalized email,
and routes new usage and quota reports to that server account. Duplicate login
registrations are refused. Personal accounts accept only the owner's devices.
Existing event attribution is retained on retries; registry changes do not move
old events. Unregistered mappings default to personal usage. Only logins explicitly registered
as shared count as shared; a legacy shared label without a login binding is personal.
This matches collector-reported metadata, not an independent proof of identity.
The registration page supports editing existing accounts; an account used by other
employees cannot be converted to one employee's personal account.

Employee analysis divides an employee's usage of one account by all employees'
usage of that same account in the selected period. Cards show both token counts
and the resulting percentage. Kind filters do not change the denominator.
Employee-scoped responses expose shared-account aggregate totals for this calculation,
while other employees' identities and event details remain hidden. Missing or zero
account totals produce an unavailable percentage rather than a fabricated 100%.


The dashboard offers system/light/dark themes, including login, tables and drawers.
The browser stores only the theme preference; the access key stays in page memory.

The collector reads usage metadata, keeps a SQLite outbox, and sends bounded batches
to an authenticated receiver. A shared local lease and server event deduplication
cover parallel Acedia/CLI instances and retries. Cross-employee/account duplicates
remain attribution conflicts. New mappings exclude older timestamps to avoid
assigning historical shared logs to the registering employee.

The central dashboard offers period selection, account/employee aggregates, device
last-seen/revocation, employee/account registration, one-time enrollment and CSV.
The approved dashboard layout uses a dark navigation sidebar, summary cards,
calendar usage tables, employee ranking, quota cards and central detail pages.
Account and employee tables show Windows usernames with their token subtotals.
Detail pages break down the entire selected period by historical Windows user,
PC and local IP; this aggregation is independent of the latest-500-event list.
Account links open a full-width detail page in the central content area, with
usage KPIs, account metadata, remaining limits and employee account-use percentages.
The sidebar remains available; returning to the list preserves its period/filter.
Employee and device details continue to use the auxiliary drawer.
Records without sender snapshots remain explicitly uncollected, never attributed
using the device's current username. Employee credentials restrict these aggregates
to their own employee records.
No conversation content, code, transcript paths or AI authentication secrets are transmitted.
Windows device secrets use current-user DPAPI. Pause requires no server round trip.

## Installation and operation

See the [server operations guide](usage-server-operations.md) for source/runtime
locations, standalone packaging, startup, account registration and data preservation.

The [runtime guide](../app/electron/usage-collector/README.md) contains standalone
CLI, plugin generation and data-contract instructions. The [independent server](../usage-server/README.md)
is packaged with `node app/scripts/package-usage-server.mjs <new output folder>`
and runs without Acedia or npm dependencies. Its default loopback port is 3007;
3004–3006 are occupied on the development PC. Remote employees require HTTPS.
Initial CLI verification used a named test employee and isolated transcript folders.
The local collector is now explicitly mapped to the current PC's Codex sessions
for ongoing account/quota and device-metadata verification. Existing history is
retained; a newly mapped source only sends events after its mapping timestamp.

## Account identity, remaining limits and sender metadata

The account's management label remains separate from the local login's email and
hashed account/user identifier. Codex account-only app-server RPCs read account
status and remaining rate-limit windows without creating a model turn. Results
include plan, used percentage, reset time and observation time. The UI derives
remaining percentage; it never interprets consumed token totals as remaining tokens.
Refresh requests travel through the authenticated receiver to the running collector.
One mapped account is refreshed per collection cycle, normally every five minutes
or on request. A five-second watcher and dashboard poll deliver updates while online.
Offline collectors remain pending; failed or expired observations are marked stale.
An account change suspends new log attribution until its folder mapping is confirmed.
Different login identities reported for the same management account are flagged as
a mapping conflict instead of merging their remaining limits.

Collectors report Windows domain/user name, PC name and non-loopback IPv4
addresses from local network adapters. These are self-reported device information,
not independent employee authentication; VPN and DHCP can change addresses. Device
enrollment still determines the employee. New usage events preserve sender metadata
and known account identity at collection time. Existing records without these fields
show “not collected”; current metadata is not backfilled into history. Employee
requests can only read their own event and device details. Prompts, code, MAC
addresses, Windows passwords and provider authentication tokens are excluded.

The developer's local receiver uses the explicitly requested login key `admin`.
This key is accepted only in the standalone server's loopback mode. Generated
deployment packages still create a random protected key by default.

Live verification confirmed an account refresh round trip, the real account email,
remaining weekly limit, Windows username and four local IPv4 addresses. A new
Codex CLI turn reported 14,175 tokens; the receiver stored the same amount with
its login identity and sender metadata, taking the local verification total to
127,705 tokens. The temporary test authentication copy was removed afterward.
Evidence: `.acedia/usage-live/metadata-report.json` and
`.acedia/usage-live/event-identity-report.json`. All 683 tests in 113 files, the app
build, and desktop/mobile settings/dashboard/detail checks passed.

## Supported and outstanding scope

Implemented: explicit local Codex/Claude Code JSONL collection, receiver/dashboard,
Acedia settings, local provider plugin generation and employee-scoped read-only MCP.
Ordinary ChatGPT/Claude chat token collection has **no verified implementation**.
The MCP adapter reports collected CLI data only. Consumer-host OAuth/discovery,
ChatGPT connector installation, Store profile parity, SSO, automatic retention and
OS service installation remain follow-up work. Missing counts are not presented as zero.
Claude has been excluded from the current delivery and live validation at the
user's request; existing parser code and unit fixtures do not constitute live support verification.

## Codex CLI live validation — 2026-09-12

The native Codex plugin manager installed `acedia-usage@personal` in an isolated
Codex profile. An actual model turn called the plugin's `usage_summary` MCP tool.
Further short turns exercised CLI exit. Their real CLI usage totals matched the
receiver: **113,530 tokens, eight usage events**. This run used actual model tokens;
the automated fixture tests do not. Intermediate exit experiments required recovery
scans; the final run collected after CLI exit automatically, without a manual scan.
The live dashboard was opened and its account and employee rows visually verified.

Validation: 679 tests in 112 files, the production app build, the 15 collector
regressions and the Electron enrollment/settings/upload/pause/dashboard smoke
passed. Final standalone artifacts are generated under `.acedia/`:
`acedia-usage-server-0.1.0.zip` and
`usage-collector-dist/acedia-usage-collector-0.1.0.tgz`. The receiver and authenticated
dashboard remain open locally at `http://127.0.0.1:3007`. Temporary copied AI
authentication was removed after the live CLI tests. No commit or release is part
of this implementation/verification request.

Windows CLI teardown can terminate detached children in the same process job.
The MCP adapter now starts an independent watcher through local WMI under the
current Windows user, without elevation. A database lease keeps one watcher per
collector profile; it scans every five seconds, keeps offline records and exits
when collection is paused. This is a user process, not an installed Windows service.
Company policy must allow local WMI process creation for this independent watcher.
The final package does not require lifecycle hooks or hook-trust bypass. A regression test writes a transcript
after MCP exit and verifies server receipt and watcher shutdown on pause.

Ignored local evidence: `.acedia/usage-live/report.json`,
`.acedia/usage-live/dashboard.png`, and CLI result files. No AI login credentials
or enrollment secrets are committed or sent to the usage server.

See the [collector tests](../app/electron/usage-collector/collector.test.mjs) for shared
account attribution, replay, partial lines, offline retention, account isolation,
device revocation, duplicate ownership and MCP scope checks. The separate
[Electron UI smoke](../app/scripts/electron-usage-collector-smoke.mjs) exercises real
enrollment, settings mapping, protected credentials, upload, pause and dashboard.

### Calendar analysis and recent-history pagination

The dashboard provides daily, Monday-based weekly and calendar-month token tables in Asia/Seoul. Full-period aggregates are scoped to the current employee credentials and selected account/employee/device; they are independent of the latest-500-event response. Empty periods display zero, boundary periods include only records inside the selected range, and analysis tables show 12 periods per page. Recent history defaults to 25 rows with 25/50/100-row and page selectors. These are collected token totals, not employee-attributed subscription quota consumption.

## API baseline cost comparison

[API 단가 기준 환산액](usage-cost-comparison.md) documents the shared pricing snapshot, USD display, unsupported-record coverage and separate observed subscription quotas. Central and Remote totals use different datasets. This is a comparison baseline, not provider billing or a monetary weekly allowance.
