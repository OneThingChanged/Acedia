# Acedia Usage Collector 0.1

A local-transcript collector, company receiver/dashboard, and read-only MCP
adapter. Requires Node.js 22.13+ (tested with Node 24 on Windows). No model API
call is needed for background collection. MCP report requests through an AI
host may incur that host's normal model usage.

## Server

Run in a dedicated data directory. One server/database represents one company.
Set `ACEDIA_USAGE_ADMIN_TOKEN` to a securely generated random secret of at least
24 characters. Do not put the administrator key in source control or distribute
it to employees.

```powershell
node cli.mjs server --home "D:/AcediaUsageServer" --port 3007
```

Open `http://127.0.0.1:3007`, sign in with the administrator key, and open
등록 관리. Create employees, shared/personal AI accounts, and one-time device
enrollment codes. Codes expire after 15 minutes. A personal account has one
employee owner; shared accounts are visible to registered employees.

The server binds loopback by default. For employee access, place it behind an
HTTPS reverse proxy and use its HTTPS origin in clients. Forward `/v1/*`, `/mcp`,
and the dashboard. Do not expose a plaintext listener or put keys in URLs.
Keep the database directory restricted to the service user. This first version
has no SSO, managed service installer, scheduled retention or HA replication.

## Acedia

Settings → Usage collector: enter the server origin, one-time code and device
name. Enrollment does not start uploading. Choose local transcript folders,
map each to an allowed server account, enable upload and Save. The Acedia account
folder selector suggests known Codex/Claude Code locations. Check the selected
account rather than inferring identity from its display name.

Only usage events timestamped after a folder is mapped are eligible. No automatic
backfill attributes historical files to a newly registered employee. Both shared
and personal accounts require an explicit folder mapping. Removing a mapping
stops sending its queued account events when no remaining mapping enables that
account. Pause is local and works while the server is unreachable; an already
in-flight request cannot be recalled.

Packaged Standard uses the OS user's `LOCALAPPDATA/AcediaUsage` profile (on other
platforms, `~/.local/share/AcediaUsage`). CLI uses the same default. Development
and smoke builds use an isolated app-data subdirectory. EXE/Store profile parity
has not been installation-tested for this new feature.

## Standalone Codex

Save the supplied one-time code in a temporary local text file, then enroll:

```powershell
node cli.mjs enroll --server "https://usage.example.com" --code-file "D:/Temp/enrollment.txt" --name "Work laptop"
node cli.mjs accounts
```

Create a local configuration file; replace the account ID with an ID returned
by `accounts`, and use the actual transcript folder:

```json
{
  "enabled": true,
  "roots": [
    { "provider": "codex", "path": "D:/Profiles/codex/sessions", "accountId": "server-account-id" }
  ]
}
```

```powershell
node cli.mjs configure --file "D:/Temp/collector-config.json"
node cli.mjs status
node cli.mjs scan
node cli.mjs run
```

`run` stays in the foreground and scans every 30 seconds. The enabled MCP plugin
also starts its own independent watcher. An OS service/task manager is optional
for starting collection automatically after Windows login, before any AI host opens.
The CLI does not install a startup task. `--home <directory>` is supported
by all commands and selects a separate employee/device identity.

## Provider plugin packages

Generate a new installable directory for each host:

```powershell
node cli.mjs install --provider codex --target "D:/Plugins/acedia-usage-codex"
```

Register the resulting local directory with that host's plugin manager. Generated
`.mcp.json` uses the current Node executable and installed absolute runtime path;
regenerate the plugin if either moves. Existing host configuration is not edited.
Uninstall through the host plugin manager; remove a separate `run` task separately.
Revoke the device in the dashboard to invalidate all copies of its key.

The plugin starts the same collector and its background watcher. It exposes
`usage_summary`, scoped to the enrolled employee, and a `usage-report` skill.
Both manifests are packaged; the local source and generated Codex manifest are
validated. Native Codex installation, tool calls and actual usage collection were
verified in an isolated profile. Claude is excluded from this delivery's live tests.
The collector and its background `run` command can operate independently of MCP.

## ChatGPT / Claude ordinary chat boundary

The authenticated HTTP `/mcp` endpoint supports initialize, ping, tools/list and
read-only usage_summary. It queries already collected CLI usage; it does not read
or meter the current ordinary chat. OAuth/discovery for consumer host connectors
is not implemented. Native ChatGPT/Claude connector installation and exact
ordinary-chat token collection remain unimplemented, not inferred or estimated.
Do not label a connected report tool as full conversation telemetry.

## Data and reliability

- Transmitted: opaque event/session IDs, mapped AI account ID, provider, model,
  timestamp, token components and total; Windows domain/user, PC name and local
  IPv4 addresses; known account email and hashed account/user identity. Employee/device identity comes from the
  server-authenticated device key, not request fields.
- Never transmitted: prompts, responses, code, cwd, transcript paths, AI login
  secrets or API keys. Windows passwords and MAC addresses are excluded. The local configuration necessarily contains folder paths.
- Missing token components are null; Codex cache/read and reasoning subsets are
  subtracted from ordinary input/output to avoid adding them twice. Reported totals
  are not a subscription remaining quota or monetary bill.
- SQLite source cursors, outbox and a shared expiring lease prevent simultaneous
  Acedia/CLI collection duplication on one profile. Server event IDs deduplicate
  retried delivery. Updated Claude usage for one request replaces smaller totals.
- Cross-employee/account duplicate events are rejected as attribution conflicts.
  The client preserves rejected rows locally for inspection rather than reassigning
  them. The software does not independently attest employee honesty or provider
  billing; it trusts authenticated devices and explicit account mappings.
- Device tokens are hashed on the server. Windows clients protect keys with
  current-user DPAPI; other systems rely on the restricted local profile directory.
- Sources are JSONL only. Incomplete final lines remain pending. Malformed/oversized
  lines produce indexing warnings; the cursor is retained. File replacement and
  truncation trigger replay with event deduplication.
- Scan batches are bounded, upload batches contain at most 200 events, network
  requests time out after 10 seconds and retry backs off to five minutes. Success
  means server storage acknowledgement, not just local indexing.

Codex account-only RPCs also read plan and remaining usage windows without an AI
turn. The dashboard displays observed remaining percentages, reset times, stale
values, missing reports and account-mapping conflicts. Refresh asks online collectors
to update their mapped accounts; it does not log into accounts from the server.
Confirm a mapping again if the local login changes. New event sender metadata is
preserved historically; older records are not assigned today's IP or login.

## Build and validation

For a separate receiver deployment, use `node app/scripts/package-usage-server.mjs <new output folder>`
from the repository root. The generated folder runs with `node start.mjs` on port
3007 and includes its web dashboard. See `usage-server/README.md` in the repository.

An enabled Codex MCP plugin starts one background watcher per collector profile.
On Windows it uses local WMI process creation as the current user so that CLI job
teardown cannot discard the final usage record. Collection continues after the CLI
closes. Disable collection in Acedia settings, or configure `enabled: false`, to
stop the watcher (normally within five seconds; an in-flight request can take longer).
Uninstalling a plugin alone does not revoke an enrolled device: pause it first or
revoke it on the server. Background collection does not require lifecycle hooks
or granting hook trust.

Native Codex installation and real-token collection were verified in an isolated
profile. Claude is excluded from the current live validation by user request.
General ChatGPT/Claude chat token collection remains unsupported; a usage-summary
MCP tool does not measure the chat that calls it.

From this directory, `npm pack` produces the standalone runtime archive. From the
parent Acedia `app/` directory, run:

```powershell
npm test -- --run electron/usage-collector/collector.test.mjs --testTimeout=15000
node scripts/electron-usage-collector-smoke.mjs
```

Tests use isolated profiles, synthetic transcripts and ephemeral loopback receivers;
they do not upload the user's usage or consume model tokens.
