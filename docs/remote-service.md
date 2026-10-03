---
type: Interface
title: Remote service
description: "Authenticated external access to desktop-owned sessions through the Remote PWA and Android client."
tags:
  - remote
  - pwa
  - android
  - security
status: stable
stale_after: 2026-10-31
sources:
  - id: web-services
    resource: ../app/electron/services/web-services.mjs
    title: "Dashboard and Remote server"
  - id: web-tests
    resource: ../app/electron/services/web-services.test.mjs
    title: "Remote authentication and endpoint tests"
  - id: session-create-broker
    resource: ../app/electron/services/remote-session-create-broker.mjs
    title: "Acknowledged Remote session creation broker"
  - id: remote-client
    resource: ../app/electron/remote-pwa/app.js
    title: "Remote PWA client"
  - id: session-filters
    resource: ../app/electron/shared/session-state.mjs
    title: "Shared Remote session lifecycle filters and PTY projection"
  - id: session-filter-tests
    resource: ../app/electron/shared/session-state.test.mjs
    title: "Desktop classification parity and runtime projection checks"
  - id: session-filter-smoke
    resource: ../app/scripts/electron-remote-session-filter-smoke.mjs
    title: "Remote and Dashboard session filter runtime verification"
  - id: remote-documents
    resource: ../app/electron/services/remote-documents.mjs
    title: "Shared project document routes and preview capabilities"
  - id: document-download-tests
    resource: ../app/electron/services/remote-document-download.test.mjs
    title: "Original download bytes, filenames and access boundaries"
  - id: document-download-smoke
    resource: ../app/scripts/electron-document-download-smoke.mjs
    title: "Actual desktop/mobile browser downloads"
  - id: remote-submissions
    resource: ../app/electron/services/remote-submissions.mjs
    title: "Durable submission deduplication"
  - id: remote-requests
    resource: ../app/electron/remote-pwa/requests.js
    title: "Request deadlines and latest-response ordering"
  - id: remote-http
    resource: ../app/electron/services/remote-http.mjs
    title: "Shared HTTP JSON response framing"
  - id: chat-markup
    resource: ../app/electron/remote-pwa/chat-markup.js
    title: "Chat markup escaping and project file links"
  - id: chat-render
    resource: ../app/electron/remote-pwa/chat-render.js
    title: "Chat turn and tool DOM rendering"
  - id: chat-history
    resource: ../app/electron/remote-pwa/chat-history.js
    title: "Chat page merging and sequence ordering"
  - id: chat-questions
    resource: ../app/electron/shared/chat-prompt.mjs
    title: "Shared question and permission card parsing"
  - id: chat-transcript
    resource: ../app/electron/services/chat-transcript.mjs
    title: "Transcript decoding and pending native questions"
  - id: question-ui-smoke
    resource: ../app/scripts/electron-chat-question-smoke.mjs
    title: "Desktop and Remote question visibility smoke"
  - id: remote-ui-smoke
    resource: ../app/scripts/electron-remote-pwa-smoke.mjs
    title: "Desktop and mobile Remote PWA runtime smoke"
  - id: remote-queue-smoke
    resource: ../app/scripts/electron-remote-queue-smoke.mjs
    title: "Remote and Dashboard queue activation and completion smoke"
  - id: remote-language
    resource: ../app/electron/remote-pwa/i18n.js
    title: "Remote display language and locale formatting"
  - id: remote-styles
    resource: ../app/electron/remote-pwa/styles.css
    title: "Remote typography and responsive layout"
  - id: electron-main
    resource: ../app/electron/main.mjs
    title: "Desktop browser ownership and Remote frame provider"
  - id: codex-turn-completion
    resource: ../app/electron/services/codex-turn-completion.mjs
    title: "Codex transcript completion fallback for missed hooks"
  - id: pty-submit
    resource: ../app/electron/services/pty-submit.mjs
    title: "Paste settling, discrete Enter and per-PTY submission exclusion"
  - id: device-monitor
    resource: ../app/electron/services/remote-device-monitor-service.mjs
    title: "Android foreground-monitor token service"
  - id: notification-preview
    resource: ../app/electron/services/remote-notification-preview.mjs
    title: "Bounded final-answer previews for native notifications"
  - id: native-monitor
    resource: ../mobile/native/android/MultiAgentMonitorService.kt
    title: "Android notification channels and expandable completion notifications"
  - id: mobile-builder
    resource: ../mobile/scripts/build-apk.mjs
    title: "Android source refresh before signed release compilation"
  - id: runtime-variant
    resource: ../app/electron/runtime-variant.cjs
    title: "Runtime variant restrictions"
  - id: mobile-manifest
    resource: ../mobile/package.json
    title: "Android client manifest"
  - id: mobile-shell
    resource: ../mobile/App.tsx
    title: "Android profile and retained WebView shell"
  - id: mobile-remote-screen
    resource: ../mobile/src/screens/RemoteScreen.tsx
    title: "Android Remote WebView and back navigation"
  - id: remote-chat-ux-mockup
    resource: mockups/remote-chat-codex-style.html
    title: "Remote conversation and session-status UX prototype"
---

# Remote service

Remote is an authenticated external projection of the same sessions owned by
the Electron desktop process. It reuses the web-service core and static client
of the loopback Dashboard, then adds identity, approval, tunnel, mobile-return,
and device-monitoring controls.[^web-services][^remote-client]

## Code boundaries

The PWA is a dependency-free browser ES module application. It is shared by the
loopback Dashboard, authenticated Remote site, and Android's retained WebView.
It does not use the desktop React/Vite entry point. The main client still owns
navigation, mutable session state, polling, terminal lifecycle, and event wiring;
the extracted modules have these responsibilities:

| Module (under `app/electron/`) | Responsibility |
| --- | --- |
| `remote-pwa/dom.js` | Small text and DOM creation helpers; no page initialization |
| `remote-pwa/chat-markup.js` | Escaping, Markdown fragments and project file-link markup |
| `remote-pwa/chat-render.js` | User/assistant turns, tool details and diffs |
| `remote-pwa/chat-history.js` | Pure sequence deduplication, ordering and overlapping-page merging |
| `remote-pwa/i18n.js`, `remote-pwa/translations.js` | App-language messages, trusted initial-shell bindings and locale-aware usage dates |
| `services/remote-documents.mjs` | Project-root checks, bounded document/image reads, original file downloads, HTML capabilities and one shared document API dispatcher |
| `services/remote-http.mjs` | JSON headers, body length and response serialization |
| `services/web-services.mjs` | Server lifecycle, authentication, session APIs, static asset allowlist and tunnel orchestration |

Both server variants call the document dispatcher **after their existing access
checks**. Each server retains its own preview-token map. Capability preview URLs
keep their separate token gate; extraction does not make workspace files public.
Full paths in chat can open files under registered project roots. When a registered
Unreal plugin has a `.uproject` ancestor, its enclosing Unreal workspace is also
allowed, so `Saved` images and JSON reports can be previewed from Remote. Other
absolute paths remain blocked. JSON files open from chat links without being
added to the Documents index. Remote PWA cache v80 is used for the 1.8.1.35 download UI.
The client modules are individually allowlisted as JavaScript assets and included
in the service-worker precache and network-first application assets. Additions
must update both the server map and worker asset list.[^remote-documents][^remote-http]

## Original file downloads

Remote와 Dashboard에서 채팅 파일 미리보기 또는 Documents의 상단 **다운로드**를
누르면 원본 파일을 저장한다. 문서 목록 우클릭 메뉴와 모바일 **⋮ 문서 작업**에도
다운로드가 있다. Markdown은 원본 `.md`/`.markdown`, HTML은 원본 HTML 파일
한 개로 저장하며 JSON·이미지·MP4/WebM도 같은 동작을 사용한다.

`GET /api/docs/download`는 기존 `projectId`, `path`, 선택적 `agentId`로 파일을
해석한다. 프로젝트·세션 상대 경로와 등록된 프로젝트/Unreal 작업공간의 전체 경로를
지원한다. Remote 인증·승인 뒤 실행하며 프로젝트 밖 경로, 외부로 향한 링크, SSH와
지원하지 않는 형식은 거부한다. `Content-Disposition`의 UTF-8 파일명으로 한글을
보존하고 `application/octet-stream`, `nosniff`, `no-store`로 원본 바이트를 전송한다.

클라이언트는 `HEAD`로 접근·존재 여부를 먼저 확인하고 브라우저의 파일 다운로드를
시작한다. 준비 중 중복 요청을 막고 실패 후 버튼을 복구한다. 본문을 PWA 메모리에
모으지 않고 서버에서 스트리밍하므로 2MB 미리보기 제한을 넘는 문서도 저장할 수 있다.
준비 완료 안내는 다운로드 시작을 뜻하며 실제 저장 진행은 브라우저가 관리한다.

소스 검증: 다운로드와 기존 웹 서비스 **22개 테스트**가 원본 바이트·한글 파일명·
HEAD·큰 문서·빈 파일·경로 제한·인증을 확인했다.
`npm --prefix app run electron:document-download-smoke`는 1024×850, 390×850,
375×812와 844×375에서 실제 파일 저장, 미리보기/상단/메뉴 진입, 오류 복구와 모바일
배치를 확인한다. 전체 소스 테스트는 **865개**가 통과했다. 설치 파일 검증은
[1.8.1.35 릴리스 기록](release-1-8-1-35.md)에 정리한다. 실제 Android WebView 저장은
별도 검증이다.

## Hosting (1.8.1.20 source, publication pending)

Documents·Usage 옆 **Hosting**에서 이름과 개발 PC의 HTTP 로컬 URL을 등록한다.
예: `http://127.0.0.1:4410/docs/ux-dnf-exporter/dnf-exporter-draft.html`.
등록한 이름을 누르면 Remote 안에서 열고, 새 창으로 열기와 페이지 다시 열기도 제공한다.
`127.0.0.1`, `localhost`, `::1` 및 명시된 포트만 지원한다. 원본 서버와 Acedia가
실행 중이어야 한다. 등록 목록은 공통 로컬 데이터의 `remote-hosting.json`에 저장한다.

Remote 로그인·승인을 통과한 사용자가 등록·목록·열기 API를 사용한다. 열린 페이지는
30분 유효한 무작위 capability 링크로 제공한다. 링크를 가진 사람은 만료 전까지 볼 수
있으므로 공개 공유용 링크로 취급하지 않는다. 등록 제거와 서비스 종료는 링크를 무효화한다.
HTML·상대경로 이미지·CSS·JS를 중계하며 루트 경로를 보정한다. 원본에 Remote 쿠키나
Authorization을 전달하지 않고, 외부 리다이렉트와 쓰기 요청은 막는다. 미리보기는
opaque-origin sandbox로 Remote DOM·로그인 저장소에서 격리하며 API 연결을 허용하지 않는다.
로그인·폼 제출·WebSocket·API 앱이나 LocalStorage 의존 페이지의 완전한 실행은 지원하지 않는다.

구현: `app/electron/services/remote-hosting.mjs`, `app/electron/remote-pwa/hosting.js`.
검증: `node app/scripts/electron-remote-hosting-smoke.mjs`는 1280px·390px에서 등록·열기,
상대 이미지와 스크립트 실행, Remote DOM 접근 차단을 확인한다. 서비스 테스트는 인증,
교차 출처 등록 차단과 제거 후 링크 만료를 확인한다. 2026-09-21 확인 시 위 예시의
4410 서버는 연결 거부 상태였으므로 실제 DNF 페이지는 검증하지 못했다.

## Readability and display language

Remote and Local Dashboard share a 16px base with 14–16px body/control text and
12px minimum captions and chart labels. Usage cards use larger totals, spaced
sections and responsive columns. Buttons use at least 40px height for primary
actions, with 44px usage controls on mobile. The usage page has a 1600px content
limit on wide displays; period selectors wrap on narrow screens. Font sizing
does not scale the whole page or xterm canvas. Terminal text uses 15px in session
view and 14px in split panes.[^remote-styles]

The coordinator includes the resolved desktop `language` in Remote view,
Monitor state and usage-catalog synchronization. `/api/state` exposes it to the
shared browser client. A normal state poll applies a changed language without
reloading the page; Remote has no independent language selector. System default
is resolved on the desktop, not from the visiting browser. The public
`/auth/mode` response also supplies the language for the sign-in page without
exposing session data.[^remote-client][^web-services]

Korean and English UI messages are catalogued explicitly. Chinese, Traditional
Chinese, Japanese and Spanish use translated entries where available and the
desktop's English fallback policy for remaining messages. Dates, month labels,
compact token counts and reset times use the resolved locale; chart labels no
longer depend on Korean display labels in usage history responses. Only trusted
initial-shell nodes and explicit UI message calls are translated. Project and
account names, chat content, document content and provider output retain their
original text. Language changes preserve composer drafts.[^remote-language]

Chat helper tests import the production modules directly instead of slicing
functions out of the main source. `npm --prefix app run electron:remote-pwa-smoke`
starts an isolated Remote server and checks the real module graph, chat rendering,
document-link preview, history ordering and service-worker activation at desktop
and mobile widths. The readability checks render populated usage history at
1920, 1280 and 390px, measure caption/control sizes, reject horizontal overflow,
and change the source language while checking draft and user-content preservation.
The smoke also checks all six resolved locale settings and English sign-in.
This does not verify live GitHub OAuth, public tunnels, or an installed Android
WebView. Version-specific results are recorded in the
[Remote UI review](remote-ui-review-2026-09-12.md).[^chat-markup][^chat-render][^chat-history][^remote-ui-smoke]

## Authentication and approval

GitHub OAuth establishes identity; it does not by itself grant workspace access.
The desktop owner must approve the account in MultiAgent. OAuth state, signed
session cookies, and Android return tickets are short-lived and validated by the
server.[^web-services][^web-tests]

Remote configuration, approval state, tunnel metadata, and device tokens live
under local application data. Credentials, signing keys, and OAuth secrets must
not be committed to the repository.

## Session filters

Dashboard and Remote use the desktop sidebar's **All / Active / Sleeping**
categories. Each button shows the count across all configured sessions, even
while searching. Active includes running, starting and recovering processes,
including sessions working, waiting for answers/permission, or finished with a
live process. Sleeping means `deferredStart === true` and `resumeEligible === true`:
a restored or suspended session that can start or resume and has a steady blue
dot. Never-started, explicitly deactivated, exited and unreachable sessions
remain in All.[^session-filters][^session-filter-tests]

The desktop publishes runtime and standby flags to both web projections. The
host's actual PTY presence overrides delayed metadata: a live process cannot
remain Sleeping, and an old running/hook status without a process cannot remain
Active. Explicit startup/recovery can appear in Active before PTY allocation.
Filtering changes visibility only; it does not start or resume sessions.
[^session-filters][^electron-main]

The selected filter is saved in the browser's local storage, independently of
the desktop selection. Explicit URL filters take priority, and Back restores
the category from the URL. Previous working, question, starting, recovery and
done links map to Active; previous idle/offline links map to All. Search by
project, session, folder or path stays within the selected category. Project
headings without matches disappear; desktop Screen shortcuts remain available.
Empty results offer **Show all sessions**, which clears the search and returns
to All. The shared UI also applies to Android's retained WebView.
[^remote-client][^remote-styles]

2026-10-01 source validation: 60 related tests and the TypeScript/Vite build
passed. Isolated Electron runs cover Remote and loopback Dashboard at 1280px and
375px, with landscape checks at 844px: labels/counts, lifecycle classification,
saved selection, old links, Back, keyboard selection, search/reset, state changes,
steady blue dots and absence of activation requests. Desktop/mobile Remote PWA
smoke also passed, covering chat, documents, account UI and six display locales.
These changes are included in EXE 1.8.1.38 with cache v81; release verification
is recorded in [the release notes](release-1-8-1-38.md), and user installation
remains separate.[^session-filter-smoke][^remote-ui-smoke]

## Session and content surface

Desktop Chat, Dashboard and Remote show an **Answer needed / 답변 대기 중**
card whenever a live session waits for a question or approval, including
free-text questions and waits without a question payload. The session chat card
stays above the composer while earlier messages are being read, and offers
**Answer in terminal / 터미널에서 답변**. It is also visible while chat history
loads or is unsupported. Work resuming clears the card; merely writing an answer
does not hide a session that is still waiting.[^remote-client][^chat-questions]

Native Codex `request_user_input` calls are recovered from the bounded live
transcript tail when their hook omitted the question. Tool call IDs identify
answers, so an unrelated tool result cannot clear the question. New turns,
completion and cancellation clear pending questions. All question text, choices
and descriptions remain visible; multi-question forms and Codex structured forms
are answered in the terminal. Existing single-choice Claude and explicit
numbered menus keep their buttons. Failed writes stop the remaining key sequence
and leave the terminal action available. Scheduled messages pause while an
answer is needed. Async input tools are not treated as blocking native forms.
`npm --prefix app run electron:chat-question-smoke` verifies the actual desktop
Chat component and Remote client at 1024px and 390px using an isolated profile,
including fallback visibility, scrolling, terminal navigation, stale-state
clearing and failed answer writes. It does not call a live model.[^chat-transcript][^question-ui-smoke]

From 1.8.1.17, desktop chat and the Remote composer use Enter to send (or queue
while working) and Ctrl+Enter to insert a newline at the selection. Cmd+Enter is
also accepted for newline. Plain Enter/Tab accepts a visible autocomplete item;
Ctrl+Enter still inserts a newline while suggestions are open. IME composition
events, including keyCode 229, do not trigger submission. Remote newline edits
update the session draft, revision and textarea height through the input event.
The Remote service-worker cache is v65 so refreshed clients receive the change.

Authenticated clients can read projected workspace/session state, stream
terminal output, submit input and attachments, cancel or activate work, create
or rename sessions, and view supported Codex/Claude chat transcripts. The
desktop resolves every mutation against its current PTY and lifecycle state.
Session creation is an acknowledged operation rather than a fire-and-forget
renderer event. The web request remains pending while the coordinator validates
the current project/tool catalog and claims ownership for the new agent ID. It
returns `201 Created` only after the session is inserted; missing coordinators,
stale projects, disabled tools, ownership failures, and timeouts remain visible
in the editor as errors.[^web-services][^session-create-broker]
Composer text and scheduled messages are isolated by agent ID for the lifetime
of the page, so changing the selected session does not move a draft or discard
an accepted queue. Selecting a session keeps the desktop/tablet navigation pane open. The pane
collapses only when the user uses its toggle; the mobile drawer still closes
after selection so the conversation is visible.
Normal chat submission uses one same-origin HTTP operation;
the desktop then writes the text and the discrete Enter key to the same verified
PTY. Multiline input, including image-tagged messages, is normalized and enclosed
as a terminal bracketed paste. Before the separate Enter, the backend waits at
least 500ms, observes PTY output, and then waits for 250ms of quiet output (bounded at 3 seconds). A nonresponsive terminal is not treated as a settled paste. The old
80ms delay could overlap a CLI's paste handling. A failed immediate
submission leaves the draft and attachments available,
while an activation timeout keeps its queued message and exposes retry instead
of silently deleting it. The 30-second activation limit applies only until the
CLI is running; resumed work or a question can then wait longer without expiring
activation. If startup finishes after the limit, the activation warning clears
automatically and queued messages send in order when work and questions finish.
Runtime availability is checked separately from a Done hook, so stale completion
metadata cannot authorize input to a session that is still starting. Failed or
uncertain submissions remain paused for explicit retry.[^web-services][^remote-client][^web-tests][^pty-submit]

`npm run electron:remote-queue-smoke` checks this behavior through the actual
Remote and Dashboard pages at desktop and phone widths, using isolated profiles,
ephemeral loopback ports and mock sessions. It covers a turn longer than the
activation limit, late startup, blocking questions, FIFO/session isolation and
failed or uncertain submissions, including legacy payloads without runtime
metadata. Both Codex and Claude fixtures passed, and the queue UI was inspected
at phone and landscape widths. The correction is included in EXE 1.8.1.38;
[release verification](release-1-8-1-38.md) and installation on the user's
desktop are separate checks.[^remote-queue-smoke]

Only one composer submission may write a given PTY at a time. If the terminal
changes or output does not settle after text was written, the request is marked
uncertain and its request ID is retained: the backend does not resend the image
paths or blindly retry Enter. HTTP success means the Enter write completed, not
that a model response has finished. Codex 0.153.4's
[paste-burst implementation](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/tui/src/bottom_pane/paste_burst.rs)
documents Windows burst handling and a 120ms Enter suppression window.

`npm run electron:remote-image-submit-smoke` (from `app/`) requires an installed
Codex CLI. It uses a temporary CODEX_HOME and a local mock model endpoint, uploads
a PNG through the loopback PWA API, submits its path, and verifies that Codex
initiates a model request. Repeating the HTTP request must not write a second
Enter. No real account or external model is used. This does not reproduce every
CLI/version or prove that an already-installed desktop build has this fix.

Submission handling locks each session while its composer request is pending.
The shared Dashboard/Remote chat preserves its scroll position through composer
resizing, attachment/queue changes and chat rerenders. A view within 80 pixels
of the bottom stays at the bottom; a user reading earlier messages retains the
current scroll offset. Restoration occurs synchronously so consecutive renders
cannot lose bottom-following between animation frames.
Successful replies clear only the accepted draft revision and attachments, preserving
new edits made while waiting. Queued entries retain a request ID across retries;
failed queue heads pause until explicit retry. Both HTTP servers persist a bounded
seven-day request ledger before PTY submission, storing content hashes rather than
message text. Matching retries reuse the outcome, while an interrupted/unknown
outcome is rejected for manual conversation inspection. Older clients without a
request ID retain their previous submission behavior.[^remote-submissions]

When the backend cannot determine whether a submission reached the PTY, the
composer and queued-message UI keep the message and request ID, show an
uncertain-outcome warning, and require explicit confirmation before a new
request ID can be used. This avoids an automatic duplicate send. The Remote
new-session dialog closes with Cancel or Esc; clicking outside leaves the
draft and chosen account in place.[^remote-client]

State and submission requests have a 12-second deadline including body reads.
Only the latest state request may update the screen or connection indicator;
late successes and failures are ignored. The polling loop resumes after timeout.
These behaviors are covered by unit/API tests and the desktop/mobile Electron
composer smoke; real public-tunnel interruptions remain unverified.[^remote-requests]

Remote chat reads from the desktop conversation store with bounded sequence
cursors. The browser keeps a rendering cache, but that cache is not the source
of truth: reaching the top requests older stored pages, and an app/WebView
reload can reconstruct the transcript from SQLite.[^electron-main][^remote-client]

The desktop canonicalizes Codex transcript paths before checking the selected
account root, so a Windows junction and its physical target refer to the same
conversation without admitting a different account's file. A newly reported
hook session ID replaces the previous transcript, and Remote drops the old
rendering cache when the response changes session ID. If a completion hook is
missed, the desktop checks the bounded tail of that session's Codex rollout:
only a completion marker written after the latest working hook may release a
stale Working status and its queued messages. Missing or inconclusive evidence
keeps the session busy.[^electron-main][^codex-turn-completion][^remote-client]

On mobile, Remote fixes the document viewport to the device width and disables
page scaling. The terminal's touch area supports vertical scrolling without
enabling pinch zoom. The Android client also disables WebView's built-in zoom
controls, so an updated APK is needed for that native setting; the PWA change
is delivered through service-worker cache v72.[^remote-styles][^mobile-remote-screen]

## Conversation UX prototype

The interactive Remote prototype keeps the conversation as the primary surface
and shows a completed result in transcript order without requiring the operator
to expand its work log first. Tool activity remains collapsible, while long
answers constrain tables and code blocks to their own horizontal scroll areas.
Single-session, side-by-side, and long-result states are selectable in one file
for layout review.[^remote-chat-ux-mockup]

Files, source control, and session status share one right sidebar. The status
tab follows the active conversation pane and summarizes alias, provider, model,
connection, lifecycle, project path, and synchronization state. Completion,
question, and error events update the tab badge without forcing the sidebar
open. Desktop users can collapse the sidebar to recover conversation width;
mobile users open it as an overlay drawer. This file is a design prototype, not
an assertion that the production Remote client already implements every shown
interaction.[^remote-chat-ux-mockup]

Document endpoints expose bounded project-local Markdown, images, linked assets,
and isolated HTML preview capabilities. They do not serve arbitrary absolute
filesystem paths. A chat or Markdown hyperlink to HTML opens its short-lived
preview capability directly instead of first navigating through Documents and
requiring a second launch action. Root-relative HTML asset
URLs are rebound to the same capability token so they cannot escape into the
Remote application root. An HTML preview link to `.md` or `.markdown` now opens
a readable Markdown page under that same token. Relative links and images stay
within the registered project root; Markdown source cannot run scripts and keeps
the existing 2 MB document limit. Unreal Automation reports that only export
`index.html` and `index.json` are rendered by a dependency-free compatibility
view; missing Bower packages therefore do not leave the public preview blank.
The compatibility view escapes report text and keeps artifact resolution inside
the canonical project root.[^web-services][^web-tests]

In Documents, right-click a file or use its action button to view and copy
project-relative and absolute paths. Deletion asks for confirmation and moves
the file to the desktop recycle bin. These actions keep the same registered
project-root checks and authenticated, same-origin request boundary as the
other document routes.[^remote-documents][^remote-client]

## Shared browser relay

The session view includes a browser mode that controls the desktop-owned shared
browser profile. It lists the same stable tab IDs used by the embedded browser
and MCP integration, so switching sessions does not create an isolated browser
or lose authenticated browser state. Navigation runs on the desktop; therefore
an approved Remote client can view and operate a site such as
`http://localhost:3000` even though that address would refer to the phone if it
were opened locally.[^electron-main][^remote-client]

The relay captures the current browser viewport as a bounded, adaptive-quality
JPEG in memory. Frames carry source dimensions for coordinate scaling and are
served with `no-store` and `nosniff`; they are not written to the annotation or
attachment directories. The client maps taps, drag scrolling, wheel input,
allowlisted keys, and explicit text entry back to Electron input events. It can
open, activate, navigate, reload, and traverse shared tabs.[^electron-main]

Browser status and frame endpoints require the same approved Remote session as
workspace state. Browser mutations additionally require same-origin JSON
requests. This human-control surface never returns cookies, browser storage,
DOM snapshots, password values, or the browser profile. MCP selector automation
remains a separate authenticated loopback interface with stricter password
control blocking.[^web-services][^web-tests]

## Android client

The Android package stores multiple Remote server profiles and returns from web
authentication through an app link/ticket flow. A foreground monitor can keep
an authenticated connection while the app is backgrounded and display local
completion notifications without Firebase.[^mobile-manifest][^device-monitor]

The Android app label is Acedia. Its release builder refreshes native resources
and Kotlin templates before compilation, preventing an existing generated
project from keeping the older MultiAgent Mobile branding. The connection
service uses a silent, low-importance channel with vibration and badges disabled
and secret lock-screen visibility. Android still requires its ongoing entry in
the notification drawer while this transport runs.[^native-monitor][^mobile-builder]

Native completion notifications contain a plain-text preview of the assistant's
final reply, bounded to 2,000 characters and expandable through Android BigText.
The server prefers the completion hook's reply and otherwise reads the last
assistant text in the matching session, with a 1.5-second lookup deadline. A
session mismatch or missing reply keeps the generic completion message. Tool
output and reasoning are never selected as preview text. The project/session
title remains the primary label and the PC profile is secondary text. Reply
previews live only in the bounded in-memory monitor event queue, require both
the updated desktop and APK, and are available only to approved native-monitor
bearer tokens. The separate browser Web Push payload remains generic.
Phone-level notification settings still determine lock-screen visibility.
[^notification-preview][^device-monitor][^native-monitor][^web-services]

Opening a profile lazily creates one WebView for that PC. The APK keeps an opened
profile view mounted but hidden when the operator returns to the combined Session
Hub or switches PCs, preserving page state and that WebView's navigation history
for the lifetime of the app process. Hidden profile pages receive a native
visibility signal and suspend workspace polling, terminal SSE, chat refresh, and
browser-frame capture until selected again; the native foreground notification
monitor remains independent. Only the visible profile handles Android Back. Its
managed Remote route history is traversed first, then control returns to the
Session Hub without revisiting OAuth redirects. Views remain origin-bound, and
deleting a profile destroys its retained view and revokes its native access
tokens.[^mobile-shell][^mobile-remote-screen]

The frequently polled workspace snapshot carries only a bounded terminal
fallback per agent; full terminal output continues over snapshot/SSE endpoints.
Session navigation retains a stable project/name order and updates existing rows
in place so hook status changes do not reorder the operator's tap targets.

Foreground-monitor bearer tokens are individually revocable. Revoking an
account or changing the configured owner removes its device-monitor access.

## Network boundary

Loopback HTTP is acceptable inside the desktop boundary. Public Remote access
is expected to terminate TLS at the configured Cloudflare tunnel. For PCs on
the same local subnet, the Dashboard has a separate opt-in connection-code flow;
see [LAN setup](local-dashboard.md#같은-공유기의-다른-pc에서-접속). It does not change
Remote's GitHub authentication or publish the Dashboard through a tunnel.

Company runtime rejects external Remote and tunnel operations and does not
package the downloadable APK. It retains only the loopback Dashboard.[^runtime-variant]

Operational Dashboard behavior is documented separately in
[Local Dashboard](local-dashboard.md).

## Remote video playback (1.8.1.21 source, publication pending)

Remote chat recognizes local MP4 and WebM paths and opens a video preview with
native playback, volume, seeking and fullscreen controls. Documents includes
these files as VIDEO entries and plays the selected file in its preview panel.
Closing the chat preview releases the video source; leaving Documents pauses playback.
Unsupported codecs and inaccessible chat video files show an error.

The authenticated `/api/files/video` endpoint resolves files within registered
local project roots, including session-relative paths. It supports GET, HEAD,
single byte ranges (206) and unsatisfiable-range responses (416). Videos stream
from disk without the image endpoint's 25MB limit. Local HTML preview MP4/WebM
assets use the same streaming path, retaining the preview capability check.
This does not extend the separate local website hosting proxy.

Verification: focused HTTP/link tests cover a 30MB file, range and suffix requests,
invalid ranges and path traversal. `app/scripts/electron-remote-video-smoke.mjs`
uses FFmpeg to generate a WebM fixture and checks real Electron chat playback,
preview cleanup, Documents listing and seeking at mobile width. Actual Android
WebView/device codec coverage and deployed tunnel playback remain unverified.


[^web-services]: Dashboard and Remote server
[^web-tests]: Remote authentication and endpoint tests
[^session-create-broker]: Acknowledged Remote session creation broker
[^remote-client]: Remote PWA client
[^session-filters]: Shared Remote session lifecycle filters and PTY projection
[^session-filter-tests]: Desktop classification parity and runtime projection checks
[^session-filter-smoke]: Remote and Dashboard session filter runtime verification
[^remote-documents]: Shared project document routes and preview capabilities
[^remote-http]: Shared HTTP JSON response framing
[^chat-markup]: Chat markup escaping and project file links
[^chat-render]: Chat turn and tool DOM rendering
[^chat-history]: Chat page merging and sequence ordering
[^chat-questions]: Shared question and permission card parsing
[^chat-transcript]: Transcript decoding and pending native questions
[^question-ui-smoke]: Desktop and Remote question visibility smoke
[^remote-ui-smoke]: Desktop and mobile Remote PWA runtime smoke
[^remote-queue-smoke]: Remote and Dashboard queue activation and completion smoke
[^remote-language]: Remote display language and locale formatting
[^remote-styles]: Remote typography and responsive layout
[^electron-main]: Desktop browser ownership and Remote frame provider
[^codex-turn-completion]: Codex transcript completion fallback for missed hooks
[^pty-submit]: PTY message formatting and ordered submission
[^device-monitor]: Android foreground-monitor token service
[^notification-preview]: Bounded final-answer previews for native notifications
[^native-monitor]: Android notification channels and expandable completion notifications
[^mobile-builder]: Android source refresh before signed release compilation
[^runtime-variant]: Runtime variant restrictions
[^mobile-manifest]: Android client manifest
[^mobile-shell]: Android profile and retained WebView shell
[^mobile-remote-screen]: Android Remote WebView and back navigation
[^remote-chat-ux-mockup]: Remote conversation and session-status UX prototype
