---
type: Release
title: Acedia 1.8.1.71
description: "Codex 작업 중 질문의 Chat·Remote 누락 및 답변 단축키 호환 수정."
status: internal
last_updated: 2026-10-09
---

# Acedia 1.8.1.71

## 변경 내용

- Codex의 **작업 중 질문이 Chat·Remote에 보이지 않던 문제**를 수정했다. 현재 터미널의 `Shift+Tab` 안내와 이전 `Shift+↑`·`Shift+Up` 안내를 모두 인식하여 실제 대기 중인 질문을 표시한다.
- 채팅 입력창 위의 **작업 중 질문**에서 선택 또는 직접 입력으로 답한다. 답변 서비스는 현재 안내에 맞는 단축키로 Codex 폼을 열고 질문·선택 상태를 확인한 뒤 답변을 전달한다. 질문과 함께 Working 상태를 유지하며, 일부 답변 후에는 남은 질문만 표시한다.
- 질문이 사라졌거나 다른 질문으로 바뀌면 답변을 중단한다. 일반 예약 메시지에는 답변 키를 보내지 않으며 기존 중복 제출·변경된 폼 보호를 유지한다.

사용 방법: [워크스페이스 동작](workspace-interactions.md).
기존 서명 APK **1.8.1.39/code 21**을 포함하는 EXE 업데이트다.

## English

- Fix missing **Codex questions during work** in Chat and Remote. Recognize the live `Shift+Tab` hint as well as older `Shift+Up` hints before exposing a queued question.
- Answer using choices or free text in the pinned question form. Open the native Codex form using its advertised shortcut, verify the question and selection, then deliver the answer. Keep Working visible and retain only unanswered questions after a partial response.
- Stop delivery when a question disappears or changes. Leave ordinary queued messages untouched and preserve duplicate-submission and stale-form protection.

## 검증

- 질문 파싱·실제 호스트의 `currentQuestion` 화면 판별·답변 전송 관련 **56개 검사**를 통과했다. 두 질문의 선택·직접 입력, 이전 단축키 호환과 변경된 폼 보호를 확인했다.
- 격리 Electron의 Desktop·Remote 질문 검사를 통과했다. 긴 한글 질문의 **800·420px** 레이아웃에서 질문·전송 버튼을 확인하고 일부 답변 후 남은 질문 표시, 단일 Working 상태 바를 검증했다.
- 실제 격리 Codex CLI의 동기 질문에서 선택·직접 입력·두 질문·작업 재개 회귀 검사를 통과했다. 로컬 mock transport에는 비동기 도구가 노출되지 않아 실제 CLI의 비동기 입력은 이 실행으로 검증하지 못했다. 새 단축키의 비동기 경로는 실제 호스트 함수와 답변 서비스 검사로 검증했다. 사용자 세션에 대신 답하지 않았다.
- 버전 갱신 후 전체 **180개 파일·1,242개 검사**와 모바일 설정·연결 검사 **24개**를 모두 통과했다. worker 2개·검사 제한 60초로 실행했고 최종 실패·건너뛴 검사는 없다.
- 전체 검사 첫 실행에서는 원격 Markdown 미리보기 1개가 HTTP 500으로 실패했다. 동일 검사의 단독 재실행과 전체 재실행은 통과하여 원인을 재현하지 못했다. 이후 실패 시 응답 본문을 함께 출력하도록 해당 assertion의 진단 정보를 추가했다. 최초 실패 로그와 전체 재실행 증빙을 모두 보존한다.
- 재사용 APK **1.8.1.39/code 21**의 패키지·아키텍처·서명 인증서·SHA-256을 확인했다. npm **1.8.1**, 제품 버전·Android 소스 versionName **1.8.1.71**을 맞췄다.
- 고정 소스 빌드·패키지 실행·공개 다운로드 검증은 배포 과정에서 기록한다.

로컬 증빙: `output/codex-async-question-tests.log`,
`output/codex-async-question-chat-smoke.log`,
`output/codex-question-cli-regression.log`, `output/codex-async-question-build.log`,
`output/full-suite-exe-1.8.1.71.json`, `output/full-suite-exe-1.8.1.71-rerun.json`,
`output/full-suite-exe-1.8.1.71-summary.json`, `output/exe-1.8.1.71-markdown-targeted.log`,
`output/mobile-tests-exe-1.8.1.71.log`, `output/apk-reuse-verification-1.8.1.71.log`.
화면: `output/chat-async-question-800.png`, `output/chat-async-question-420.png`.

## 배포 상태

고정 소스 `95e342e`의 EXE 로컬 빌드까지 완료했다. 공개 릴리스는 생성하지 않았다.
사용자의 스크린 색상·제공자 로고 추가 요청을 반영하여 [1.8.1.72](release-1-8-1-72.md)로 통합 배포한다.
