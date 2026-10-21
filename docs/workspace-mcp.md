---
type: Integration
title: Acedia 프로젝트·세션 MCP
description: 기존 MCP 연결에서 프로젝트·세션 생성, 기존 세션 Dangerous 설정 저장과 다른 Codex 세션의 작업 전달·수신·시작을 확인한다.
status: stable
last_updated: 2026-10-22
sources:
  - resource: ../app/electron/services/workspace-management.mjs
  - resource: ../app/electron/services/workspace-management.test.mjs
  - resource: ../app/electron/services/session-launch-settings.mjs
  - resource: ../app/electron/services/session-launch-settings.test.mjs
  - resource: ../app/electron/services/session-relocation.mjs
  - resource: ../app/src/lib/sessionRelocation.ts
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
| `acedia_session_settings` | 기존 세션의 Dangerous 조회·저장. OFFLINE 대상 지원, 다음 실행부터 반영 |
| `acedia_sessions_relocate` | 앱 실행 중 기존 OFFLINE 세션들의 소속 프로젝트·작업 폴더를 묶어 변경 |
| `acedia_session_send` | 다른 실행 중인 로컬 Codex 세션에 승인된 작업 전달 및 수신·작업 시작 확인 |
| `acedia_session_delivery` | 같은 호출 세션이 보낸 요청의 상태 조회. 입력·재전송 없음 |
| `acedia_task_plan` | A의 계획 검증·저장 후 전용 로컬 Codex 작업 세션 자동 배정 |
| `acedia_task_list` / `acedia_task_get` | 실행 목록 페이지와 작업·시도·대화·턴·질문·검증 결과 조회 |
| `acedia_task_wait` | revision이 바뀌거나 최대 10초가 될 때까지 비동기 대기. 터미널 입력 없음 |
| `acedia_task_result` | 현재 담당 하위 세션이 정확한 시도·대화·턴의 구조화된 결과 제출 |
| `acedia_task_control` | A의 실행 정지·재개·취소, 결과 검토, 제한된 재시도, 상태 대조와 최종 요약 |

`acedia_task_*`는 2026-10-19 배포 전 소스에 추가됐다. 기존 조직도·생성 broker·전달 기록·모델 서비스를 사용한다. 일반 `session_create`의 실행 중 메모리 키와 달리 계획 키와 각 시도의 생성 ID·전달 키는 `task-orchestration.json`에 저장된다. 앱 재시작 후 미확인 작업을 자동으로 다시 생성·전송하지 않는다.

작업 계획은 `requestKey`, `title`, `request`, `tasks`와 선택적인 `concurrency`(기본 2, 1~4)를 받는다. 각 작업은 `id`, `title`, `goal`, `acceptance`, `dependsOn`, `writeScopes`를 지정한다. `writeScopes: []`는 읽기 전용이며 프로젝트의 실제 실행 폴더를 기준으로 경로를 검증한다. 난도·위험·문맥·도구 요구의 `assessment`에 따라 설정된 세 등급의 모델을 고르고 사용자 `modelOverride`를 우선한다. 호스트는 순환·외부 의존 관계와 추가 위임을 거부한다.

하위 결과는 `runId`, `taskId`, `attemptId`, `conversationId`, `turnId`, `result`에 연결한다. 결과에는 `summary`, `changedFiles`, `checks[{command, passed, output}]`와 선택적인 `artifacts`, `issues`가 들어간다. 실제 모델·턴을 확인하고 저장한 뒤 A의 `review`를 기다린다. 제출한 worker의 턴이 아직 진행 중이면 검토 완료를 거부해 파일 충돌 잠금을 유지한다. 필수 작업이 모두 완료돼야 `finish(summary)`가 성공한다. 질문·승인 답변은 사용자 화면 전용이다.

전용 세션의 첫 대화 ID가 아직 없을 때의 내부 전달 경로는 새 세션·빈 입력창·실제 모델을 확인하고, 정확한 전달 해시와 새 턴 증거로만 대화 ID를 연결한다. 일반 `acedia_session_send`의 필수 대화 ID·초안/질문/작업 중 거부 규칙은 유지된다. 자세한 예외와 검사 결과는 [구현 기록](task-orchestration-handoff-2026-10-19.md)을 참고한다.

데스크톱·Remote의 `get(view: "board")`는 카드별 digest인 `taskVersions`를 받아 변경된 카드만 반환한다. `detailTaskId`와 `detailVersion`으로 선택한 작업의 상세만 지연 조회하며 다른 작업의 긴 검사 출력은 보드 갱신에 포함하지 않는다. MCP의 일반 `get`은 A의 결과 검토에 필요한 구조화된 실행 정보를 반환한다. 두 경로 모두 전체 대화와 이미지를 복제하지 않는다.

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
생성 도구에서는 위험 모드를 요청할 수 없다. 기존 세션의 변경은 아래 설정 도구를 사용한다. 생성 도구는 프롬프트를 보내지 않으며 작업 전달은 아래
별도 도구를 사용한다.

## 기존 세션 Dangerous 설정

[Standard EXE 1.8.1.87](release-1-8-1-87.md)부터 `acedia_session_settings`와 인증된
`POST /integration/v1/workspace/session-settings`를 제공한다. 업데이트 배포본을 적용한 뒤
호출하는 CLI를 다시 시작해야 새 MCP 도구를 사용할 수 있다. UI 자동화나 Computer Use는 필요하지 않다.

먼저 `acedia_projects`에서 정확한 Acedia 세션 `id`를 확인하고 설정을 조회한다.

```json
{"sessionId":"대상 Acedia 세션 ID"}
```

반환된 `dangerous`를 `expectedDangerous`로 전달한다. 사용자가 요청한 경우에만 권한 확인
생략을 켜거나 끄며 질문·승인 우회를 위해 자동으로 켜지 않는다.

```json
{"sessionId":"대상 Acedia 세션 ID","dangerous":true,"expectedDangerous":false}
```

대상은 **로컬 Codex·Claude·Qwen·Antigravity**이며 OFFLINE 세션도 저장할 수 있다.
호출하는 세션은 실행 중이어야 한다. SSH·지원하지 않는 도구와 다른 작업창에 분리된 세션의
수정은 거부한다. 조회 결과의 `supportsDangerous`, `canEdit`로 편집 가능 여부를 확인한다.
두 설정 값은 문자열이 아닌 불리언이어야 하며 임의 실행 인수·환경변수·`restart`는 받지 않는다.

coordinator가 기존 세션만 수정하고 공통 workspace snapshot을 디스크에 저장한 뒤,
main 프로세스가 저장된 도구·Dangerous 값을 확인해야 `saved: true`를 반환한다.
응답의 `active`는 현재 터미널 존재 여부이고 `appliesOn: "next_start"`는 **다음 실행부터
적용**한다는 뜻이다. 저장만으로 OFFLINE 세션을 시작하거나 실행 중인 CLI를 재시작하지
않으며 현재 CLI 권한이 바뀌었다고 보고하지 않는다. 세션 선택·화면·포커스·입력 초안을
바꾸지 않고 모델·effort·계정·이름·새 세션 기본값도 유지한다.

같은 세션의 동시 수정을 거부하며 서로 다른 세션은 coordinator가 순서대로 저장한다.
이미 요청한 값이 저장된 재시도는 허용한다. 설정 충돌은 409, 없는 대상은 404,
coordinator 부재는 503, 응답 시간 초과는 504다. 시간 초과나 저장 실패는 성공으로
처리하지 않으며, 실제 저장 여부를 재조회한 뒤 재시도한다.

검증은 `session-launch-settings.test.mjs`, 실제 HTTP·stdio MCP를 사용하는
`workspace-management.test.mjs`, `npm run electron:workspace-mcp-smoke`로 수행한다.
Electron 검사는 임시 프로필과 모의 CLI에서 OFFLINE·실행 중 세션의 저장, 디스크 snapshot,
화면·포커스·초안 보존 및 별도로 시작한 다음 CLI의 실제 Dangerous 인수를 확인한다.
사용자 세션이나 실제 모델 서비스에 요청을 보내지 않는다.

2026-10-22 소스 검증: 전체 **199개 파일·1,489개 검사**, TypeScript/Vite 빌드와 위
실제 Electron 검사를 통과했다. 앱의 정상적인 세션 끄기로 OFFLINE 상태를 만든 뒤
저장 시 자동 시작·재시작이 없고, 명시적으로 다시 열 때 모의 CLI가 Dangerous 인수를
받는 것을 확인했다. `output/session-launch-settings-tests.log`,
`output/session-launch-settings-build.log`, `output/session-launch-settings-electron.log`.
이 소스 검증은 설치 파일 배포·사용자 세션 설정 변경을 포함하지 않는다.

## 기존 세션 소속·작업 경로 변경

[Standard EXE 1.8.1.88](release-1-8-1-88.md)부터 `acedia_sessions_relocate`와 인증된
`POST /integration/v1/workspace/relocate-sessions`를 제공한다. 앱을 종료하거나 저장 파일을
직접 편집할 필요가 없다. 대상 세션만 비활성화하고 호출 세션은 실행 중으로 유지한다.
`acedia_projects`가 각 세션의 등록 `folder`도 반환하므로 조회한 `projectId`, `folder`를
각각 `expectedProjectId`, `expectedFolder`로 전달한다.

```json
{
  "moves": [
    {
      "sessionId": "기존 세션 ID",
      "expectedProjectId": "기존 프로젝트 ID",
      "expectedFolder": "G:\\AI\\ResearchA",
      "projectId": "등록된 RnDHub 프로젝트 ID",
      "folder": "G:\\AI\\RnDHub\\ResearchA"
    }
  ]
}
```

한 요청에 1~20개 세션을 지정한다. 대상 프로젝트는 이미 등록된 로컬 프로젝트이며 새
작업 폴더는 이 PC에 존재해야 한다. API는 실제 디렉터리를 옮기거나 프로젝트 루트의
등록 경로를 바꾸지 않고, 지정한 세션의 프로젝트 소속과 작업 폴더를 갱신한다. 이미
옮겨서 옛 폴더가 없어도 등록 변경을 허용한다. 새 경로는 실경로로 정규화한다.

전체 요청의 ID·경로·기존 등록 값·실행 상태·창 소유권·부모 관계를 검증한다. 실행 중인
세션, SSH, 다른 창의 세션, 종료되지 않은 작업 분담 실행의 A·하위 세션은 수정하지
않는다. 부모·자식은 같은 프로젝트로 함께 옮기거나 먼저 조직도에서 관계를 정리한다.
작업 폴더를 상속하는 미지정 하위 세션의 경로가 바뀌면 저장 전에 거부한다. 서로 다른
대화가 고정된 세션은 고정 상태를 먼저 확인한다. 오류 시 임의로 관계·고정을 해제하지 않는다.

coordinator는 요청을 순서대로 처리하고 저장 직전에 main에서 다시 검증한다. 저장 중인
대상의 동시 시작·계정 변경을 막고, 세션 목록과 화면 그룹의 등록 정보를 같은 workspace
snapshot에 저장한다. main이 모든 대상의 저장된 프로젝트·경로를 확인한 뒤
`saved: true`, `active: false`, 정규화한 `moves`를 반환한다. 시간 초과는 성공이 아니므로
목록을 다시 조회해 실제 저장 여부를 확인한다. 이미 적용된 목적지로 재시도해도 중복 세션을 만들지 않는다.

세션 ID·이름·대화 ID·계정·Dangerous·개별 실행 옵션과 화면 배치·선택·포커스·입력
초안을 보존하며 자동 시작하지 않는다. 이동한 세션의 폴더는 직접 지정으로 저장한다.
Codex·Claude와 Antigravity의 현재 대화는 기존 조회 폴더를 기억한 채 새 작업 폴더에서
다시 시작한다. 모델 기억 저장소의 Codex·Claude 모델·effort·Fast·예약 선택도 새 경로에
이어붙여 대상 프로젝트의 기본 모델로 되돌아가는 것을 방지한다. 다른 계정의 모델을 복사하지 않는다.

검증은 `session-relocation.test.mjs`, `sessionRelocation.test.ts`, 모델 기억·spawn·IPC·HTTP·stdio MCP
검사와 `npm run electron:workspace-mcp-smoke`로 수행한다. Electron 검사는 임시 RnDHub와
모의 CLI에서 실행 중 거부, 두 세션의 등록·디스크 저장·설정·포커스 유지와 새 폴더에서의
실제 CLI 시작을 확인하며 사용자 폴더·세션을 변경하지 않는다.

2026-10-22 최종 소스 검증: 전체 **201개 파일·1,505개 검사**, TypeScript/Vite production
build와 실제 Electron 검사를 통과했다. 종료된 세션의 이동 후 비활성 유지와 만료된 요청의
늦은 검증 실패가 새 요청을 취소하지 않는 경우도 포함한다.
`output/session-relocation-tests.log`, `output/session-relocation-build.log`,
`output/session-relocation-electron.log`에 결과를 기록했다.

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
