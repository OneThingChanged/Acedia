# OKF Update Log

## 2026-09-23

* **1.8.1.23 worker settings**: Independent provider/model/effort selection for Markdown and HTML, `gpt-6-luna / max` legacy defaults, a full model dropdown and custom IDs. Local launches use immutable role layers. Electron interaction/reload/narrow-layout and installed CLI strict-config checks passed without live model requests. See [release scope](release-1-8-1-23.md).

## 2026-09-22

* **1.8.1.22 EXE preparation**: Versioned the native account pool and included the pending Hosting/video source changes. Release builds use an isolated source checkout and reuse the verified 1.8.1.19 APK. Packaged checks enforce native account modules and reference-file exclusion. See [release scope](release-1-8-1-22.md).

* **Acedia account pool (source only)**: Added owner-only account registration and usage in the existing Dashboard, device-code login, encrypted account storage, session affinity and native HTTP streaming. Replaced the external connection settings. Reference folders are excluded from Git and packaging. All 767 tests, frontend build, installed CLI mock streaming and real Electron desktop/mobile registration checks passed. Live account requests and release packaging remain unverified. See [account pool](account-pool.md).

* **Remote video playback (1.8.1.21 source only)**: Added MP4/WebM chat previews and Documents entries, disk streaming with HTTP Range/HEAD, and PWA cache v67. Focused tests and real Electron WebM playback/seek checks passed. See [Remote service](remote-service.md). Deployment and Android device verification are separate.

## 2026-09-21

* **Remote Hosting / 1.8.1.20 source**: Added saved local HTTP pages beside Documents and Usage, sandboxed HTML/assets preview, mobile navigation, expiring links and server-error feedback. Actual Electron 1280px/390px UI, relative assets and DOM isolation passed. The supplied DNF server on 4410 was offline during verification. See [source notes](release-1-8-1-20.md) and [Remote Hosting](remote-service.md#hosting-18120-source-publication-pending). EXE publication is pending.

* **1.8.1.19 release preparation**: Desktop suite passed 766 tests; mobile typecheck and 24 tests passed. User requested a newly built Android APK alongside the EXE; Android versionCode increases to 19. See [release notes](release-1-8-1-19.md). Package validation and publication are tracked separately.

* **Local HTML reopen refresh**: Reopening a document renews its preview and loads the latest file in the reused browser tab. Opening an already mounted document also triggers a fresh read. Electron preview smoke verified changed HTML and relative JavaScript, expired-token recovery and exclusion of external browser records. Source change only; installed EXE update is separate.

## 2026-09-19

* **1.8.1.18 EXE preparation**: Combined wrapped terminal file links with the external provider connection. Real xterm pointer clicks passed on both rows of hard/soft-wrapped image and Markdown paths. EXE packaging reuses the verified APK; publication and local installation are tracked separately. See [release notes](release-1-8-1-18.md).

* **External provider connection (unreleased)**: Added opt-in server settings, Windows-encrypted API keys, model-catalog probes and invocation-local Codex provider overrides. The external server owns routing and accounts. Focused tests, real Electron UI/IPC/encryption smoke and an installed-CLI catalog request against a loopback fixture passed; live pool routing and deployment remain unverified. See [connection behavior](account-pool.md).

## 2026-09-17

* **1.8.1.17 composer keys**: Aligned Remote with desktop chat: Enter sends, Ctrl/Cmd+Enter inserts a newline even with autocomplete open. Added IME composition guards, localized hints and Remote cache v65. See [release notes](release-1-8-1-17.md). EXE publication is tracked separately from source validation.

## 2026-09-15

* **1.8.1.16 source handoff**: Consolidated browser extensions/skill, Antigravity IPC validation and deletion-focus changes. Final full suite: 123 files / 737 tests passed; previous collector-distribution failures remain recorded without claiming a collector fix. TypeScript and OKF validation passed. [Source notes](release-1-8-1-16.md) explicitly separate Git delivery from pending EXE publication.

* **Browser beside conversation (unreleased)**: Added `browser_show` and `browser_open` placement, with right-side splitting and existing-tab reuse. Bundled the `acedia-browser` skill and local helper for automatic installation in each launched Codex account home. Skill validation, helper transport, 84 focused tests, production frontend build and Electron show-event bridge passed.

* **Browser extensions (unreleased)**: Added profile-specific unpacked extension registration, enable/disable/removal, automatic loading when a profile opens and retryable load errors. Real Electron content-script isolation and settings UI smoke passed. See [browser preferences](browser-preferences.md).

* **Deletion input focus**: Removed remaining native project/folder deletion confirmations and blocked-deletion alerts. Guarded surviving-pane deferred focus and stopped late deletion cleanup from clearing newly opened menus. Electron cancellation/confirmation and real pointer/select checks passed. See [workspace interactions](workspace-interactions.md).

* **1.8.1.15 release preparation**: Built and verified exact Antigravity conversation recovery in the EXE channel. Packaged bridge/lifecycle and source equality passed; see [release notes](release-1-8-1-15.md).

* **Antigravity automatic recovery**: Capture exact conversation IDs through the authenticated status-line bridge and persist per-agent ownership. Resume with `--conversation`, reject old launch reports and never choose another folder conversation. Verified the live CLI recovery path and session-index persistence; see [integration](gemini-cli.md).

* **1.8.1.14 release preparation**: Documented Antigravity quota setup and refresh limits; verified EXE build, packaged bridge/lifecycle and packaged collector/renderer equality. See [release notes](release-1-8-1-14.md).

* **Antigravity quotas**: Connected official CLI status-line quota snapshots to desktop and Remote usage summaries. Added Gemini five-hour/weekly status-bar display, stale-data messaging and preservation of custom status-line commands. Verified real local quota receipt and Electron UI; see [Antigravity integration](gemini-cli.md).

## 2026-09-14

* **1.8.1.13 release preparation**: Built the Gemini removal EXE, verified packaged bridge/lifecycle and source equality, and recorded installer metadata in [release notes](release-1-8-1-13.md). Full suite: 718 tests passed.

* **Gemini CLI removal**: Removed the tool from desktop settings and creation menus and the Remote catalog. Preserved existing sessions with an explicit restart error directing users to a new Antigravity session. Local CLI installations remain untouched.

* **1.8.1.12**: Consolidated Gemini/Antigravity setup, personal-account migration, terminal-only boundaries and Dashboard/Remote scroll behavior in [release notes](release-1-8-1-12.md). Verified 717 tests and Electron launch/Remote UI smoke checks.

* **Antigravity CLI**: Added the separate `agy` tool after confirming Gemini CLI's personal-account service retirement. Installed Antigravity 1.2.2 locally and verified executable help/version and 47 focused tests.

* **Dashboard/Remote chat scrolling**: Preserve bottom-following and history reading position through message submission, composer layout changes and chat rerenders. Added desktop/mobile Electron smoke coverage.

* **Gemini CLI sessions**: Added tool selection, settings/installation detection, local launch defaults, SSH command handling and Remote session creation. Documented terminal-only integration boundaries in [Gemini CLI](gemini-cli.md).

* **1.8.1.11 release preparation**: Verified 710 tests, production build, PTY/color smoke, packaged bridge/lifecycle and packaged source equality. Recorded artifact and verification scope in [release notes](release-1-8-1-11.md).

* **Release terminal colors**: Removed the development-only guard from PTY `NO_COLOR` cleanup. Added release-condition regressions for Codex, Claude and shell sessions, including mixed-case Windows keys and preservation of the source environment. See [Development and build](development-and-build.md).

* **Child Git repositories**: The right sidebar now discovers child repositories even under a non-Git project root, including worktree Git files. Documented scan exclusions and limits in [Workspace interactions](workspace-interactions.md). Three discovery tests and TypeScript checking passed; installed-app UI verification remains pending.

## 2026-09-13

* **1.8.1.9 source preparation**: Added shared USD baseline pricing, Remote token/USD comparison, central day/week/month charts and dated AI/model/effort breakdowns. Period selection scopes employee/account details; names navigate to detail views. Folded secondary summaries, skills and raw period tables. Local server updated; product release not published. See [cost comparison](usage-cost-comparison.md).

* **USD baseline comparison**: Consolidated central-server and Remote cost comparison documentation in [API 단가 기준 환산액](usage-cost-comparison.md). Recorded two-decimal display, full-precision aggregation, unsupported-record coverage, quota separation and validated local/source scope; no product release performed.

* **1.8.1.8**: Added local worker log viewing and a separate right-aligned session toolbar. Added automatic collector login switching with historical attribution preserved, plus session/turn grouping and metadata backfill. User confirmed the development toolbar layout.

## 2026-09-12

* **1.8.1.7 preparation**: Documented final collector scope, large-line recovery, central employee details, runtime metadata, session path search and tab-drag behavior. Full suite: 696 tests passed. Release evidence is recorded separately.

* **Dashboard information hierarchy**: Removed duplicate overview blocks from account/employee lists and the redundant daily chart. Account rows combine usage and quotas. Detail views omit repeated account identity and collapse PC/IP metadata while preserving period analysis and event pagination. Verified navigation, breakdown values and responsive behavior with the Electron UI smoke.

* **Per-request token breakdown**: Recent history now separates uncached input, cache input, output/reasoning and request total, with cache writes shown when present. Exposes stored counters only, preserves totals and marks unavailable details explicitly. Verified counter mapping and missing values with API and Electron UI checks.

* **Calendar usage analysis and pagination**: Added daily/weekly/monthly full-period tables with Korean calendar boundaries, account/employee/device scoping, 90-day/year ranges and 12-row pages. Recent events now use 25/50/100-row pagination within the latest-500 window. Verified 28 focused tests, totals beyond 500, employee isolation, calendar boundaries and Electron UI controls.

* **Temporary local test access**: Added explicit loopback-only `--local-test-no-login` startup mode with automatic dashboard entry. Normal authentication remains the default, and authenticated device requests retain employee scope. Verified 25 focused tests, normal UI smoke and live automatic entry.

* **Central account detail page**: Account links now replace the central list with a wide detail page containing usage KPIs, account metadata, quota cards, employee percentages and sender history. Preserved period/filter and back/sidebar navigation; verified light/dark desktop and 390px mobile layouts with the Electron UI smoke.

* **Correct employee account usage percentage**: Corrected the denominator to all employees' usage of the same account in the selected period. Cards now show employee tokens, account-wide tokens and percentage; verified 140 / 980 = 14.3% and period/filter behavior. Employee-scoped responses expose allowed shared-account totals without other employees' event details.

* **Employee account shares and personal default**: Added descending per-account token/share cards and inline employee-table percentages. Percentages use the employee's full-period total across all accounts even when kind-filtered. Unregistered legacy mappings now count as personal; only explicitly registered shared logins count as shared. Verified 24 focused tests plus multi-account, other-employee, filtered, zero-usage and desktop/mobile UI cases.

* **Usage server operations guide**: Documented source/runtime/package locations, standalone startup, protected-key access, employee/account registration, server login matching, themes and database preservation. Linked the guide from the knowledge index and collector integration document; distinguished local validation from outstanding deployment work.

* **Server account registry and dashboard themes**: Added editable login-email/fingerprint registration, server-owned shared/personal classification and matching for new usage/quota reports. Retained historical attribution and enforced personal ownership and duplicate-registration checks. Added persistent system/light/dark themes across login, dashboard, registration and detail views.

* **Windows-user usage breakdown**: Added Windows usernames and token subtotals to account/employee tables, with full-period PC/IP breakdowns in detail drawers. Historical missing metadata remains unassigned. Verified 20 focused tests, including totals beyond 500 events and employee isolation, plus desktop/mobile UI checks.

* **Usage dashboard, account limits and sender identity**: Matched the approved sidebar/card/chart/detail layout; added account email/fingerprint, live Codex account-only quota refresh, stale/mapping-conflict states, and Windows username/PC/local-IP metadata with historical event snapshots. Verified actual account quota and sender metadata on the local receiver, plus 683 tests, app build and desktop/mobile UI checks. Local login is now `admin` at the user's request. See [account and device reporting](central-usage-collector.md).

* **Codex collector live verification**: Installed the native plugin in an isolated profile, called its MCP tool, and matched 113,530 actual CLI tokens with server storage. Added an independent Windows watcher for final records after CLI teardown and a pause/shutdown regression test. Packaged a separate Node receiver/dashboard on port 3007. Claude is excluded from this delivery at the user's request; ordinary ChatGPT chat metering remains unsupported. See [validation and boundaries](central-usage-collector.md).

* **Central usage collector pilot**: Added a separate explicit-opt-in Codex/Claude Code collector, SQLite outbox/lease, authenticated company receiver/dashboard, Acedia settings, standalone CLI and generated provider plugin packages. Employee identity is bound by device enrollment; shared/personal accounts use explicit mapping. General ChatGPT/Claude chat token metering and consumer-host OAuth remain unimplemented. See [scope and operation](central-usage-collector.md).

* **Acedia 1.8.1.6 — Remote readability and app language**: Enlarged the shared Remote/Local Dashboard typography, controls, usage cards and chart labels at normal browser zoom. The coordinator now propagates the resolved desktop language to open pages and sign-in; dates/counts follow that locale while names, conversations and drafts stay intact. All 661 tests in 111 files, the production build and hidden Electron checks at 1920, 1280 and 390px passed. The UI checks cover six locale settings, populated usage history, account visibility and draft preservation. Product and Android source versionName advance to 1.8.1.6; npm remains 1.8.1. No installation package was created or release published for this source commit. See [Remote display behavior](remote-service.md) and the [verification record](remote-ui-review-2026-09-12.md).

* **Acedia 1.8.1.5 — EXE release preparation**: Consolidated default account selection, live per-account quota refresh and large HTML preview support with the previously committed startup/configuration fixes. All 657 tests in 110 files, account/properties/document/launch UI checks, the production build and packaged runtime/lifecycle checks pass. The installer version, 120,276,496-byte size and SHA-256 match `latest-exe.json`; inspected packaged services match the source. Product and Android source versionName advance to 1.8.1.5, npm stays 1.8.1 and the verified 1.8.0.1 mobile APK is reused. Updated concept/index links and corrected the Standard EXE integrity description; OKF validation reports no errors or warnings. See the [release record](release-1-8-1-5-2026-09-12.md).

* **Large desktop HTML previews**: Removed the obsolete 2MB entry-size gate from the streaming desktop preview service. Reproduced the failure with a 5,187,103-byte local report and verified that it renders after the change. The focused service tests cover full multibyte transfers, HEAD length, linked HTML/assets and existing path/expiry checks; a dedicated hidden Electron document smoke checks large-page rendering, relative scripts, interaction and renderer isolation. See [HTML preview behavior](embedded-browser-mcp.md).

* **Refresh quotas for every registered account**: Footer Refresh and the new Refresh all accounts action query each Codex/Claude account independently, including idle and hidden accounts. Codex uses account-only app-server RPCs with isolated login environments; partial failures retain cached figures and display explicit retry or login states. Concurrent refreshes are deduplicated, passive reads cannot discard a live response, and helper processes have bounded lifetimes. All 656 tests, the production build and properties UI at three sizes pass; live quota reads succeeded for the default Codex login and both registered additional accounts. Claude failure and mapping checks use fixtures. See [account quotas](properties-and-usage.md).

* **Default account selection from the account list**: Added a direct Set as default action to the Existing login (Default) row and ready registered Codex/Claude rows. Selection rechecks account readiness and shares the existing new-session defaults store, with synchronized badges and dropdowns. Hidden Electron checks cover returning to Default, choosing a registered account again, failed saves, preserved session/launch settings, reload and cross-window synchronization; 18 focused tests and the production build pass. See [account registration](account-registration.md).

* **Acedia 1.8.1.4 — terminal startup and configuration refactor**: Moved local/SSH launch preparation from the main process into a testable launcher, shared account selection with transcript lookup, and consolidated managed configuration writes into one queue. Reproduced and fixed read-error/invalid-JSON settings replacement, SSH reverse-port reservation leaks on option errors, and pending launches surviving full terminal teardown. Added 24 regression and launch-boundary cases; all 645 tests in 108 files, the production build, source bridge/lifecycle checks and advanced-launch UI/native/shim checks pass. The source commit advances the product and Android source versionName to 1.8.1.4; npm remains 1.8.1. No APK is rebuilt and no release is published. See the [review record](terminal-launch-review-2026-09-12.md) and [architecture](system-architecture.md).

* **Acedia 1.8.1.3 — account-home browser MCP transport**: Fixed secondary Codex accounts failing with `invalid transport` when the launch override enabled a server that was defined only in another configuration layer. Before every local Codex start, Acedia now merges the complete dormant browser MCP transport into the selected account's own `CODEX_HOME`, preserves its credentials and other settings, and then enables that transport only for the Acedia session. Existing registered account homes were repaired in place with same-folder backups. All 621 desktop tests, the 607-module production build, account and advanced-launch smoke tests, packaged runtime checks, and packaged lifecycle checks pass. Real Codex CLI configuration checks also cover both registered secondary account homes. Product and Android source versionName advance to 1.8.1.3 while npm remains 1.8.1; the installer and update manifest agree on size and SHA-256. See the [release record](release-1-8-1-3-2026-09-12.md) and [embedded browser behavior](embedded-browser-mcp.md).

* **Acedia 1.8.1.2 — browser MCP launch isolation**: Managed Codex project configuration now keeps the Acedia browser MCP entry disabled at rest and enables it only on local Codex commands launched by Acedia. Ordinary Codex launches no longer try to import an undefined `MULTIAGENT_MCP_SCRIPT`, while Acedia sessions still receive the authenticated port, token, agent ID and script path through their PTY environment. All 620 desktop tests, the frontend build and native/batch PowerShell launch checks pass. Product and Android source versionName advance to 1.8.1.2; npm remains 1.8.1 and the existing signed APK is reused. Packaged runtime and lifecycle checks pass; the installer and update manifest agree on size and SHA-256. See the [release record](release-1-8-1-2-2026-09-12.md) and [embedded browser behavior](embedded-browser-mcp.md).

* **Store isolation test correction / source 1.8.1.1**: The Store runner correctly placed its isolated checkout below `%LOCALAPPDATA%`, exposing a shared-profile test that rejected any absolute path containing the directory name `AppData`. The test now verifies that the result is exactly `.acedia/shared-v1` below the supplied user home, which preserves the real production boundary while remaining valid in isolated build locations. Runtime behavior is unchanged. The already published GitHub 1.8.1.0 assets remain intact; the corrected source advances to 1.8.1.1 and Store packaging continues as 1.8.3.0.

* **Acedia 1.8.1.0 release**: Grouped account rename/removal with safe default-account recovery, single-account footer quota selection, fresh-account work handoff and simultaneous split browsers into one release. Product and Android source versionName advance to 1.8.1.0 while npm metadata advances to 1.8.1; the existing signed APK remains bundled as 1.8.0.1 because this is a desktop-only GitHub build. All 620 desktop tests, 24 mobile tests, mobile typecheck, frontend build, account/properties/layout/launch/browser/settings/bridge smokes, packaged runtime and packaged lifecycle checks passed. The local EXE and `latest-exe.json` agree on size and SHA-256; Authenticode status is NotSigned. Microsoft Store uses 1.8.3.0 because 1.8.2.0 is already published. See [release record](release-1-8-1-0-2026-09-12.md).

* **Fresh-account work handoff**: Session properties now offers a default-enabled handoff when a local Codex or Claude session changes to an account without a saved conversation. The app builds a bounded prompt from recent user/assistant text, excludes reasoning and tool output, persists it until provider startup confirms a session ID, and passes it as one safely quoted first CLI argument. Scoped lookup still resumes an existing target-account conversation without injecting the handoff. Unit, account onboarding, properties at three sizes, advanced-launch native/batch PTY and workspace lifecycle checks passed. Live provider execution remains a user verification step. See [Codex account profiles](codex-accounts.md) and [Claude account profiles](claude-accounts.md).

* **Simultaneous split browsers**: Removed the main-process rule that hid every sibling `WebContentsView` whenever one browser activated. Mounted split panes now retain independent visibility and bounds, while inactive tabs, Settings and overlay blockers still hide their own views. Browser profile/background smokes, the frontend build and the full unit suite passed; the exact two-pane visual result remains for interactive confirmation. See [embedded browser behavior](embedded-browser-mcp.md).

* **Single account in the status bar**: Consolidated account quotas into Agent usage, opened from the single footer account. A radio choice selects the displayed account by ID; selection survives renaming, workspace reopening and window synchronization. Removed or hidden accounts fall back to an available default, provider filters constrain selection, and pending quotas remain explicit. Verified in the 1.8.1.0 release suite with account UI at three sizes, status preferences and cross-window restoration. Updated [properties and account usage](properties-and-usage.md).

* **Account rename and removal**: Added inline rename and removal confirmation to Codex and Claude account rows. Removal returns bound sessions and a matching new-session default to Existing login, stops affected local sessions, cancels pending login and clears old resume/group pins while preserving provider-owned files. Durable removal markers repair startup and stale-window writes; default login and unrelated accounts remain protected. Verified both providers with isolated account UI, real PTYs and App event/storage regression checks. See [account registration and management](account-registration.md).

## 2026-09-11

* **Acedia 1.8.0.19 — registered account quotas**: Registered Codex and Claude accounts now appear individually even before a session or quota snapshot exists. Missing quotas show a pending message without invented percentages. The footer retains its 28px height and provides horizontal navigation when accounts exceed available space. Legacy folder-label profiles, unregistered accounts and manually hidden profiles remain available in the account review area; explicit visibility choices override the default classification. Codex scans retain at least one candidate per account represented in the sources. All 596 tests, the frontend build, six-account desktop checks at three sizes, desktop/mobile Remote checks, workspace layout regressions and 105 settings search targets passed. Tests use isolated fixtures; live account OAuth and provider usage requests are outside this verification. Product source version advances to 1.8.0.19; this local commit includes no installer, push or deployment. See [account display rules](properties-and-usage.md).

* **Acedia 1.8.0.18 — properties and account quota display**: Added responsive 1120px session/project dialogs, fixed actions, wrapping paths, focused navigation and explicit session-option saves with dirty-draft and concurrent-edit protection. Project history separates current records from past conversations and retains active-session deletion guards. Account/model quotas are grouped by profile ID, with unused profiles in a separate review area and reversible visibility shared by desktop and Remote/PWA. 592 tests, the frontend build, properties UI at three sizes, existing settings/layout/launch checks and remote desktop/mobile quota HTTP checks passed. SQLite tests verify persistence and unchanged snapshots/source history. Product source version advances to 1.8.0.18; no installer or mobile package is published by this source commit. See [properties and quota display](properties-and-usage.md).

* **Acedia 1.8.0.17 — hidden status bar layout**: Reproduced the full workspace collapsing into horizontal flex children when the bottom usage bar was disabled. Desktop grid layout now remains active independently of footer visibility; hiding the bar removes only its 28px row. All 586 tests and a real App renderer regression passed at 800×640, 1202×801 and 1920×1080, covering both settings switches, side panels, hidden-state reload and preserved split panes/session records. [Status bar settings](status-bar-settings.md) records the behavior and verification scope.

* **Acedia 1.8.0.16 — EXE update address compatibility**: Reproduced an update-check failure after the official repository was renamed. EXE update discovery now uses the current product repository and accepts exact release asset paths under its current and previous names, while retaining tag, filename, size and hash checks. All 586 tests and a live update check against the existing public release passed. Existing installations with the previous URL restriction require one manual installation of the new EXE. This revision includes the settings work through 1.8.0.15; Store delivery remains separate.

* **Settings documentation consolidation**: Grouped settings guides in the index, corrected the Commands & startup navigation label, updated the current search count to 105 and added project-selection scope. The combined review guide now maps all six implementation commits to feature documents and records the final verification commands, results and remaining manual checks. This documentation-only update retains product version 1.8.0.15.

* **Acedia 1.8.0.15 — idle session suspension**: Added opt-in idle suspension for completed local Codex/Claude sessions, with visibility/ownership/activity/generation guards and exact account-scoped transcript verification. Suspended sessions preserve launch options and resume only the verified conversation. 583 tests, build, native ConPTY suspension/recovery checks, standby-click renderer checks and 105-target settings UI checks passed. [Idle sessions](idle-sessions.md) and the [combined review guide](settings-review-1-8-0-15.md) record scope and manual follow-up.

* **Acedia 1.8.0.14 — status bar configuration**: Added provider/account-group filtering, used/remaining quota display and resource/port visibility. Display changes preserve consumption warning colors. 558 tests, build, 103-target UI search/layout and native renderer filtering, percentage, monitor removal, restoration and two-window sync checks passed. See [status bar settings](status-bar-settings.md).

* **Acedia 1.8.0.13 — notification conditions and power**: Added saved completion/bell/focus conditions, explicit alert testing and shared system sleep prevention. Real Electron blocker activation/release, multiple-work lifecycle, OSC-safe bell parsing, 556 tests, build and 95-target UI checks passed. See [notification and power settings](notifications-and-power.md).

* **Acedia 1.8.0.12 — saved commands**: Added global/project command editing, explicit new-shell execution, target folder/host labels and opt-in once-per-app project startup. Native IPC/ConPTY verified execution location and duplicate startup protection; search/editor UI and scoped-command tests passed. See [saved commands](saved-commands.md).

* **Acedia 1.8.0.11 — browser profiles**: Preserved the existing cookie partition and added named profiles, default/explicit new-tab selection, profile labels and MCP profile selection. Optional web-tab restoration preserves IDs and profiles while omitting preview/authentication URLs. Two separate Electron processes verified isolated cookies and restored pages after restart; profile, search/layout and runtime integration checks passed. See [browser settings](browser-preferences.md).

* **Acedia 1.8.0.10 — browser defaults**: Added shared home page, address-bar search engine, zoom and app web-link settings with explicit saves and stale-window conflict rejection. Unit tests (550), frontend build, 85-target search UI/layout checks and native Electron browser settings integration passed. See [browser settings](browser-preferences.md).

* **Acedia 1.8.0.9 — individual settings search**: Added option-level search, provider/category navigation, collapsed-section expansion, highlighting and shared scope labels. The default catalog connects 81 targets and derives shortcut entries from the command registry. Searches exclude user values, respect channel and worker availability, and preserve settings and workspace state. All 548 desktop tests, the frontend build and Electron search checks passed, including 81 navigation targets, keyboard/IME behavior, three window sizes, and focus preservation during account status refresh. Existing account, terminal and advanced-launch checks also passed. Product and Android source versionName metadata advance to 1.8.0.9; npm stays 1.8.0 and Android versionCode stays 18 because the EXE build reuses the previously verified APK. The Windows x64 EXE build, packaged bridge/dashboard and lifecycle checks passed; installer file version is 1.8.0.9 and Authenticode status is NotSigned. The EXE manifest matches the installer size and SHA-256. See [settings search](settings-search.md).

* **Acedia 1.8.0.8 — account registration flow**: Connected display-name entry, browser login, result review and new-session default selection for Codex and Claude. Retries keep the existing profile; cancellation and timeout have separate results. Stored email is shown separately from the display name without claiming live identity verification. All 544 desktop tests, frontend build, account onboarding and existing account/settings Electron checks passed, including window synchronization and page-reload persistence. Real provider OAuth and installed-package rollout remain outside this source change. Product and Android versionName metadata advance to 1.8.0.8; npm stays 1.8.0 and Android versionCode stays 18 because no APK was rebuilt. See [account registration](account-registration.md).

* **Acedia 1.8.0.7 — local advanced launch settings**: Added CLI path selection, individual argument rows and environment editing to agent defaults, new-session/project creation, and existing session properties. Defaults are copied at creation; existing sessions change only through explicit edits and apply on reopening. Protected account/terminal variables and managed arguments are checked at both UI and launch boundaries. All 533 desktop tests, the frontend build, Electron bridge check, hidden Electron editing/persistence, and real ConPTY input/output checks passed. Windows PowerShell 5/7 native and batch argv retain spaces, quotes, and special characters. SSH editing and installed-package rollout remain outside this source change. Product and Android versionName metadata advance to 1.8.0.7; npm stays 1.8.0 and Android versionCode stays 18 because no APK was rebuilt. See [launch settings](agent-launch-options.md).

* **Acedia 1.8.0.6 — accounts, settings and terminal colors**: Added independent Claude account profiles and per-session selection, with account-scoped conversations, hooks and quota snapshots. Settings now covers the workspace and returns to preserved sessions through Back to app or Escape. The Terminal panel controls fonts, line height, cursor, scrollback and clipboard behavior; live views, new terminals and window storage events share the same preferences. Development launches clear inherited NO_COLOR at both startup and PTY creation, and renderer loading tolerates a restarting development server.
* **Validation and source version**: All 519 desktop tests, frontend build, hidden Electron account/settings and terminal checks passed. An isolated CLI check and an actual resumed conversation verified color restoration; the user confirmed the displayed colors. Existing session identifiers were preserved. Real simultaneous multi-account OAuth/model requests and installed-package rollout remain unverified. Product and Android versionName metadata advance to 1.8.0.6; npm remains 1.8.0 and Android versionCode remains 18 because no APK was rebuilt. This source commit includes no installer or deployment.

## 2026-09-10

* **Remote image submission, source 1.8.0.5**: Replaced the 80ms paste-to-Enter gap with a 500ms minimum plus observed PTY output and 250ms quiet time, bounded at 3 seconds. Concurrent composer writes on the same PTY are rejected before input; post-write uncertainty retains the request ID to prevent replay. Added regression cases for delayed output, missing output, target loss and paste-burst Enter suppression. 494 tests, frontend build and a real Codex CLI 0.153.4 integration smoke passed: PNG upload through the loopback PWA API initiated a local mock model request, with one Enter even after HTTP retry. The earlier timing did not fail deterministically in the isolated CLI; the user's exact recurring environment remains unverified. Existing EXE/Store packages have not been replaced.

* **Shared EXE/Store data, source 1.8.0.4**: Added a common profile outside MSIX AppData virtualization, explicit Chromium sessionData selection, and a cross-channel process lease. First use copies the most recently modified profile, unions project/session catalogs and accounts, retains secondary profiles/archives, and leaves originals intact. Locked or damaged source data stops migration; copied default databases receive SQLite quick_check. Separate SQLite archives are preserved rather than automatically merged. 487 tests and the frontend build passed; an Electron smoke verified cross-channel project/theme persistence, second-channel exclusion and live-profile migration rejection. Standard and Store runtime bridge smokes passed. Existing public EXE and Store builds have not been replaced by this source change.

* **EXE GitHub channel / 1.8.0.3**: Restored Standard as a public EXE channel with four-part GitHub release selection, exact repository/asset validation, streamed SHA-256 verification and session-saving installation. Store identity/data/updater remain isolated. Added desktop-only packaging with an independently verified existing mobile APK and latest-exe.json output. Source tests: 480 passed; EXE build and packaged/lifecycle smokes passed. Windows installer version 1.8.0.3; Authenticode NotSigned. Existing signed mobile APK 1.8.0.1 is bundled independently.

* **Git source revision 1.8.0.2**: Committed Store API recovery fixes, workflow documentation and privacy ignore rules. Source product version advances from 1.8.0.1 to 1.8.0.2; npm remains 1.8.0. No installer/APK rebuild or new Store submission is part of this Git upload; Android versionCode stays unchanged. Store 1.8.2.0 remains a separately built release.

## 2026-09-09

* **Store workflow and privacy documentation**: Added an operational playbook covering request scope, DPAPI setup, isolated builds, API submission, status interpretation and same-run recovery. Replaced personal account/path details in Store documentation with local configuration references. Added ignore rules for copied credential XML, signing keys, private Store exports, API request/response files, state copies and portal evidence screenshots. Recorded the observed Certification state for 1.8.2.0. Ignore rules do not erase previously committed history.

* **Store 1.8.2.0 API commit accepted**: Verified Acedia in both portal Product name selectors without editing the API draft. Recorded exact-submission/request/artifact-bound screenshot evidence for the MultiAgent readback alias; other metadata remains strictly compared. Reused the verified package, completed Blob upload and issued commit once; API returned CommitStarted, with immediate publication configured and Monitor tracking. Automation tests: 19 passed. Publication and Store installation remain unverified.

* **Store 1.8.2.0 API release attempt**: Built isolated Standard 1.8.0.1 source with 474 tests, Electron/packaged/lifecycle checks and WACK overall PASS. API authentication and prior 1.8.1.0 publication are verified. Created draft 1152921505701838121 and saved metadata; upload/commit stopped because GET returns MultiAgent instead of Acedia in both listing titles despite PUT echoing Acedia. Added a narrowly scoped free-price read-only flag normalization (18 automation tests passed), preserving title/price/market checks. [Release record](store-release-1-8-2-0-2026-09-09.md).

* **Standard 1.8.0.1 release preparation**: Grouped settings/languages, Codex Store path fix, browser uploads/downloads/history/background control, Remote refactor/reliability, and Store release tooling into one source revision. Product and mobile versionName advance to 1.8.0.1, npm stays 1.8.0, and Android versionCode advances to 18. Windows installer/APK build and packaged validation follow this commit; no Store submission or GitHub publication is requested.

* **Background AI browser control**: Disabled automatic MCP tab reveal, placed AI-created tabs on the hidden host, and changed screenshots to CDP viewport capture without showing the native view. Regression tests and an isolated Electron hidden-navigation/input/screenshot smoke passed without show/focus events. Manual tab selection remains available; installed-app rollout is pending.

* **Embedded browser downloads and history**: Added native save-dialog download tracking, progress/cancel/folder actions, searchable persistent visits, and record deletion without file removal. Browser panels hide the native view while open. Focused tests, build, and real Electron download/persistence smoke passed; installed Store verification and rollout remain pending.

* **Remote submission and recovery reliability**: Preserved newer composer drafts and attachments, locked concurrent submissions, added durable request-ID deduplication to both HTTP servers, paused failed queue heads for explicit retry, and bounded state requests with latest-response ordering. All 470 app tests and desktop/mobile composer smoke passed. Updated worker cache to v61; installed/public-tunnel rollout remains pending.

## 2026-09-08

* **Store Codex account login path**: Reproduced 1.8.1.0 passing a virtual AppData home that external Codex cannot see. Added native physical-home resolution for extra accounts and fixed safe failure-reason reporting without exposing OAuth output. The installed package identity confirmed ordinary/native realpath differ, and corrected external CLI status no longer failed on the home path. Tests (465) and build passed. Browser OAuth completion and updated Store binary rollout remain pending; no release/version change is included.

* **Remote PWA structure refactor**: Separated chat markup, DOM rendering, history merging and common DOM helpers into native browser modules; direct imports replace source-slicing helper tests. Extracted project document/preview handling and shared JSON framing from the web server, replacing duplicate Dashboard/Remote document routes with one dispatcher behind the existing access checks. Updated static asset serving and service-worker cache v60. All 463 tests passed; the new Electron PWA smoke passed at desktop/mobile widths with chat, document links, module loading and worker activation. No package deployment/version change is included.

* **Store Submission 5 accepted**: Created draft 1152921505701833091 through Partner Center UI; the user uploaded 1.8.1.0 and the agent saved the validated replacement package, updated Korean/English release notes, and submitted for certification. Confirmed In certification and automatic publishing after approval. Publication/install verification remains pending. API credentials remain absent; the local CLI run must not be resubmitted.

* **Browser file upload tool**: Added `browser_upload_files` to the managed MCP bridge and native Chromium file-input selection for explicit host-local paths. Supports hidden inputs and multiple files; rejects invalid paths, directories, ambiguous/non-file/disabled targets. Distinguishes selection from server acceptance and preserves applied-but-unverified results for safe retries. Electron fixture smoke verified actual multipart bytes at a local HTTP receiver and snapshot redaction. Iframe/directory/OS-dialog automation and live Partner Center upload remain unverified or unsupported as documented. No release/version change in this implementation step.

* **1.8.1.0 Store build test**: Built an isolated settings/language release with source tests (458), Electron and packaged/lifecycle checks, settings UI smoke and WACK overall PASS. Preserved the optional Blocked executables warning. Fixed external-site submodule/example-file handling, WACK optional-test parsing and completed-local promotion (automation tests: 17). API submission was attempted but stopped before upload because Entra credentials are not configured. [Release record](store-release-1-8-1-0-2026-09-08.md).

* **Store release automation**: Added isolated source/version snapshots, Store API upload/commit/status, resumable local checks with exact-package WACK evidence, DPAPI credential setup and Windows worker/monitor task installers. Store build requests authorize certification and immediate publication after validation; build-only/draft-only remain bounded. Real API credentials, task installation and live end-to-end verification are still pending; no product was submitted by this implementation task. See [Store automation](store-release-automation.md).

* **Acedia 1.8.x release handoff**: Recorded the completed `1.8.0.0` GitHub release, current Partner Center Submission 4 draft and package hash, updated Store listings, pending certification decision, uncommitted language/settings UX work, channel boundaries, upload recovery procedure, and a safe next-session starting prompt. The Store draft has not been submitted for certification.

* **Additional UI languages**: Added Simplified Chinese, Traditional Chinese (Taiwan), Japanese, and Spanish to Language settings with native language names, prioritized system locale detection, script-aware Chinese resolution, and immediate persisted switching. Added translation catalogs for core settings, accounts, session/project forms, and workspace controls; untranslated legacy help/dynamic/backend messages fall back to English. Electron smoke verifies all four locales and persistence; Spanish layout was visually checked. User content is preserved. This change does not build an installer or increment the release version.

* **Language settings tab**: Moved application display language out of General into its own navigation tab and search entry. Existing immediate language switching and persistence are unchanged.

* **Per-tool agent settings**: Implemented the approved tabbed settings mockup with General/Codex/Claude/Qwen/Cline tabs, account cards, and persisted new-session defaults. New Session and New Project creation apply explicit account, permission, Alt-screen, and worker defaults without changing existing sessions. Tests (438), build, and the extended Electron account/settings smoke passed; visually checked the rendered Codex tab. No commit/version or installer change in this implementation step.

## 2026-09-07

* **1.7.3.3 local update**: User confirmed Codex account login/use in the development app. Built the Standard local installer and signed APK; npm remains 1.7.3 and Android versionCode is 16. Desktop tests (433), mobile tests (24), mobile typecheck, account UI/standby smoke tests, packaged runtime/lifecycle checks, and local update discovery from 1.7.3.2 passed. Windows installer file version is 1.7.3.3 and Authenticode status is NotSigned. Installation remains user-controlled.

* **Codex account profiles**: Added isolated local login homes, account management in Agents settings, account selectors for new and existing sessions, per-profile conversation recovery, and separate quota snapshots. Account bindings survive cold starts. Live account switching is blocked, stale startup generations are cancelled, and existing default-login behavior is preserved. Real two-account browser OAuth remains unverified; source/build and isolated tests are covered separately. No release or version bump is included in this implementation step.

## 2026-09-06

* **1.7.3.2 local update**: Released the standby eligibility correction as the next commit revision; npm remains 1.7.3 and Android versionCode is 15. Tests (422), the mixed standby/inactive Electron smoke, signed APK build, Standard installer build, packaged runtime/lifecycle checks, and local update discovery from 1.7.3.1 passed. Installation on the user's workspace is pending.
* **Standby eligibility correction**: Separated the terminal allocation guard from persisted standby intent. Only previously activated/standby sessions restore blue; never-started and explicitly deactivated sessions remain inactive. Existing records migrate from remembered running IDs, while explicit inactive flags override stale journal entries.
* **1.7.3.1 local build verification**: Built the signed Android APK and Standard installer with Windows file version 1.7.3.1. Desktop tests (417), mobile tests (24), lazy-session Electron smoke, packaged runtime/lifecycle checks, and local update detection from 1.7.3.0 passed. The installer remains Authenticode-unsigned; applying it to the user's installation is pending.
* **Commit revision policy / 1.7.3.1**: Minor changes now increment only the fourth product-version component per Git commit; repeated builds retain the version. Desktop and Android validators accept nonzero revisions, npm remains 1.7.3, and Android versionCode is 14. Documented the existing Company/Store channel constraints separately.
* **Start restored sessions on selection**: Removed the bulk reopen prompt and startup spawning loop. Saved layouts now show blue standby placeholders without xterm/PTY allocation, and only selected sessions start. Tray restoration uses host-confirmed live IDs. An isolated Electron split-pane smoke verified zero startup allocations and one spawn per selected session.
* **Local Standard update 1.7.3.0**: Synchronized desktop/mobile versions (Android versionCode 13), built the signed APK and Standard NSIS installer, and verified packaged runtime/lifecycle plus local update discovery from 1.7.2.0. Desktop tests (414), mobile tests (24), and mobile typecheck passed. Installer installation on the user's running workspace remains pending; this update has no new GitHub Release or Store submission.
* **Session deletion form focus**: Replaced blocking native session confirmation with an in-app modal and prevented delayed terminal focus recovery from interrupting forms. Build, focused unit tests, and an isolated Electron deletion/cancellation form-focus smoke passed; the installed-app reproduction remains unverified.

## 2026-09-04

* **Local Standard developer updates**: Separated Standard from GitHub updates, added a persisted output-folder picker and strict highest-version `MultiAgent-Setup-X.Y.Z.0-x64.exe` discovery, and routed installation through the session-saving close handshake. `1.7.2.0` is the final Standard GitHub transition release; later Standard builds are installed directly from local output while Store remains Microsoft-managed and Company retains its private GitHub updater.
* **Application language and Store replacement candidate**: Added persistent System default, Korean, and English UI language selection, synchronized the desktop/mobile/Store candidate to `1.7.2.0`, built and verified the production MSIX, and passed Store packaged runtime/lifecycle smokes. Submission 3 cancellation is confirmed and the draft is reusable; WACK, replacement upload, and resubmission remain pending.
* **Public support boundary**: Recorded Microsoft Store as the only public distribution channel, moved public Q&A and privacy endpoints to `MultiagentSite`, and retained private GitHub releases as owner-only/internal delivery.
* **Microsoft Store operations guide**: Added the Store-only build, verification, WACK, Partner Center, public-release, `runFullTrust`, troubleshooting, certification, and update runbook; recorded Submission 3 for public `1.7.0.0` as in certification.
* **Release 1.7.1.0**: Synchronized the GitHub live release version for the global Browser Hub, safe native-view switching, HTML browser reuse, matching HTML tab labels, and source-tab closure.
* **Explicit release scope**: Defined “live deployment” as Git/GitHub-only; Microsoft Store build and Partner Center submission now require a separate request while retaining the matching GitHub product version.
* **Global Browser Hub lifecycle**: Documented the application-wide browser catalog, session-independent tab access, duplicate HTML preview reuse, and closing the corresponding source web or HTML tab from the Hub.
* **Unified 1.7.0.0 baseline**: Set the public desktop, GitHub, Android, and Microsoft Store product version to `1.7.0.0`, above both the existing GitHub `0.6.27` release and Store `1.6.26.0` package. npm and Electron Updater use the derived compatibility value `1.7.0`, while all user-facing release identifiers use four components.

## 2026-09-03

* **Separated GitHub and Store updates**: Added explicit release commands for each channel and replaced Store builds' GitHub update controls with a Microsoft Store-managed state and product-page update action.
* **Private Store installation**: Confirmed that the certified `1.6.26.0` private-audience package installs and runs from Microsoft Store without an unknown-publisher warning.
* **Remaining Store rollout gate**: Public rollout stays blocked until version mapping, NSIS coexistence, policy edge cases, release sequencing, and a private higher-version upgrade are verified.
* **Release 0.6.27**: Synchronized the desktop and Android release versions for the state-aware embedded-browser form automation release.
* **Microsoft Store certification submission**: Recorded the validated `1.6.26.0` private-audience MSIX, completed Partner Center sections, `runFullTrust` rationale, in-certification status, and pass/failure follow-up checklists.
* **State-aware browser form automation**: Added semantic form snapshots, stable targeting, idempotent checkbox/radio/select operations, bounded postcondition waits, framework-compatible events, double-layer value redaction, and a real Electron fixture smoke.
* **Stable embedded browser lifetime**: Moved native `WebContentsView` destruction from transient React component unmounts to explicit browser-tab closure, preventing pane moves and layout reconciliation from leaving a visible but blank browser tab.

## 2026-09-02

* **Microsoft Store MSIX implementation**: Added an isolated Store runtime, exact-identity manifest rendering, fail-closed unsigned production packaging, local development signing, content/hash verification, packaged smokes, and administrator-only install/WACK entry points.
* **Store supply-chain boundary**: Excluded APKs, credential-like files, non-x64 node-pty payloads, and debug symbols from Store output; disabled Store runtime downloads of `cloudflared` while preserving PATH-based use.
* **Acknowledged web session creation**: Remote and local Dashboard creation now waits for coordinator validation, agent ownership, and actual insertion before returning success; disabled tools are synchronized into both web surfaces and failures remain actionable in the editor.
* **Remote conversation UX prototype**: Added single, split, and long-result review states with immediate result visibility, collapsible work logs, a tabbed right sidebar whose session status follows the active pane, non-disruptive event badges, and a mobile overlay drawer.
* **Reliable image-tagged Remote submission**: Wrapped multiline Remote messages in terminal bracketed-paste markers before sending a discrete Enter, preventing image paths from remaining unsubmitted in Codex or Claude prompts.
* **Remote UX reliability**: Isolated drafts and queues per session, added atomic same-origin message submission with failure recovery, enabled durable paged chat restoration, opened HTML hyperlinks directly, stabilized session navigation, paused hidden Android profile streams, and added managed Back routing.
* **Microsoft Store MSIX plan**: Recorded the deferred Partner Center prerequisites, isolated Store build, runtime migration, certification, security, and rollout gates without changing production packaging.
* **Readable chat timeline**: Documented provider-labelled assistant cards, transcript-ordered tool groups, richer Markdown hierarchy, and explicit latest-message navigation.
* **Tabbed session properties**: Documented separate basic-information, session-data, and launch-option panels with bounded independent scrolling.

## 2026-09-01

* **Persistent conversation store**: Documented session-isolated SQLite chat restoration, incremental transcript indexing, paged history, referenced artifacts, and verified configurable storage migration.
* **Session deletion input recovery**: Documented synchronous context-backdrop cleanup, atomic layout reference updates, and surviving-terminal focus restoration after confirmed or cancelled deletion.

## 2026-08-31

* **Electron-only runtime**: Removed the retired desktop host, its build dependencies, updater-transition signatures, manifests, storage command aliases, and renderer fallbacks.
* **Release simplification**: Defined Standard and Company Electron NSIS/YAML artifacts plus the signed Android APK as the complete release set.
* **Signing status clarification**: Recorded that Windows installers currently rely on updater SHA-512 integrity and are not Authenticode-signed; Android remains release-signed.

## 2026-08-30

* **Session JSONL catalog**: Documented project-scoped Codex/Claude transcript ownership, grouped storage totals, current-session properties, and metadata-only persistence.
* **Safe transcript deletion**: Recorded live-session protection and Recycle Bin deletion with post-delete catalog cleanup.
* **Native browser occlusion**: Recorded that React image overlays temporarily hide Electron browser views and resist delayed bounds updates before restoring the active tab.

## 2026-08-27

* **APK profile view sessions**: Recorded lazy per-PC WebView retention across Session Hub and profile switches, with deletion as the explicit teardown boundary.
* **Android Back order**: Defined active WebView history as the first destination and the native combined Session Hub as the fallback instead of exiting the app or expanding the toolbar.

## 2026-08-26

* **Visible browser automation**: Added a `+` control to every pane for opening Google in an embedded tab and made session-owned MCP browser actions reveal the affected tab while preserving its split placement.
* **Browser tab lifecycle**: Recorded that inactive native browser views remain alive but hidden, and ephemeral browser tabs are discarded during workspace restoration.
* **Remote focus boundary**: Clarified that Remote browser control updates the shared browser without stealing the desktop operator's current tab or focus.

## 2026-08-24

* **Remote shared browser**: Added an approved-session, same-origin-controlled browser relay with shared tab IDs, memory-only JPEG frames, scaled touch input, navigation, and explicit mobile text/key controls for desktop-local sites.
* **Remote HTML compatibility**: Rebound root-relative assets to the preview capability and added a dependency-free `index.json` renderer for Unreal Automation reports that omit their Bower runtime.
* **Browser startup ordering**: Recorded that the hidden shared browser profile and authenticated loopback broker start before restored AI sessions.
* **Codex MCP environment**: Documented the explicit stdio environment-variable allowlist that prevents the managed browser MCP from exiting before `initialize`.

## 2026-08-23

* **In-place conversion**: Converted the existing `docs/` tree into the canonical OKF v0.2 bundle instead of maintaining a duplicate `okf/` directory.
* **Deduplication**: Assigned one durable concept to each existing document and replaced repeated implementation, security, build, and lifecycle explanations with cross-links.
* **Source reconciliation**: Updated current-runtime claims to the production Electron sources.
* **Normalization**: Renamed concepts to lowercase kebab-case, redirected repository documentation links to `docs/index.md`, and removed the duplicate `docs/README.md` map.
