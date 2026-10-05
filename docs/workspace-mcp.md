---
type: Integration
title: Acedia 프로젝트·세션 MCP
description: 기존 MCP 연결에서 프로젝트·세션을 생성하고 다른 Codex 세션에 작업을 전달하며 실제 수신·작업 시작을 확인한다.
status: stable
last_updated: 2026-10-05
sources:
  - resource: ../app/electron/services/workspace-management.mjs
  - resource: ../app/electron/services/workspace-management.test.mjs
  - resource: ../app/electron/services/browser-mcp-server.mjs
  - resource: ../app/electron/services/hook-service.mjs
  - resource: ../app/electron/services/remote-session-create-broker.mjs
  - resource: ../app/src/App.tsx
  - resource: ../app/scripts/electron-workspace-mcp-smoke.mjs
  - resource: ../app/electron/services/session-delivery.mjs
  - resource: ../app/electron/services/pty-submit.mjs
  - resource: ../app/src/components/SessionDeliveryNotice.tsx
  - resource: ../app/scripts/codex-session-delivery-smoke.mjs
---

# Acedia 프로젝트·세션 MCP

소스 1.8.1.48부터 제공한다. Acedia에서 실행한 CLI의 기존 `multiagent_browser`
MCP 연결에 아래 도구가 함께 등록된다. 별도 MCP 서버 설정 없이 업데이트 후 세션을
다시 시작하면 도구 목록에 나타난다. 원격 웹 기능을 켜지 않아도 로컬 MCP는 동작한다.

| 도구 | 기능 |
| --- | --- |
| `acedia_projects` | 프로젝트·세션 ID, 폴더, 터미널 실행 상태, 사용 가능한 AI 도구 조회 |
| `acedia_project_create` | 기존 절대 경로 폴더를 등록하고 첫 세션 생성. 같은 폴더는 기존 프로젝트 반환 |
| `acedia_session_create` | 등록된 로컬 프로젝트에 추가 세션 생성 |
| `acedia_session_send` | 다른 실행 중인 로컬 Codex 세션에 승인된 작업 전달 및 수신·작업 시작 확인 |
| `acedia_session_delivery` | 같은 호출 세션이 보낸 요청의 상태 조회. 입력·재전송 없음 |

조회·생성 도구는 1.8.1.48부터 제공한다. 전달 도구는 1.8.1.56부터 제공하며,
이 버전의 EXE 업데이트 후 호출하는 CLI를 다시 시작해야 도구 목록에 나타난다.

예를 들어 `acedia_project_create`에 아래 인수를 전달한다. 폴더는 Acedia가 실행되는
PC에 이미 있어야 하며, 폴더 자체를 새로 만들지는 않는다.

```json
{"folder":"G:\\AI\\03_Development\\Tools\\PixelDev","name":"PixelDev","aiToolId":"codex"}
```

추가 세션은 반환된 `projectId`와 새 `requestKey`를 사용한다. 같은 요청을 재시도할
때는 같은 키를 유지한다. 실행 중인 앱은 최근 200개의 생성 결과를 기억하며,
확인 응답이 시간 초과된 요청도 같은 키로 다시 생성하지 않는다. 그 경우 목록을 조회해
실제 저장 상태를 확인한다. 앱 재시작을 넘는 영구 멱등 키는 제공하지 않는다.

```json
{"projectId":"반환된 ID","name":"이미지 작업","aiToolId":"codex","requestKey":"pixeldev-images-1"}
```

인증된 loopback 통합 API만 사용하며 브라우저 Origin과 실행 종료된 호출 세션을 거부한다.
기존 coordinator 창의 프로젝트·세션 생성, 창 소유권, 기본 실행 설정을 재사용한다.
위험 모드를 요청할 수 없다. 생성 도구는 프롬프트를 보내지 않으며 작업 전달은 아래
별도 도구를 사용한다.

## 다른 세션으로 작업 전달

사용자가 다른 세션에 맡기라고 요청한 작업을 `acedia_session_send`로 전달한다.
먼저 `acedia_projects`에서 정확한 세션 `id`와 현재 `conversationId`, `state`, `reason`을
확인한다. 실행 중인 로컬 Codex가 대상이며 SSH·Claude 대상과 자기 자신은 현재 지원하지
않는다. 작업 중·질문 대기·입력 초안·용량 부족 복구 중에는 요청을 거부하고 입력하지 않는다.
수신 세션의 모델·effort·계정·대화와 CLI 프로세스를 유지한다.

```json
{
  "sessionId": "UI 세션의 Acedia id",
  "expectedConversationId": "조회한 UI 세션의 conversationId",
  "message": "Docs/NodeSelectionUIHandoff.md를 읽고 UI 초안부터 제작해 주세요.\n초안을 보여주고 피드백 후 적용해 주세요.",
  "requestKey": "node-selection-ui-draft-1",
  "waitMs": 8000
}
```

메시지는 UTF-8 최대 8 KiB이며 줄바꿈 외의 터미널 제어 문자(탭 포함)를 거부한다. 들여쓰기는
공백으로 보내야 한다. 앱이 고유 전달 번호와 보낸
프로젝트·세션 표시를 붙인다. 여러 줄 붙여넣기 종료와 입력 화면 안정화를 확인하고 별도
Enter를 보낸다. 중간에 사용자 입력·세션 종료·대화 변경을 감지하면 추가 입력을 멈춘다.
Windows ConPTY에는 비 ASCII 문자를 명시적인 UTF-16 키 입력으로 전달해 특수기호나
이모지가 단축키로 처리되어 빠지는 현상을 방지한다. 클립보드는 변경하지 않는다.

| 상태 | 확인한 사실 |
| --- | --- |
| `sending` | 전달 의도를 기록했으며 전송 처리 중 |
| `sent` | 메시지와 별도 Enter를 전송. CLI 접수나 작업 시작을 아직 보증하지 않음 |
| `received` | 수신 대화의 실제 사용자 메시지에서 전달 번호와 본문 해시가 일치 |
| `started` | 같은 메시지에 연결된 새로운 `task_started`와 턴 ID를 확인. 작업 완료를 뜻하지 않음 |
| `failed` | 입력 전에 거부되어 전달하지 않음 |
| `unconfirmed` | 전송 결과·수신·시작을 확정할 수 없음. 받는 세션을 확인하며 자동 재전송하지 않음 |

`sentAt`, `receivedAt`, `startedAt`은 각각의 근거를 기록한다. Codex는 `task_started`를
사용자 메시지보다 먼저 기록할 수 있으므로 시간 순서와 UI 상태 확인 순서는 다를 수 있다.
`waitMs`는 0~10000이며 전달 기본값은 8000, 조회 기본값은 0이다. 확인이 늦으면 현재
상태를 반환하고 15초 후 `unconfirmed`로 안내한다. 나중에 정확한 수신·시작 근거를 찾으면
상태를 갱신한다. 인용된 오류·도구 출력·다른 대화·이전 턴은 시작 근거로 사용하지 않는다.

```json
{"requestKey":"node-selection-ui-draft-1","waitMs":10000}
```

위 인수를 `acedia_session_delivery`에 보내 상태를 확인한다. 요청마다 새 `requestKey`를
쓰고, 같은 요청을 다시 조회·호출할 때는 기존 키를 유지한다. 동일 키는 동시 호출과 앱
재시작 뒤에도 입력을 반복하지 않으며 다른 본문으로 재사용하면 거부한다. 불확실한 요청을
새 키로 다시 보내거나 무작정 Enter를 누르면 중복 실행 위험이 있으므로 수신 세션을 먼저
확인한다. 수신 결과는 요청한 호출 세션에만 MCP로 반환한다.

앱은 전송 전에 프로필의 `session-deliveries.json`에 의도를 저장한다. 메시지 본문과 인증
정보는 저장하지 않고 본문 해시와 세션·대화 ID·상태를 기록한다. 앱 재시작 중인 요청은
시작 미확인으로 복원한다. 최대 1000건을 보존하며 기록 파일 손상·저장 실패·한도 도달 시
새 전송을 거부하고 과거 요청을 지워 자동 재실행하지 않는다.

데스크톱의 보내는 세션과 받는 세션 상단에 전송·수신·작업 시작을 표시한다. 시작 미확인
또는 전송 실패는 보낸 세션의 기존 응답 필요 알림 설정을 따른다. 알림 권한과 음소거를
바꾸거나 모바일 시스템 푸시를 추가하지 않는다.

검증 명령: `npm run electron:session-delivery-smoke`, 설치 Codex 경로를
`ACEDIA_CODEX_BINARY`에 지정한 `npm run codex:session-delivery-smoke`. 격리 프로필과
로컬 응답 fixture로 실제 MCP·CLI·Unicode/여러 줄·원래 문맥·작업 시작·중복 방지를 검증한다.
실제 사용자 세션에 모의 작업을 전달하지 않는다.

2026-10-05 전달 기능 소스 검증: 전체 164개 테스트 파일의 1075개 검사와
TypeScript/Vite 빌드, 실제 stdio MCP·Codex 0.160.0 전달 검사, 실제 Electron의
3단계 안내·미확인 경고·닫기·390px 화면 검사, 격리된 앱 main/preload 브리지 검사를
통과했다. 후속 제어 문자·인증 경계 변경은 관련 27개 회귀 검사를 다시 통과했다.
한글·특수기호·이모지·줄바꿈, 기존 문맥·모델·effort 유지와 같은 요청의 앱 재시작 후
중복 방지를 확인했다. 설치 파일 배포 결과는 [1.8.1.56 릴리스 문서](release-1-8-1-56.md)에 기록한다.

workspace snapshot 저장과 첫 터미널 시작 시도가 끝난 뒤 결과를 반환한다.
`created`는 등록 여부, `active`는 Acedia의 터미널 프로세스 실행 여부다. CLI의 첫 응답을
보증하지 않는다. 시작에 실패해도 등록된 항목은 유지하며 `startError`를 함께 반환한다.
실패나 시간 초과를 성공으로 보고하지 않고, 폴더 없음·비활성 도구·잘못된 ID도 구분한다.

`electron:workspace-mcp-smoke`는 격리된 실제 Electron 창에서 모의 PixelDev 프로젝트와
두 세션의 저장·실행, 중복 방지, snapshot 영속화를 검사한다. 실제 사용자 프로젝트를
등록하거나 상용 모델을 호출하지 않는다. stdio MCP와 HTTP 인증 경계는 회귀 검사에 포함된다.

2026-10-03 소스 검증: 전체 153개 테스트 파일의 980개 검사, TypeScript/Vite 빌드와
위 실제 Electron 검사를 통과했다. 분산 계정의 native CLI 도구·계정 전환·대화 복원
검사는 [계정 분산 문서](account-pool.md)에 기록한다. 설치 파일 배포와 공개 업데이트
검증 결과는 [1.8.1.48 릴리스 문서](release-1-8-1-48.md)에 기록한다.
