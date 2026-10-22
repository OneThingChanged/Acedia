---
type: Investigation
title: 채팅 첫 요청 누락 조사와 수정
status: released
last_updated: 2026-10-22
sources:
  - resource: ../app/src/components/ChatView.tsx
  - resource: ../app/scripts/electron-chat-first-message-smoke.mjs
  - resource: ../app/scripts/fixtures/chat-question-renderer.tsx
---

# 채팅 첫 요청 누락 조사와 수정

사용자가 첫 요청에는 반응하지 않다가 “하고 있어?” 같은 후속 메시지를 보내면
진행되는 현상을 보고했다. 조사 시작 HEAD는 `b18b1d14ffb23463cbf36bcc7827bf5e5d0d1c96`
(EXE `1.8.1.89` 게시 기록)이며 작업 트리는 깨끗했다.

## 재현한 경로

데스크톱 Chat에서 아직 제공자 세션 ID가 없는 세션에 시작 대기 중 요청을 보내면
`agentId:unbound` 대기열에 보관된다. 이후 실제 세션 ID가 연결될 때 `ChatView`가
다른 대화로 간주해 새 키의 빈 대기열을 불러왔다. 준비 완료 전에 ID가 연결되는
순서를 fixture로 만들면 첫 요청이 화면에서 사라지고 호스트에도 전달되지 않았다.
준비가 끝난 뒤 보낸 후속 메시지는 별도로 전달될 수 있다.

원본 HEAD의 `ChatView.tsx`를 esbuild의 읽기 전용 로더로 사용한 동일 UI 검사에서
`Initial native session binding lost the first queued request` 실패를 확인했다.
원본 소스를 작업 트리에 되돌려 쓰거나 실제 사용자 세션에 시험 요청을 보내지 않았다.

이 재현은 보고된 증상을 만들 수 있는 한 경로다. 이미 실행 중인 대화에서 정상
접수된 요청이 응답 도중 멈추는 현상이나 제공자 서버 지연까지 같은 원인으로
확정한 것은 아니다. 사용자 환경의 AI 종류와 멈출 때 표시 상태는 추가 확인 대상이다.

## 수정

- 같은 Acedia 세션의 최초 제공자 ID 연결 시 대기열·초안·첨부·전송 방식·인용 문맥·실패 메시지를 옮긴다.
- 전송 중에 최초 ID가 연결되어도 전송 잠금을 유지하고 새 ID로 전달 기록을 저장한다.
- 대기열 상태에 소유 대화 키를 보관해 대화 전환 직후 이전 대화의 요청을 전송하지 않는다.
- 실패하거나 결과가 불확실한 전송은 계속 검토를 기다린다. 자동으로 “깨우기” 메시지를 보내거나 요청을 재전송하지 않는다.

최초 ID 연결과 이미 알려진 두 대화 간 이동을 구분한다. 질문·승인·로그인·모델 변경
대기와 네이티브 터미널의 입력 준비 조건은 기존 경로를 사용한다.

## 이번 검사

모든 실행은 격리된 임시 프로필과 fixture를 사용했다. 아래 결과는 이번 조사에서
직접 실행한 검사이며 과거 릴리스의 전체 검사 수를 포함하지 않는다.

| 검사 | 결과 |
| --- | --- |
| 원본 HEAD + 첫 요청 UI fixture | 첫 ID 연결 시 대기 요청 누락 재현, 예상 실패 |
| `npm run electron:chat-first-message-smoke` | 통과: 시작 대기 요청·초안, 전환/재마운트, 한 번 전달, 전송 중 ID 연결·잠금·기록, 알려진 대화 간 격리, 실패 검토 유지 |
| `npm run electron:chat-delivery-smoke` | 통과: Codex/Claude UI 전달, 중간 지시·완료 예약, 질문 보호, 실패 복구, 대화 격리와 레이아웃 |
| `vitest run electron/services/pty-submit.test.mjs electron/services/chat-message-submission.test.mjs src/lib/chatWorkState.test.ts src/lib/chatSessionModel.test.ts` | 4개 파일, 49개 검사 통과 |
| `tsc --noEmit` | 통과 |
| `vite build` | 통과; 기존 번들 크기 경고 있음 |
| `npm run codex:chat-submit-smoke` + 설치 Codex `0.163.0` | 조사 시작 전 경로에서 통과: 한 줄 한국어 입력과 연속 화면 갱신, 기존 초안 차단·검토 후 재시도. 이번 UI 수정의 사후 검증으로 집계하지 않음 |

로그는 `output/chat-first-message-baseline.log`, `output/chat-first-message-after.log`,
`output/chat-delivery-first-fix.log`, `output/chat-first-targeted-tests.log`,
`output/chat-first-typecheck.log`, `output/chat-first-build.log`,
`output/chat-first-request-native-before.log`에 남겼다.

## 진행 상태

- [x] 실제 사용자 대화에 메시지를 보내지 않고 원본 코드에서 누락 재현
- [x] 최초 세션 연결 시 요청·초안 보존과 전송 중 연결 처리 수정
- [x] 중복 전달 방지·다른 대화 격리·실패 검토 회귀 검사
- [x] 타입 검사와 프런트엔드 빌드
- [ ] 사용자가 겪은 사례의 AI 종류·표시 상태와 이번 재현 경로 대조
- [x] EXE 설치 파일 빌드·격리된 패키지 실행 검사·공개 배포·공개 다운로드 검증
- [ ] 실제 사용자 프로필에서 설치 후 보고된 사례 확인

소스 수정·검증 단계에서는 제품 버전을 변경하지 않았다. 이후 별도 배포 요청으로
[Standard EXE 1.8.1.90](release-1-8-1-90.md)에 포함해 커밋·푸시·공개 게시했다.
고정 소스는 `1641890b9ab7d7cbc018d15b356947b81ca6b1c7`이며 최종 전체 205개 파일·1,555개
검사와 첫 요청 UI 검사를 통과했다. 이번 배포에서도 실제 사용자 세션에 시험 작업을
보내거나 설치 앱을 교체하지 않았다.
