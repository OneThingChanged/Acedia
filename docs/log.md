# OKF Update Log

## 2026-09-11

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
