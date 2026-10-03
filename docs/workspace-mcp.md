---
type: Integration
title: Acedia 프로젝트·세션 MCP
description: 기존 MCP 연결에서 로컬 폴더를 프로젝트로 등록하고 첫 세션과 추가 세션을 생성한다.
status: stable
last_updated: 2026-10-03
sources:
  - resource: ../app/electron/services/workspace-management.mjs
  - resource: ../app/electron/services/workspace-management.test.mjs
  - resource: ../app/electron/services/browser-mcp-server.mjs
  - resource: ../app/electron/services/hook-service.mjs
  - resource: ../app/electron/services/remote-session-create-broker.mjs
  - resource: ../app/src/App.tsx
  - resource: ../app/scripts/electron-workspace-mcp-smoke.mjs
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
위험 모드를 요청할 수 없으며 프롬프트 자동 전송 기능은 포함하지 않는다.

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
