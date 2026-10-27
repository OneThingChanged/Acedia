---
type: Integration
title: Acedia 프로젝트·세션 MCP
description: 기존 MCP 연결에서 프로젝트·세션과 조직도를 관리하고, UTF-8 전용 수신함·한글 메시지·답장·읽음 확인과 Codex 작업 전달을 지원한다.
status: stable
last_updated: 2026-10-27
sources:
  - resource: ../app/electron/services/workspace-management.mjs
  - resource: ../app/electron/services/workspace-management.test.mjs
  - resource: ../app/electron/services/session-launch-settings.mjs
  - resource: ../app/electron/services/session-start.mjs
  - resource: ../app/electron/services/session-start.test.mjs
  - resource: ../app/electron/services/session-launch-settings.test.mjs
  - resource: ../app/electron/services/session-relocation.mjs
  - resource: ../app/electron/services/session-registry.mjs
  - resource: ../app/electron/services/session-registry.test.mjs
  - resource: ../app/src/lib/sessionOrganization.ts
  - resource: ../app/src/lib/sessionOrganization.test.ts
  - resource: ../app/src/lib/sessionRelocation.ts
  - resource: ../app/electron/services/browser-mcp-server.mjs
  - resource: ../app/electron/services/hook-service.mjs
  - resource: ../app/electron/services/remote-session-create-broker.mjs
  - resource: ../app/src/App.tsx
  - resource: ../app/scripts/electron-workspace-mcp-smoke.mjs
  - resource: ../app/electron/services/session-delivery.mjs
  - resource: ../app/electron/services/session-messages.mjs
  - resource: ../app/electron/services/session-messages.test.mjs
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
| `acedia_session_create` | 부모·작업 폴더를 지정한 추가 세션 생성. `start: false`로 실행 없이 등록 가능 |
| `acedia_session_start` | 기존 비활성 로컬 세션을 화면·창 활성화 없이 백그라운드에서 시작. 실행 중이면 유지 |
| `acedia_session_stop` | 기존 로컬 세션 프로세스를 종료하고 대기로 저장. 대화·설정·화면 배치 유지 |
| `acedia_sessions_organize` | 기존 세션들의 이름 변경과 부모 지정·변경·해제를 한 번에 저장. 실행·비활성 모두 지원 |
| `acedia_session_settings` | 기존 세션의 Dangerous 조회·저장. OFFLINE 대상 지원, 다음 실행부터 반영 |
| `acedia_sessions_relocate` | 앱 실행 중 기존 OFFLINE 세션들의 소속 프로젝트·작업 폴더를 묶어 변경 |
| `acedia_session_send` | 다른 실행 중인 로컬 Codex 세션에 승인된 작업 전달 및 수신·작업 시작 확인 |
| `acedia_session_delivery` | 같은 호출 세션이 보낸 요청의 상태 조회. 입력·재전송 없음 |
| `acedia_session_message_send` | UTF-8 원문을 전용 수신함에 저장하고 Codex에는 ASCII 알림만 전송. Base64·파일 입력과 답장 지원 |
| `acedia_session_message_receive` | 현재 세션의 수신함·발신함 조회와 원문 읽음 확인. 메시지 ID로 직접 읽기 가능 |
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

## 한글 원문 전송·수신 API (2026-10-27, 1.8.1.96)

한글과 여러 줄의 지시는 `acedia_session_message_send`를 권장한다. 본문을 UTF-8로
호스트의 `session-messages-v1.json`에 저장하고, 터미널에는 ASCII로 된 메시지 ID와
수신 도구 호출 안내만 보낸다. 한글 세션명·프로젝트명도 이 터미널 알림에는 포함하지
않는다. 받는 AI는 `acedia_session_message_receive`로 원문을 읽는다. 기존 실행 옵션,
대화·모델·effort·Fast, 창 포커스와 입력 초안을 유지하며 자동 재시작하지 않는다.

보내는 세션은 정확한 대상 ID와 중복 방지 키만 지정하면 된다. 실행 중인 로컬 Codex의
현재 대화 ID는 호스트가 조회하며, 특정 대화에 고정하려면 `expectedConversationId`도
지정한다. 기존 직접 전달의 대화 변경·작업 중·초안·질문·승인 대기 검사를 유지한다.

```json
{"sessionId":"받는 세션 ID","message":"전용 폴더의 문서를 읽고 한글 작업 지시를 진행해 주세요.\n결과도 한글로 알려 주세요.","requestKey":"korean-task-1"}
```

메시지 ID 알림을 받은 세션은 다음 인수로 `acedia_session_message_receive`를 호출한다.

```json
{"messageId":"알림에 나온 메시지 ID"}
```

메시지는 원문 `message`, 발신·수신 세션 ID, `sha256`, UTF-8 `bytes`, `readAt`,
알림 전달 상태인 `delivery`를 포함한다. `includeBase64: true`로 조회하면 원문 UTF-8의
Base64도 함께 반환한다. 기본 조회 `{}`는 자신의 안 읽은 메시지를 순서대로 읽는다.
`markRead: false`는 미리보기이며 읽음으로 기록하지 않는다. `unreadOnly: false`는 읽은
메시지도 포함한다. `messageId`로 지정하면 이미 읽은 메시지도 다시 조회할 수 있다.

발신함은 `{"direction":"outbox"}`로 조회한다. 발신자나 수신자에게 속한 메시지만
조회할 수 있고, 다른 세션의 수신함을 대신 조회하는 인수는 제공하지 않는다. 답장은
새 `requestKey`를 사용해 원래 발신자에게 보내고 원래 메시지 ID를 `replyTo`로 지정한다.

```json
{"sessionId":"원래 발신 세션 ID","message":"작업 내용을 확인했습니다.","replyTo":"받은 메시지 ID","requestKey":"korean-task-1-reply","notify":false}
```

`notify`의 기본값은 `true`이며, 대화 ID가 있는 실행 중인 로컬 Codex에만 자동 알림을
보낸다. Claude·Qwen·Antigravity와 OFFLINE 대상은 `notify: false`로 수신함에 저장할 수
있다. 이 경우 자동 CLI 시작이나 터미널 입력은 없으며, 받는 세션이 실행된 뒤 수신
도구로 읽는다. 작업 중 등의 이유로 알림이 거부되더라도 저장된 원문은 수신함에 남는다.

상태는 다음처럼 구분한다.

| 값 | 확인한 내용 |
| --- | --- |
| `saved: true` | UTF-8 원문을 디스크에 저장 |
| `delivery.status: started` | ASCII 알림을 포함한 Codex의 새 턴 시작. 원문 읽음·작업 완료는 아님 |
| `delivery.status: inbox` | 알림 없이 수신함에 저장 |
| `delivery.status: notification-error` / `unconfirmed` | 알림 처리 실패 또는 불확실. 원문은 보존하며 자동 재전송하지 않음 |
| `readAt` | 받는 세션이 수신 도구로 원문을 읽고, 읽음 시간을 디스크에 저장 |

같은 `requestKey`는 앱 재시작 후에도 같은 메시지를 반환하며 알림을 다시 보내지 않는다.
본문·대상·답장 연결·알림 옵션이 달라지면 거부한다. 알림 수락 뒤 수신함 상태를 저장하기
전에 앱이 종료됐어도 기존 전달 기록으로 대조한다. 불확실한 결과를 새 키로 재전송하지
말고 같은 키 또는 발신함에서 확인한다. 실제 작업 완료는 담당 세션의 결과로 확인한다.

본문은 최대 64 KiB이다. `message`, `messageBase64`, `messageFile` 중 하나를 지정한다.
`messageFile`은 이 호스트에 이미 존재하는 UTF-8 파일의 절대 경로다. Base64와 파일은
잘못된 UTF-8 바이트를 거부하며 선두 UTF-8 BOM은 제거한다. 선택적인 `expectedSha256`은
BOM 제거 뒤 원문 UTF-8의 SHA-256과 비교하고, 다르면 저장·알림 전에 거부한다. 원문에는
탭·줄바꿈·이모지를 보존하며 셸 명령으로 평가하지 않는다. 한 번에 최대 20개·본문 합계
128 KiB까지 조회하고 `nextAfter`와 `hasMore`로 이어 읽는다. 저장소는 최대 1000개·16 MiB다.

HTTP 경로는 `POST /integration/v1/workspace/messages/send`와
`POST /integration/v1/workspace/messages/receive`다. 기존 loopback 인증·Origin 거부와
실행 중인 호출 세션 검증을 사용한다. 잘못된 UTF-8 JSON 바이트를 치환 문자로 읽지 않고
400으로 거부한다. Windows PowerShell에서 JSON 문자열을 기본 인코딩으로 전송하는
재현 검사는 400, 명시적인 UTF-8 바이트 본문은 200과 원문 SHA-256 일치를 확인했다.
실제 사용자 보고의 모든 원인을 특정한 것은 아니며, 이미 `???` 등으로 변한 원문을
복원하는 기능은 아니다. MCP 직접 호출을 우선하고 HTTP는 다음처럼 UTF-8 바이트로 보낸다.

```powershell
$json = @{ sessionId = '대상 ID'; message = '한글 작업 지시'; requestKey = 'task-1'; notify = $false } | ConvertTo-Json
$headers = @{ Authorization = "Bearer $env:MULTIAGENT_TOKEN"; 'x-acedia-agent-id' = $env:MULTIAGENT_AGENT_ID }
$uri = "http://127.0.0.1:$env:MULTIAGENT_PORT/integration/v1/workspace/messages/send"
Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json))
```

검증: 관련 8개 파일의 93개 테스트, TypeScript·Vite build, 실제 stdio MCP의 UTF-8 분할 입력·권한 경계,
Windows PowerShell의 SHA-256 비교, 격리 Electron main의 원문·읽음·답장 저장과 포커스
보존을 확인했다. 격리된 설치 Codex에서도 ASCII 알림의 새 턴 시작, 수신 API의 원문
일치·한글 답장·중복 방지를 확인했다. 이 CLI 검사는 모델의 자동 도구 선택을 평가하는
검사가 아니라 수신 HTTP API를 별도로 호출해 원문을 대조하는 전송 검사다. 기존 직접
Unicode 전달도 실제 CLI에서 회귀 검사했다. 두 native 검사는 기능 assertion과 종료
코드 0을 통과했으며, 종료 정리 시 node-pty의 `AttachConsole failed` helper 출력이
남았다. 제품 전송 실패로 판정하지 않았으며 기록에 보존했다.

기록은 `output/session-messages-adjacent-tests.log`, `output/session-messages-powershell.log`,
`output/session-messages-native-final.log`, `output/session-messages-legacy-native-regression.log`,
`output/session-messages-electron.log`, `output/session-messages-build.log`다. 사용자 세션에는
테스트 명령을 보내지 않았다. 이 소스를 배포한 뒤 보내는 세션과 받는 세션의 CLI를
다시 시작해야 새 MCP 도구 목록을 사용할 수 있다.

## 조직도 관리와 실행 전 등록 (2026-10-27, 1.8.1.96)

조직도 화면에 있던 부모 연결과 이름 변경을 공개 MCP·loopback HTTP API로도 제공한다.
`acedia_projects`로 정확한 이름·부모·프로젝트를 조회한 뒤 `acedia_sessions_organize`에
최대 20개의 변경을 전달한다. 이름을 바꿀 때는 `name`과 조회한 `expectedName`, 부모를
바꿀 때는 `parentSessionId`와 조회한 `expectedParentSessionId`를 함께 지정한다.
부모가 없거나 연결을 해제할 때는 `null`이다. 목록에서 부모 필드가 생략된 경우에도
기대 값은 `null`로 보낸다. 기대 값과 현재 값이 다르면 409로 거부하지만, 이미 원하는
값으로 저장된 같은 요청은 재시도할 수 있다.

```json
{"changes":[{"sessionId":"관리자 ID","name":"PCG 관리자","expectedName":"기존 이름"},{"sessionId":"기존 자식 ID","parentSessionId":"관리자 ID","expectedParentSessionId":null}]}
```

부모는 같은 로컬 프로젝트에 있어야 하며 자기 자신·자손을 부모로 연결할 수 없다.
묶음의 최종 관계를 검증하므로 기존 연결을 풀고 관리자·부하를 함께 바꾸는 것도 가능하다.
실행 중·Sleeping·정지 상태에서 모두 조직도만 바꾸며 CLI를 재시작하지 않는다.
기존 대화 ID, 원래 작업 폴더, 계정, Dangerous, 실제 상속된 모델·effort·Fast·지침을
유지한다. 부모를 바꾼 세션은 기존 유효 설정을 자기 설정으로 고정하여 새 부모의 폴더나
모델로 갑자기 바뀌지 않는다. UI에서 상속을 다시 켤 수 있다. 생성자 기록과 대화 복원용
원래 폴더도 유지한다. 프로젝트 자체를 옮기는 작업은 기존 `acedia_sessions_relocate`를
사용한다.

`acedia_session_create`는 다음 선택 인수를 추가로 받는다.

| 인수 | 동작 |
| --- | --- |
| `parentSessionId` | 같은 프로젝트의 기존 부모 ID. `null`이면 독립 세션. 생략하면 기존처럼 같은 프로젝트의 호출 세션을 부모로 사용 |
| `folder` | 호스트 PC에 이미 존재하는 로컬 절대 작업 경로. 지정하면 부모 폴더 상속 대신 이 폴더 사용 |
| `start` | 기본 `true`. `false`면 CLI 시작 없이 대기 세션으로 영구 저장 |

```json
{"projectId":"AIHub 프로젝트 ID","name":"PCGLab","parentSessionId":"관리자 ID","folder":"D:\\AI2\\PCGLab","start":false,"requestKey":"pcglab-setup-1"}
```

폴더는 자동 생성하거나 이동하지 않는다. 부모와 다른 작업 폴더를 지정해도 같은 프로젝트의
자식 관계를 유지한다. `acedia_project_create`에도 `start: false`를 사용할 수 있다.
기존 등록 폴더를 다시 생성 요청하면 원래 프로젝트만 반환하며 기존 세션을 시작하지 않는다.
새 인수도 중복 생성 검사에 포함하므로 같은 `requestKey`로 다른 폴더·부모·시작 옵션을
보내면 거부한다. 대기로 만든 뒤에는 `acedia_session_settings`에서 Dangerous를 지정하고
`acedia_session_start`로 시작할 수 있다.

실행 중인 기존 세션의 작업 폴더를 바꾸려면 다음 순서를 사용한다.

1. `acedia_session_stop({"sessionId":"대상 ID"})`로 종료한다. 진행 중인 CLI 작업도 중단되므로 종료를 요청받은 대상에 사용한다.
2. `acedia_projects`에서 기존 프로젝트·폴더를 다시 조회하고 `acedia_sessions_relocate`로 등록 경로를 변경한다.
3. 필요하면 `acedia_sessions_organize`로 이름·부모를 변경한다.
4. `acedia_session_start`로 같은 세션과 대화를 재개한다.

종료는 등록 삭제가 아니며 대화·모델·effort·Fast·계정·Dangerous·부모 연결을 보존한다.
현재 화면 배치와 입력 초안을 유지하고, 프로세스가 사라진 것과 저장된
`resumeEligible: false`를 모두 확인해야 `saved: true, active: false`로 응답한다.
이미 꺼진 대상도 대기로 저장할 수 있다. 호출한 자기 세션 종료, 다른 창이 소유한 대상,
진행 중인 작업 분담에서 예약한 대상과 충돌하는 변경은 거부한다.

HTTP 경로는 각각 `POST /integration/v1/workspace/organize-sessions`,
`POST /integration/v1/workspace/stop`이다. 기존 인증·브라우저 Origin 거부·실행 중인
호출 세션 검증을 유지한다. coordinator가 저장을 마친 뒤 main 프로세스가 디스크
스냅샷을 다시 확인하며, 응답 직후 목록에서도 변경된 이름·부모를 조회할 수 있다.
시간 초과는 성공을 의미하지 않는다. 목록을 다시 확인한 뒤 동일한 변경을 재시도한다.
어느 경로도 창 `show/focus/restore`나 세션 화면 선택을 호출하지 않는다.

검증: 관련 9개 파일의 116개 테스트와 TypeScript/Vite 빌드 통과. 격리된 실제
Electron coordinator에서 대기 자식 생성, 이름·부모 변경·해제·재연결, 순환 거부,
실제 지정 폴더에서 CLI 시작, 종료·폴더 이동·재시작, 첫 세션을 실행하지 않는 프로젝트
생성, 저장 결과와 창 포커스·화면 배치·초안 보존을 확인했다. 이 검사는 임시 프로필과
가짜 CLI를 사용하며 실제 사용자 프로젝트·세션은 변경하지 않는다. 새 API 도구 목록은
이 소스를 배포한 뒤 호출 CLI를 다시 시작해야 반영된다.

2026-10-27 소스부터 API로 만든 로컬 Codex 세션은 프로젝트 옵션을 따로 켜지 않아도
`Folder access`의 `Trust and continue`를 호스트가 자동 확인한다. 프로젝트 첫 세션과
작업 분담의 전용 세션에도 적용하며 저장된 생성 기록으로 재시작 후에도 구분한다.
CLI의 현재 폴더·실제 확인 화면·신뢰가 적용될 Git 루트를 확인하고, 모두 현재 등록된
프로젝트 범위 안일 때만 터미널에 Enter 한 번을 보낸다. 창 활성화가 필요하지 않다.
훅 검토·명령 승인·로그인·사용자 질문은 각 확인 경로를 유지한다. `folder-trust`가 계속
남으면 프로젝트 범위와 실제 확인 화면을 점검하며 새 세션·새 전달 키를 만들지 않는다.
사람이 직접 만든 세션은 기존 프로젝트 자동 확인 옵션을 켠 경우에만 처리한다.
자세한 조건은 [세션 시작 자동화](session-organization.md#api-생성-세션의-폴더-신뢰-자동-확인-2026-10-27-배포-전-소스)를 참고한다. 아직 EXE 배포 전이다.

## 기존 세션 백그라운드 시작

[Standard EXE 1.8.1.89](release-1-8-1-89.md)부터 `acedia_session_start`와 인증된
`POST /integration/v1/workspace/start`를 제공한다.
`acedia_projects`에서 기존 세션의 정확한 ID를 조회한 뒤 다음 요청으로 시작한다.

```json
{ "sessionId": "기존 세션 ID" }
```

대상은 coordinator 창에 속한 기존 로컬 Codex·Claude·Qwen·Antigravity 세션이다.
새 세션·창을 만들거나 기존 창의 `show()`·`showInactive()`·`focus()`·`restore()`를
호출하지 않는다. 선택한 세션·탭·분할 화면·입력 포커스·초안을 유지하며, 기존 모델·effort·Fast·계정·
Dangerous·대화 재개 경로로 CLI만 시작한다. 이미 실행 중인 CLI에는 재시작이나 입력을 하지 않는다.
다른 창 소유·SSH·지원하지 않는 도구와 설정 변경으로 잠긴 대상은 오류로 반환한다.

성공 응답 `{ "sessionId": "...", "active": true, "started": true, "background": true }`는
PTY가 실제로 생성된 뒤 반환한다. 이미 실행 중이면 `started: false`다. `active`는 CLI 입력
준비나 작업 접수를 뜻하지 않는다. `acedia_projects`를 다시 읽어 현재 `conversationId`와
준비 상태를 확인한 뒤 `acedia_session_send`로 전달한다. 실패·timeout 때도 상태를 재조회하며
보이는 창 열기로 자동 전환하지 않는다.

기존 **`POST /integration/v1/sessions/:agentId/activate`**도 같은 백그라운드 시작 경로를
사용하도록 변경했다. 이 기존 API는 Codex·Claude 대상과 `202` 성공 상태를 유지하고,
PTY 확인 후 `agentId`와 위 시작 결과를 반환한다. 이전 배포본의 이 API는 창을 표시·선택했다.
Remote/Dashboard의 `/api/session/restart`에서 `restart`를 생략한 요청은 기존 백그라운드
시작 동작을 유지하며, 명시적 `restart: true`만 CLI를 재시작한다. 데스크톱의 사용자가 누른
세션 열기·펫의 보이는 창 열기는 별도 경로다.

호출 CLI는 새 도구가 포함된 앱 업데이트 후 재시작해야 한다. 창 활성화 금지는 이 API의
백그라운드 시작과 충돌하지 않는다. 실제 사용자 세션을 시작하거나 작업을 전달하는 것은
사용자가 요청한 대상·범위에 한한다.

1.8.1.89 배포 소스 검증: 전체 **202개 파일·1,534개 검사**와 TypeScript/Vite production build 통과.
실제 Electron 임시 프로필·모의 CLI에서 두 HTTP 시작 API의 OFFLINE 시작, PTY 확인,
같은 실행 중 대상의 재시작 부재, 대화 등록 ID·작업 폴더·화면 선택·포커스·초안 보존을
확인했다. 모든 기존 창의 `show`·`showInactive`·`focus`·`restore` 호출을 계수해 0회임을
검증하고 새 창이 생성되지 않은 것도 확인했다. 실제 HTTP·stdio MCP에서는 새 도구의
등록·인증·Origin·호출 세션·입력·대상 검사와 시작 결과를 검증했다.
`output/exe-89-tests.log`, `output/exe-89-build.log`,
`output/session-start-family-delivery-electron.log`에 기록했다. 실제 사용자 세션은 변경하지 않았다.

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

[Standard EXE 1.8.1.89](release-1-8-1-89.md)부터 hook이 아직 오지 않은 재개 세션도 정확한 계정·
대화 ID로 로그 경로를 찾는다. 이전 구현은 hook이나 Chat 조회가 먼저 `agentTranscripts`에
경로를 등록해야 전달 검사가 가능했다. 따라서 터미널·대화 ID는 살아 있고 목록에
`WAIT/ready`여도 백그라운드 재개 직후에는 `currentQuestion`이 `null`이 되어 전달을 거부했다.
목록의 `ready`는 터미널과 hook 상태의 요약이며 전달 준비 완료 자체를 보증하지 않는다.

보완한 경로 탐색은 선택한 계정의 transcript root와 정확한 대화 ID만 허용한다.
캐시한 경로를 재사용하고 실패 조회는 15초간 제한한다. 최신 대화·다른 계정으로 대체하지
않으며 기존 256KB tail·시작 이후 파일 갱신·대화 ID·질문·작업 중·빈 입력창·동시 입력
검사를 유지한다. 거절 시 `transcript-unavailable`, `conversation-changed`, `question-pending`,
`turn-working`, `composer-or-runtime-not-ready`, `session-changed`, `input-changed` 중 판정 사유를
오류에 포함한다. 아직 입력하지 않은 거절은 요청 키를 예약하지 않으므로 원인이 해소되면
같은 의도·본문·키로 재시도한다. 이미 전송·수신·시작되었거나 불확실한 요청은 기존의
중복 전송 방지를 따른다.

추가 회귀 검사로 실제 main의 `currentQuestion`과 resolver를 hook 경로가 없는 재개 계정
binding에서 실행해 로그 조회·캐시·다른 계정 거부를 확인했다. 관련 **2개 파일·22개 검사**
통과: `output/session-delivery-main-reader-tests.log`. 설치된 네이티브 Codex와 격리된
가짜 계정·로컬 응답 서버에서 첫 작업 완료 후 기존 대화를 재개하고, hook·Chat 조회 없이
실제 stdio MCP로 수신·새 턴 시작·한글·기존 문맥·동일 키 중복 방지를 확인했다.
`ACEDIA_DELIVERY_RESUME=1`로 실행한 `output/session-delivery-resume-cli-after.log`에 두
성공 marker를 기록했다. 실제 세 Shader 세션에는 테스트 작업을 보내지 않았다.

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
