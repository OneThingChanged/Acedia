---
type: Engineering Review
title: Chat submission and Codex transport refactor
description: "1.8.1.75 배포 후 채팅 전송 검사와 Codex WebSocket 전송을 독립 모듈로 분리한 소스 변경."
status: stable
last_updated: 2026-10-11
sources:
  - resource: ../app/electron/services/chat-message-submission.mjs
  - resource: ../app/electron/services/chat-message-submission.test.mjs
  - resource: ../app/electron/services/codex-websocket.mjs
  - resource: ../app/electron/services/codex-websocket.test.mjs
  - resource: ../app/electron/services/codex-transport-limits.mjs
---

# 채팅 전송·Codex 통신 리팩토링

[1.8.1.75 EXE 배포](release-1-8-1-75.md)와 공개 다운로드 검증을 완료한 뒤 진행한
**1.8.1.76 소스 변경**이다. 공개 배포 버전은 1.8.1.75이며 이 리팩토링의 새 설치 파일은
게시하지 않았다. 제품과 모바일 소스의 네 번째 자리만 올리고 npm 버전은 1.8.1로 유지한다.

## 변경 내용

| 역할 | 담당 모듈 |
| --- | --- |
| IPC 입력 검증·창의 세션 소유권·런타임 연결·대화 캐시와 hook 반영 | `main.mjs`와 `terminal-handlers.mjs` |
| 활성 프로세스·대화·질문 충돌 검사와 대화 초기화 확인 | `chat-message-submission.mjs` |
| 붙여넣기·Enter 순서와 시간·실제 PTY의 중복 제출 잠금 | `pty-submit.mjs` |
| native 인증·RPC·계정 알림·세션 수명 | `account-pool-session.mjs` |
| JSON 직렬화·UTF-8 용량·송신 대기 한도·프레임 분할 | `codex-websocket.mjs` |
| HTTP와 WebSocket의 공통 통신 한도 | `codex-transport-limits.mjs` |

메인 프로세스에서 직접 수행하던 채팅 전송 검사를 독립 서비스로 옮겼다. Electron의
전역 상태를 주입해 실제 PTY 전송 코드와 함께 검사한다. `/clear`·`/new`의 확인에서는
원래 프로세스를 유지한 채 대화 ID 변경을 허용한다. 캐시와 hook은 확인 후 호출자가 반영한다.

WebSocket 전송을 native 계정 관리와 분리하고, 8MiB 프레임 크기를 공통 한도 파일에
모았다. 한 메시지를 나누는 방식, 128MiB 메시지 한도와 256MiB 대기 한도는 유지한다.
세션 설정 저장 형식·IPC 계약·큐 UI·재전송 정책은 그대로 사용한다.

## 검증

- 관련 **7개 파일·81개 검사**를 통과했다. 실제 `TerminalSessionService`와 `submitPtyMessage`를 함께 사용해 질문 조회 중 소유권 변경, 붙여넣기 후 프로세스·대화 변경, 겹친 제출 잠금, async 질문 중 steering, 초기화 확인 실패와 캐시 반영 시점을 확인했다.
- 실제 loopback WebSocket에서 한글·이모지가 프레임 경계에 걸린 큰 JSON을 **하나의 text RPC**로 다시 조립하고 다음 RPC를 별도로 받는지 확인했다. 닫힌 소켓과 용량·대기 한도 초과도 검사했다.
- 설치된 **Codex 0.162.1**에서 격리된 로컬 응답으로 이미지 18장·약 43MiB 전송, 재개, native 요약과 후속 대화를 통과했다. 유료 모델 요청과 사용자 대화 변경은 없다.
- TypeScript·Vite 프로덕션 빌드를 통과했다. 기존 큰 번들 경고는 유지된다.
- 변경 후 전체 **186개 파일·1,341개 검사**를 `--maxWorkers=2 --testTimeout=60000`으로 통과했다. Git을 포함한 도구 PATH를 사용했으며 건너뛴 검사는 없다.
- 격리된 프로필에서 실제 Electron main을 실행해 문서 브라우저 재사용·Electron bridge·MiraControl bridge 성공 marker와 종료 코드 0을 확인했다. 기존 `AttachConsole failed` 진단은 유지된다.

증빙: `output/refactor-submission-transport-tests.log`, `output/refactor-native-image-context-smoke.log`,
`output/build-frontend-refactor-1.8.1.76.log`, `output/full-suite-refactor-1.8.1.76.log`,
`output/refactor-electron-bridge-smoke.log`.
