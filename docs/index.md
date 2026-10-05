---
okf_version: "0.2"
---

# MultiAgent knowledge

`docs/` is the canonical OKF v0.2 knowledge bundle for MultiAgent. Each linked
document covers one durable concept and points to the implementation or
configuration that supports it.

## Product and architecture

* [Product overview](product-overview.md) - Product goals, runtime shape, capabilities, and variants.
* [System architecture](system-architecture.md) - Electron boundaries, workspace model, layout invariants, and IPC rules.
* [Shared user data](shared-user-data.md) - EXE/Store common profile, migration, and single active channel.
* [Workspace interactions](workspace-interactions.md) - Navigation, sessions, panes, documents, source control, and notifications.
* [Session organization](session-organization.md) - Project relationship boards and folder references, parent/child session trees, setting inheritance and independent execution.

## Settings and review

* [Acedia 1.8.1.54 EXE release](release-1-8-1-54.md) - Send Codex async question alerts to the phone while work continues, with call deduplication and existing notification preferences.
* [Acedia 1.8.1.53 EXE release](release-1-8-1-53.md) - Project parents and folder references on a movable board; Codex async questions in desktop and Remote chat.
* [Acedia 1.8.1.52 EXE release](release-1-8-1-52.md) - Session token usage and API baseline costs with exact conversation ownership, parent/child totals and CSV export.
* [Acedia 1.8.1.51 EXE release](release-1-8-1-51.md) - Organize real parent/child sessions with setting inheritance, independent conversations and persisted creation provenance.
* [Acedia 1.8.1.50 EXE release](release-1-8-1-50.md) - Restore Git changes with bundled Git, scoped ownership/long-path settings and persistent retry; improve large Remote HTML previews.
* [Acedia 1.8.1.45 EXE release](release-1-8-1-45.md) - Open Dashboard usage from stored totals and collect large transcript histories in bounded background batches, prioritizing active sessions.
* [Acedia 1.8.1.44 EXE release](release-1-8-1-44.md) - Recover automatically assigned sessions after account exclusion, refresh token usage and improve embedded verification-page compatibility.
* [Acedia 1.8.1.43 EXE release](release-1-8-1-43.md) - Published highlighted terminal path boundaries; native clicks and public updater/assets verified.
* [Acedia 1.8.1.42 EXE release](release-1-8-1-42.md) - Open a local session's project folder from the tab context menu; release verification and publication record.
* [Acedia 1.8.1.41 EXE release](release-1-8-1-41.md) - Published compact project/session dialogs with expandable settings, persistent footer and keyboard support; public updater and all asset hashes verified.
* [Acedia 1.8.1.40 candidate](release-1-8-1-40.md) - Unpublished candidate and CI runner findings before the 1.8.1.41 release.

* [Acedia 1.8.1.39 notification changes](release-1-8-1-39.md) - Published EXE and signed APK with Acedia branding, quiet connection status and expandable final-answer previews; updated-phone verification pending.

* [Acedia 1.8.1.38 EXE release](release-1-8-1-38.md) - Resume queued messages after activation, align Remote session filters, refresh all account limits and clarify completion/token accounting.

* [Acedia 1.8.1.37 EXE release](release-1-8-1-37.md) - Separate blue Sleeping sessions from Active with saved sidebar filters, counts and search.

* [Acedia 1.8.1.35 EXE release](release-1-8-1-35.md) - Download original Markdown/HTML/JSON, images and videos from Remote previews, Documents headers and document actions.

* [Acedia 1.8.1.34 EXE release](release-1-8-1-34.md) - Change Codex/Claude session model and effort from Remote; keep waiting questions visible in desktop and Remote chat.

* [Acedia 1.8.1.29 EXE release](release-1-8-1-29.md) - Keep Remote session navigation open and name routed requests by project/session; show actual session account assignments and clarify stale quota readings.

* [Acedia 1.8.1.28 EXE and Android release](release-1-8-1-28.md) - Prevent accidental Remote page zoom while retaining touch scrolling.

* [Acedia 1.8.1.27 EXE release](release-1-8-1-27.md) - Remote full paths, account routing and login, and session server opening.

* [Acedia 1.8.1.26 EXE release](release-1-8-1-26.md) - Dashboard return flow and three-column account cards.

* [Acedia 1.8.1.25 EXE release](release-1-8-1-25.md) - Browser OAuth and device-code login for dedicated routing accounts.

* [Acedia 1.8.1.24 EXE release](release-1-8-1-24.md) - Multiple status-bar accounts with persistent checkbox selections.

* [Acedia 1.8.1.23 EXE release](release-1-8-1-23.md) - Independent worker model and reasoning selection; full model dropdown and custom IDs.

* [Acedia 1.8.1.22 EXE release](release-1-8-1-22.md) - Dashboard account routing, Remote Hosting and video playback; published on GitHub.

* [Acedia 1.8.1.21 source changes](release-1-8-1-21.md) - Remote MP4/WebM playback and Documents video entries; publication pending.

* [Acedia 1.8.1.20 source changes](release-1-8-1-20.md) - Remote Hosting for local HTML sites; EXE publication pending.

* [Acedia 1.8.1.19 EXE release](release-1-8-1-19.md) - Reload local HTML and relative assets when reopening an existing document tab.

* [Acedia 1.8.1.18 EXE release](release-1-8-1-18.md) - Wrapped terminal file links and external provider connection settings.

* [Acedia 1.8.1.17 EXE release](release-1-8-1-17.md) - Enter sends, Ctrl+Enter inserts a newline; includes the 1.8.1.16 source changes.

* [Acedia 1.8.1.16 source changes](release-1-8-1-16.md) - Browser extensions, browser skill and right-side display, deletion focus and Antigravity startup fixes. EXE publication pending.

* [Remote UI review — 1.8.1.6](remote-ui-review-2026-09-12.md) - Readability at normal zoom, desktop language synchronization and verification results.
* [Acedia 1.8.1.5 release](release-1-8-1-5-2026-09-12.md) - Default account selection, live quotas, large HTML previews and startup reliability.
* [Acedia 1.8.1.0 release](release-1-8-1-0-2026-09-12.md) - Account management, work handoff, quota selection, split browsers and release verification.
* [세션·프로젝트 속성과 계정 한도 표시](properties-and-usage.md) - 넓은 속성창, 실행 옵션 저장, 대화 기록 분리와 하단바 다중 계정 선택.
* [Acedia 설정 확장 로드맵](settings-expansion-roadmap.md) - Completed stages, acceptance criteria and remaining verification boundaries.
* [설정 확장 일괄 확인](settings-review-1-8-0-15.md) - Six implementation commits, verification results and the combined review sequence.
* [개별 설정 검색과 적용 범위](settings-search.md) - Option-level search, navigation, highlighting and application timing.
* [브라우저 설정과 프로필](browser-preferences.md) - Defaults, profile isolation, tab restoration and unpacked extension management.
* [저장 명령과 프로젝트 시작 설정](saved-commands.md) - Scoped commands, execution targets and opt-in startup timing.
* [알림 조건과 절전 방지](notifications-and-power.md) - Completion/bell conditions, focus suppression and shared sleep prevention.
* [상태 표시줄 구성](status-bar-settings.md) - Provider filters, used/remaining quota display and local monitors.
* [유휴 세션 자동 중지와 복원](idle-sessions.md) - Guarded idle suspension and exact account/conversation recovery.

## Sessions and integrations

* [Acedia account pool](account-pool.md) - Account registration and routing; one-button quota refresh for all accounts, completion-aware outcomes and response/transcript token sources.


* [Antigravity CLI terminal sessions](gemini-cli.md) - Installation, account quotas, personal-account migration and integration boundaries.

* [계정 등록 흐름](account-registration.md) - Account creation, login results, default selection, renaming and removal recovery.
* [에이전트 고급 실행 설정](agent-launch-options.md) - Local CLI path, arguments and environment, creation defaults, and safe per-session model/effort editing from Remote.
* [Codex account profiles](codex-accounts.md) - Independent local logins, account-scoped recovery, fresh-conversation work handoff and quotas.
* [Claude account profiles](claude-accounts.md) - Separate local accounts, scoped recovery, fresh-conversation work handoff and usage windows.
* [Session lifecycle and resume](session-lifecycle-and-resume.md) - PTY startup, hooks, cancellation, shutdown, and provider resume.
* [Local Dashboard](local-dashboard.md) - Loopback monitoring, terminal, documents and downloads, usage, session model/effort editing and visible waiting questions.
* [MiraControl integration](miracontrol-integration.md) - Authenticated session state, activation, and guarded input API.
* [Remote service](remote-service.md) - Remote/PWA/Android access, desktop-equivalent All/Active/Sleeping filters, original downloads, session model/effort editing, waiting questions and authentication boundaries.
* [API 단가 기준 환산액](usage-cost-comparison.md) - 중앙 서버·Remote의 USD 비교, 단가 기준, 제외 기록과 검증·적용 상태.
* [Usage accounting](usage-accounting.md) - Local token indexing, historical aggregation, live account quota refresh and failure states.
* [세션별 사용량](session-usage.md) - 세션별 토큰·USD 환산액, 정확한 대화 연결, 부모·자식 합계, 미산정 기록과 CSV.
* [Central usage collector](central-usage-collector.md) - Employee/account attribution, company receiver, Acedia and standalone collection, plugin scope and ordinary-chat limitations.
* [Embedded browser MCP](embedded-browser-mcp.md) - Always-on shared browser tabs, managed MCP startup, annotations, and isolation rules.
* [Embedded browser form automation plan](browser-form-automation-plan.md) - Implemented state-aware targeting and safe form controls, with remaining hardening and rollout tests.

## Delivery and maintenance

* [Acedia 1.8.1.12](release-1-8-1-12.md) - Google CLI terminal integration and Dashboard/Remote chat scroll preservation.

* [Acedia 1.8.1.11](release-1-8-1-11.md) - Release terminal colors and child Git repository selection.

* [사용량 수집 서버 운영 가이드](usage-server-operations.md) - 서버 소스·실행·배포 파일 위치, 설치와 계정 등록, 테마, 데이터 보관 및 검증 범위.
* [Development and build](development-and-build.md) - Local setup, tests, smoke checks, and desktop/mobile build entry points.
* [Release playbook](release-playbook.md) - Signing, artifact verification, publication, and updater invariants.
* [EXE와 Store 배포 채널](exe-release-workflow.md) - EXE 업데이트, 독립 설치·업데이트 경로, 공통 사용자 데이터와 릴리스 절차.
* [Store 배포 워크프로세스](store-release-workflow.md) - 요청별 범위, 최초 인증 설정, 일상 배포·재개 명령, 심사 상태와 개인정보/Git 보관 기준.
* [Store 자동 배포 실행기](store-release-automation.md) - One-request Store release scope, Windows credential/task setup, isolated builds, API submission and recovery.
* [Acedia 1.8.1.0 Store 테스트 배포](store-release-1-8-1-0-2026-09-08.md) - Settings/language MSIX submitted through Partner Center UI; Submission 5 published, Store installation verification pending.
* [Acedia 1.8.2.0 Store API 배포](store-release-1-8-2-0-2026-09-09.md) - Build and WACK passed; API submission reached Certification, automatic publication configured.
* [Acedia 1.8.x release handoff](acedia-release-handoff-2026-09-08.md) - Current Partner Center draft, completed 1.8.0.0 release, unfinished language/settings work, and the exact next-session starting procedure.
* [Microsoft Store 배포 운영 가이드](microsoft-store-release-guide.md) - Store MSIX 빌드, WACK, Partner Center 제출, 공개, 인증 대응 및 업데이트 절차.
* [Microsoft Store MSIX delivery and certification record](microsoft-store-msix-plan.md) - Private pilot and public-update implementation history, validation evidence, certification status, and rollout decisions.
* [Known limitations](known-limitations.md) - Confirmed constraints and explicitly unverified follow-up items.

* [Acedia 1.8.1.7](release-1-8-1-7.md) - Codex central collection, session path search and workspace fixes.

* [Acedia 1.8.1.8](release-1-8-1-8.md) - 작업자 로그, 계정 자동 전환과 기록 묶음.

* [Acedia 1.8.1.13](release-1-8-1-13.md) - Gemini CLI removal and Antigravity CLI retention.

* [Acedia 1.8.1.14](release-1-8-1-14.md) - Antigravity quota collection and Gemini five-hour/weekly status-bar display.

* [Acedia 1.8.1.15](release-1-8-1-15.md) - Exact Antigravity conversation recovery per session.
