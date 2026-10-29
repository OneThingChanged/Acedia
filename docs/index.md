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
* [Project managed files](project-managed-files.md) - Acedia settings registry, Git/Perforce ignores, and read-only repair at local session startup.
* [Workspace interactions](workspace-interactions.md) - Centered Quick Search, inline project/session search, Chat model/effort controls, fitted image previews, changed-file summaries and searchable file dialogs, conversation performance, navigation, sessions, panes, documents, source control, and notifications.
* [Session organization](session-organization.md) - Project relationship boards and folder references, parent/child session trees, setting inheritance and independent execution.
* [Pixel Office](pixel-office.md) - Project Board와 우측 사이드바에서 보는 세션 사무실, Pixel Agents 자산·실제 상태 연동·부모 자식 관계·이미지 캐시와 숨김 시 중단.
* [세션별 개인 메모](session-notes.md) - 사람이 사용하는 세션별 메모, 채팅·터미널·Remote 공통 저장과 동시 편집 보호.
* [멀티세션 작업 분담 구현 기록](task-orchestration-handoff-2026-10-19.md) - A의 계획·배정·결과 검토, 전용 Codex 세션, 모델 자동 선택, 재시작 복구와 데스크톱·Remote 검사 및 남은 범위. [첫 한국어 초안](mockups/task-orchestration.html), [프로젝트 보드 확장 시안](mockups/project-board-task-flow.html).
* [사이드바 UX HTML 초안](mockups/sidebar-workspace.html) - 새 대화·검색 고정, 프로젝트 범위 선택, 최근 대화와 상태 필터, 분할 화면·항목 메뉴·다크/라이트 테마를 눌러보는 설계 초안. [미리보기](mockups/sidebar-workspace.png).
* [대화 UX HTML 초안 02](mockups/chat-workspace-v2.html) - 요청·답변 구분, 상단 Quick Search와 사이드바 프로젝트·세션 통합 검색. [기본 화면](mockups/chat-workspace-v2.png), [검색 화면](mockups/chat-workspace-v2-search.png), [관찰·앱 적용·검사](chat-ux-review-2026-10-08.md).

## Settings and review

* [Acedia 1.8.1.97](release-1-8-1-97.md) - 하나의 공유 사무실, 부서 이동·확대·키보드 접근; Standard EXE 배포 검증 기록.
* [Acedia 1.8.1.96](release-1-8-1-96.md) - UTF-8 세션 수신함·한글 전달, 조직도 API, 자식 작업 폴더, 휴면 자식 표시 선택과 Pixel Office; 안정 EXE 게시·공개 다운로드 검증 완료.
* [Acedia 1.8.1.91](release-1-8-1-91.md) - 프로젝트별 Codex 폴더 신뢰 자동 확인과 하위 작업의 시작 승인 대기·전달 개선; 안정 EXE 게시·공개 다운로드 검증 완료.
* [Acedia 1.8.1.90](release-1-8-1-90.md) - 세션별 개인 메모, Active 부모 아래 Sleeping 자식 표시와 채팅 첫 요청 보존; 안정 EXE 게시·공개 다운로드 검증 완료.
* [채팅 첫 요청 누락 조사](chat-first-request-review-2026-10-22.md) - 최초 세션 ID 연결 시 시작 대기 요청·초안 누락 수정과 격리 검증; 1.8.1.90 EXE 배포에 포함.
* [Acedia 1.8.1.89](release-1-8-1-89.md) - 창 활성화 없는 기존 세션 시작 API·MCP, 현재 부모 기준 사이드바 트리와 hook 없는 재개 세션의 작업 전달 보완.
* [Acedia 1.8.1.88](release-1-8-1-88.md) - 기존 비활성 세션의 프로젝트 소속·작업 경로 변경 API·MCP와 EXE 배포 검증 기록.
* [Acedia 1.8.1.87](release-1-8-1-87.md) - 기존·OFFLINE 세션 Dangerous 설정의 공개 로컬 API·MCP와 EXE 배포 검증 기록.
* [Acedia 1.8.1.86](release-1-8-1-86.md) - 이미지 우클릭 복사·Ctrl 클릭 파일 위치와 한 줄의 여러 링크 수정 및 EXE 배포 검증 기록.
* [Acedia 1.8.1.85](release-1-8-1-85.md) - 로컬 Codex 작업 분담·모델 정책·작업 흐름·사이드바 하위 세션과 Nogari 설정 수정의 EXE 배포 기록.
* [Acedia 1.8.1.81 source changes](release-1-8-1-81.md) - Remote 터미널 마지막 줄 잘림과 이전 Luna 모델 표시 수정; 소스 검증 완료, 설치 파일 빌드·공개 배포 전.
* [Acedia 1.8.1.80 EXE release](release-1-8-1-80.md) - 앱 시작 시 업데이트 안내, 줄바꿈된 영상 링크와 내장 Git 설정 검사 보강; 안정 EXE 게시와 공개 다운로드 검증 완료.
* [Acedia 1.8.1.79 EXE release](release-1-8-1-79.md) - Remote 웹 기능, 완료 상태 수정과 문서·HTML 작업자 분배 제거; 안정 EXE 게시와 공개 다운로드 검증 완료.
* [Remote 웹 개선 검증](remote-workspace-review-2026-10-12.md) - 공용 웹 기능·완료 상태 검증과 외부 접속 지연 조사: 잘못된 UNC 파일 조회와 큰 대화 기록 반복 전송.
* [Acedia 1.8.1.78 EXE release](release-1-8-1-78.md) - Preserve terminal model/effort changes with inline Fast and prevent stale routed settings from overwriting the latest selection; stable EXE published and public download verified.
* [Acedia 1.8.1.77 EXE release](release-1-8-1-77.md) - Configurable default models, effort and Codex Fast; sidebar hover actions, closed-console EPIPE protection, and the chat/transport refactor; stable EXE published and public download verified.
* [Chat submission and Codex transport refactor](refactor-chat-transport-2026-10-11.md) - Source 1.8.1.76 separates host submission coordination and bounded WebSocket transport; included in the 1.8.1.77 EXE release.
* [Acedia 1.8.1.75 EXE release](release-1-8-1-75.md) - Remember new-session agent and Dangerous mode, stabilize host PTY chat submission and preserve image-rich Codex history through bounded asynchronous HTTP decoding and fragmented WebSocket transport; stable EXE published and public download verified.
* [Acedia 1.8.1.74 EXE release](release-1-8-1-74.md) - Remember per-session model, effort and Fast settings; sidebar close and path search, a fixed Chat queue, and automatic routed quota updates with five-minute fallback polling; stable EXE published and public download verified.
* [Acedia 1.8.1.73 EXE release](release-1-8-1-73.md) - Persistent, visible unread completion, Windows notification and taskbar fixes, and Tab-selectable Chat steering or completion reservations; stable EXE published and public download verified.
* [Acedia 1.8.1.72 EXE release](release-1-8-1-72.md) - Color-coded split screens and matching session badges, dedicated Codex/Claude logos, and Codex questions during work; stable EXE published and public download verified.
* [Acedia 1.8.1.71 local build](release-1-8-1-71.md) - Async-question fix verified and built locally, then included in 1.8.1.72 before publication.
* [Acedia 1.8.1.70 EXE release](release-1-8-1-70.md) - Background browser creation by default, explicit display requests, preserved workspace/input focus and one Chat Working indicator; public EXE delivery verified.
* [Acedia 1.8.1.69 EXE release](release-1-8-1-69.md) - Changed-file summaries and diffs, faster Chat, reliable current-model lookup and one model/effort button; public EXE delivery verified.
* [Acedia 1.8.1.68 EXE release](release-1-8-1-68.md) - Chat model/effort controls, fitted image frames, response-specific files and searchable file dialogs; public EXE delivery verified.
* [Acedia 1.8.1.67 EXE release](release-1-8-1-67.md) - Centered Quick Search and inline sidebar project/session search, with saved folds, draft/scroll preservation and IME support; public EXE delivery verified.
* [Acedia 1.8.1.66 EXE release](release-1-8-1-66.md) - Readable chat roles, response quotation, request reuse and artifact previews; retain loaded images across transcript updates; public EXE delivery verified.
* [Acedia 1.8.1.65 EXE release](release-1-8-1-65.md) - Fold project conversations inline with saved expansion and compact session selection; send ZIP attachments from Remote and Dashboard; public EXE delivery verified.
* [Acedia 1.8.1.64 EXE release](release-1-8-1-64.md) - Correct Chat file links, inline image previews and visible work progress; repair Windows usage-client regression timing and verify public EXE delivery.
* [Acedia 1.8.1.63 EXE release](release-1-8-1-63.md) - Modern sidebar and conversation layout, shared Quick Open and notifications, clipboard actions and visible Codex startup questions in Chat.
* [Acedia 1.8.1.62 EXE release](release-1-8-1-62.md) - Stable LAN codes and client IPs, clear routing status, clickable file paths and desktop/Remote image viewing.
* [Acedia 1.8.1.61 EXE release](release-1-8-1-61.md) - Additional private Dashboard networks and saved-configuration guards for Remote and tunnels.
* [Acedia 1.8.1.60 EXE release](release-1-8-1-60.md) - Screen ungrouping, browser themes, Claude authentication prompts and generated project configuration management.
* [Acedia 1.8.1.59 EXE release](release-1-8-1-59.md) - Preserve Codex cache affinity and streamed usage, show active project folder hierarchy, and record publication plus live ToonShader and account-switch cache measurements.
* [Acedia 1.8.1.57 EXE release](release-1-8-1-57.md) - Automatically open local page links through Hosting and reliably clear Remote Codex conversations.
* [Acedia 1.8.1.56 EXE release](release-1-8-1-56.md) - Deliver tasks between live Codex sessions through MCP with verified receipt/start stages and persistent duplicate prevention.
* [Acedia 1.8.1.55 EXE release](release-1-8-1-55.md) - Retry Codex capacity failures with the same model and conversation; show countdown, cancellation and final failure alerts.
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
* [알림 조건과 절전 방지](notifications-and-power.md) - Persistent sidebar completion badges, Windows notification delivery and taskbar attention, completion/bell conditions, focus suppression and shared sleep prevention.
* [상태 표시줄 구성](status-bar-settings.md) - Provider filters, used/remaining quota display and local monitors.
* [유휴 세션 자동 중지와 복원](idle-sessions.md) - Guarded idle suspension and exact account/conversation recovery.

## Sessions and integrations

* [Acedia account pool](account-pool.md) - Account registration and routing; one-button quota refresh for all accounts, completion-aware outcomes and response/transcript token sources.


* [Antigravity CLI terminal sessions](gemini-cli.md) - Installation, account quotas, personal-account migration and integration boundaries.

* [계정 등록 흐름](account-registration.md) - Account creation, login results, default selection, renaming and removal recovery.
* [에이전트 고급 실행 설정](agent-launch-options.md) - Local CLI launch options, safe model/effort editing, and the last session model/effort/known Fast state preserved across sleep and restart.
* [Codex account profiles](codex-accounts.md) - Independent local logins, account-scoped recovery, fresh-conversation work handoff and quotas.
* [Claude account profiles](claude-accounts.md) - Separate local accounts, scoped recovery, fresh-conversation work handoff and usage windows.
* [Session lifecycle and resume](session-lifecycle-and-resume.md) - PTY startup, hooks, cancellation, shutdown, and provider resume.
* [Local Dashboard](local-dashboard.md) - Loopback monitoring, terminal, documents and downloads, usage, session model/effort editing and visible waiting questions.
* [MiraControl integration](miracontrol-integration.md) - Authenticated session state, activation, and guarded input API.
* [Workspace MCP](workspace-mcp.md) - Project/session creation and verified task delivery between live Codex sessions.
* [Remote service](remote-service.md) - Remote/PWA/Android access, filters, downloads, session model/effort editing and authentication boundaries; [2026-10-12 desktop/Remote comparison](remote-service.md#desktop-and-remote-feature-comparison-2026-10-12) records existing features and remaining UI gaps.
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
