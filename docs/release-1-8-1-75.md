---
type: Release
title: Acedia 1.8.1.75
description: "새 세션 실행 옵션 기억, 채팅 전송 안정화와 이미지 누적 대화의 Codex 통신 수정."
status: stable
last_updated: 2026-10-11
---

# Acedia 1.8.1.75

## 변경 내용

- 새 세션을 성공적으로 만들면 선택한 **agent와 agent별 Dangerous mode**를 기억해 다음 생성 창에 적용한다. 취소하거나 생성에 실패하면 저장하지 않는다. 부모 세션이 있는 경우 해당 agent를 우선하며, 사용할 수 없는 agent와 지원하지 않는 옵션은 제외한다.
- 채팅 메시지를 호스트의 **PTY 전송 절차**로 전달한다. 긴 한글·여러 줄 붙여넣기와 작업 중 추가 입력의 제출 시간을 보완하고, 세션·프로세스 변경과 질문 응답 충돌을 확인한다. 제출이 확인되지 않으면 오류 안내와 함께 큐를 보류하며, 사용자가 터미널을 확인한 뒤 이어서 보낼 수 있다. 불확실한 전송은 자동으로 재전송하지 않는다.
- 이미지가 누적된 Codex 대화에서 Acedia의 작은 통신 제한으로 발생하던 **압축 요청 처리 오류**를 수정했다. 모델·요약 요청의 수신·압축 해제 한도는 128MiB, WebSocket 대기 한도는 256MiB이며 큰 메시지는 8MiB 프레임으로 나눠 전송한다. 압축 해제를 비동기로 처리하며, 용량 초과와 손상된 압축 데이터를 구분한다. 이 값은 Acedia의 통신 한도이며 모델의 토큰·서버 제한은 별도다. 원본 이미지와 대화 기록은 유지하고 Codex 자체 요약을 사용한다.

사용 방법과 구현 범위: [세션 실행 설정](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.75/docs/agent-launch-options.md),
[채팅 전송](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.75/docs/workspace-interactions.md),
[이미지 대화와 Codex 통신](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.75/docs/account-pool.md).
기존 서명 APK **1.8.1.39/code 21**을 포함하는 EXE 업데이트다.

## English

- Remember the agent and each agent's Dangerous mode after successful session creation. Preserve parent-agent precedence and exclude disabled agents or unsupported options. Cancellation and creation failure leave the previous defaults intact.
- Submit Chat messages through the host PTY procedure. Improve long Korean and multiline input, guard against conversation/process changes and question-response conflicts, and hold queued messages when submission is uncertain. Let the user review the terminal before continuing without automatically replaying uncertain input.
- Fix Acedia transport errors in Codex conversations containing accumulated images. Allow model and compaction payloads up to 128MiB, bound WebSocket buffering at 256MiB and fragment large messages into 8MiB frames. Decode compressed bodies asynchronously and distinguish oversized payloads from damaged compression. Preserve images and conversation records while allowing native Codex compaction; model and upstream limits remain separate.

## 검증

- 설치된 Codex **0.162.1**과 격리된 로컬 응답으로 **이미지 18장·약 43MiB 전송 → 대화 재개 → native 요약 → 후속 대화**를 검증했다. 실제 유료 모델 요청이나 사용자 프로필 변경은 없다.
- 이미지·압축·대용량 WebSocket 관련 **4개 파일·105개 검사**와 native 도구·캐시·사용량·계정 분리 회귀 검증을 통과했다.
- 실제 Electron에서 새 세션 옵션 기억·취소·실패·재시작, 긴 한글 채팅 전송·전송 실패 큐 보류·세션 전환을 확인했다.
- 제품 및 Android 소스 버전은 **1.8.1.75**, npm 호환 버전은 **1.8.1**이다. 기존 서명 APK **1.8.1.39/code 21**을 재사용한다.
- 배포 버전의 전체 **184개 파일·1,313개 검사**와 모바일 **24개 검사**, TypeScript·Vite 프로덕션 빌드를 통과했다. Git을 포함한 도구 PATH와 `--maxWorkers=2 --testTimeout=60000`을 사용했다. 기존 큰 번들 경고는 유지된다.

기능 검증 증빙: `output/image-context-final-tests.log`, `output/native-image-context-smoke.log`,
`output/native-tools-context-regression.log`, `output/chat-delivery-ui/`, `.acedia/new-session-ui/`.

배포 전 검사 증빙: `output/full-suite-exe-1.8.1.75.log`, `output/mobile-tests-exe-1.8.1.75.log`,
`output/build-frontend-1.8.1.75.log`, `output/new-session-release-1.8.1.75.log`,
`output/chat-delivery-release-1.8.1.75.log`.
