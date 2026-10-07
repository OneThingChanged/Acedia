---
type: Operational Model
title: Local Dashboard
description: "Local monitoring and control, with optional code-paired access from the same LAN."
tags:
  - dashboard
  - monitoring
  - loopback
status: stable
stale_after: 2026-10-31
sources:
  - id: web-services
    resource: ../app/electron/services/web-services.mjs
    title: "Dashboard and Remote service"
  - id: web-tests
    resource: ../app/electron/services/web-services.test.mjs
    title: "Web-service contract tests"
  - id: remote-client
    resource: ../app/electron/remote-pwa/app.js
    title: "Shared Dashboard and Remote client"
  - id: session-create-broker
    resource: ../app/electron/services/remote-session-create-broker.mjs
    title: "Acknowledged session creation broker"
  - id: lan-access
    resource: ../app/electron/services/lan-access.mjs
    title: "LAN interface validation and connection codes"
---

# Local Dashboard

The production Dashboard is `LocalDashboardService` in the Electron process.
It binds to loopback by default and projects desktop-owned state into the shared
web client. Standard and Store also offer explicit LAN access with a connection
code; Company remains loopback-only.[^web-services][^lan-access]

## 같은 공유기의 다른 PC에서 접속

[1.8.1.46](release-1-8-1-46.md)부터 **설정 → 대시보드 → LAN 접속 허용**을 켜면
대시보드 서버를 시작하고 연결된 네트워크별 접속 주소와 **8자리 연결 코드**를 표시한다.
다른 PC의 브라우저에서 **주소 복사**로 복사한 URL을 열고 코드를 입력한다.
GitHub OAuth나 Cloudflare 터널 설정은 필요 없다. 호스트의 Acedia는 실행 중이어야 한다.

* 주소는 실제 수신 포트를 사용한다. 기본 포트는 4421이며 사용 중이면 빈 포트를 선택한다.
* 주소에 `?agent=…` 또는 `?screen=…`가 있으면 로그인 후 해당 화면으로 돌아간다.
* Chat·터미널·세션 조작·문서·사용량은 기존 Dashboard와 같은 기능을 사용한다.
* 설정은 저장된다. 앱 실행 시 서버를 켜려면 기존 **Start dashboard when Acedia starts**도 켠다.
* **코드 갱신 및 연결 해제**는 새 코드를 만들고 기존 로그인과 실시간 스트림을 해제한다.
  Acedia나 대시보드 서버를 재시작한 경우에도 다시 연결해야 한다. 쿠키의 최대 유효 기간은 7일이다.
* LAN 접속을 끄면 수신 주소를 loopback으로 되돌리고 연결을 해제한다.
  설정 변경은 대시보드 서버에 적용하며 실행 중인 CLI 세션을 종료하지 않는다.

연결되지 않으면 두 PC가 같은 네트워크인지 확인하고 Windows 방화벽에서 Acedia의
**개인 네트워크** 접근을 허용한다. 수동 포트 규칙을 사용할 경우 화면에 표시된 실제 TCP
포트를 해당 로컬 서브넷에 허용한다. 게스트 Wi-Fi의 기기 간 격리도 확인한다.
앱은 방화벽이나 공유기 포트 포워딩을 자동 변경하지 않는다.

LAN 설정의 **추가 허용 네트워크 (IPv4 CIDR)**에 `172.28.37.0/24`처럼 사내 대역을
한 줄에 하나씩 입력하고 **허용 네트워크 저장**을 누르면 다른 사내 서브넷에서도
접속할 수 있다. 사설 IPv4 대역만 최대 32개까지 허용하며 비우면 같은 서브넷만 받는다.
모든 추가 대역에서도 8자리 연결 코드 인증을 거친다. 대역 변경 시 코드를 갱신하고
기존 인증 연결을 해제한다. 네트워크 라우팅·방화벽은 해당 서버 주소의 직접 연결을
허용해야 하며 Windows portproxy로 loopback에 전달되는 요청은 계속 차단한다.

LAN 접속은 사설 IPv4 인터페이스의 같은 서브넷 또는 명시적으로 추가한 대역의 직접 연결만 받는다. 전달된 Host/IP
헤더나 다른 호스트 이름으로 로컬 소유자 권한을 얻을 수 없다. 코드 확인 전에는 세션,
파일, 실시간 출력, 계정 API에 접근할 수 없다. 코드는 데스크톱 IPC에서만 표시하며
웹 상태·URL·설정 파일에는 포함하지 않는다. 로그인 실패는 IP별·전체 요청 수로 제한하고
변경 요청은 동일 출처 검사를 거친다.[^lan-access]

LAN HTTP에서는 문서 경로·터미널 복사가 브라우저 선택 기반 복사로 동작한다.
브라우저의 서비스 워커·Web Push·설치 기능에는 HTTPS가 필요하므로 기존 외부 Remote
주소를 사용한다. 브라우저를 연 상태의 대시보드 사용은 LAN HTTP로 가능하다.

검증: `lan-access.test.mjs`는 실제 사설 인터페이스를 통한 코드 인증, API 접근,
설정 복원, 코드 갱신·로그아웃·비활성화와 출처·서브넷 검사를 확인한다.
`node app/scripts/electron-lan-dashboard-smoke.mjs`는 실제 preload와 IPC 검사를 통해
설정 토글·주소 복사·연결 해제를 실행하고, 일반 LAN HTTP 브라우저에서 1024px/390px
로그인·Chat 전송·문서 열기·복사·로그아웃을 검증한다. 별도 PC의 방화벽 통과 여부는
설치 후 해당 네트워크에서 확인한다.

2026-10-03 전체 단위 테스트 **150개 파일 / 957개 테스트**와 TypeScript·Vite 빌드가
통과했다. 설정 검색 **118개 항목**의 이동·포커스·배치, IPC 허용 목록 일치,
기존 Remote의 PC·모바일 화면과 6개 표시 언어도 확인했다.

## Data and control surface

Usage also contains owner-managed [account registration and routing](account-pool.md).
The same UI is shared with Remote; ordinary approved remote visitors cannot manage these accounts.

The Dashboard exposes bounded endpoints for:

* workspace, project, Screen, session, runtime, and hook state;
* terminal snapshot plus live SSE deltas;
* terminal input, attachments, cancel, restart/activation, create, and rename;
* Codex/Claude transcript chat;
* project document listing, Markdown/image reading, original file downloads, and isolated HTML preview;
* local usage history and provider account-limit snapshots.[^web-services][^web-tests]

The shared document preview, Documents header and document actions menu offer
**Download** for the original file, including Markdown, HTML, JSON, images and
videos. Downloads preserve the filename and stream the bytes through the same
project path checks. See [Remote downloads](remote-service.md#original-file-downloads)
for supported paths, preparation feedback and verification scope.

The browser does not own a second terminal. Mutations resolve an agent against
the Electron-owned PTY and return a conflict when the lifecycle state makes the
request unsafe.
The session picker is derived from the coordinator's enabled-tool catalog.
Creation keeps the HTTP request open until the coordinator has validated the
current catalog, claimed the new agent ID, and inserted the session; only then
does the Dashboard return `201 Created`.[^web-services][^session-create-broker]

## Update behavior

Chat stays at the bottom when sending from the bottom, including composer
resizing and subsequent chat rerenders. Reading older messages preserves the
current scroll offset. This behavior is shared with Remote.[^remote-client]

Questions and approvals show a persistent **답변 대기 중 / Answer needed** card
above the composer, even without question details or while history loads. It
shows available questions and choices and opens the session terminal for native
answers. The card clears when work resumes, and scheduled messages wait until
the question is answered. See [Remote question behavior](remote-service.md#session-and-content-surface).

Session activation and work completion use separate conditions for scheduled
messages. Once the CLI is running, a long turn or blocking question does not
expire the activation timer. A startup that finishes late automatically releases
its activation warning; the queue resumes when work and questions finish.
Failed or uncertain submissions still require explicit retry. Remote and
Dashboard share this client logic and its `electron:remote-queue-smoke` check.
The correction is included in EXE 1.8.1.38; see [release verification](release-1-8-1-38.md).
Installed-app verification remains separate.[^remote-client]

Initial terminal state is delivered as a snapshot; later output arrives as SSE
deltas. Hook and workspace changes refresh the projected state. Periodic client
refresh remains a recovery mechanism, not the authoritative activity source.[^remote-client]

Opening a chat reads the selected session's bounded recent transcript slice;
older conversation blocks are paged from the conversation store. Usage opens
with stored aggregates and collects new transcript records in the background,
prioritizing active sessions. It does not wait for inactive multi-GB history to
be parsed. Pending collection is visible and totals update as batches arrive.
See [usage collection](usage-accounting.md#incremental-collection) for checkpoint,
memory-limit and partial-failure behavior.

The coordinator's resolved app language is included in the synchronized state.
The browser applies it on the next state poll, including usage dates and number
formatting; the visiting browser's language does not override this preference.
The Dashboard shares Remote's larger typography, responsive usage cards and
controls. See [Remote display behavior](remote-service.md#readability-and-display-language)
for sizing, translation fallback and user-content preservation rules.[^remote-client]

## Boundary

Local Dashboard access, including its optional LAN connection code, is distinct from external Remote access. External
authentication, account approval, Cloudflare tunnel assumptions, Android return
tickets, and push/device monitoring belong to [Remote service](remote-service.md).

MiraControl does not scrape this general Dashboard payload. It uses the smaller
authenticated contract in [MiraControl integration](miracontrol-integration.md).

[^web-services]: Dashboard and Remote service
[^web-tests]: Web-service contract tests
[^remote-client]: Shared Dashboard and Remote client
[^session-create-broker]: Acknowledged session creation broker
[^lan-access]: LAN interface validation and connection codes
