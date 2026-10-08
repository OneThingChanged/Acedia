---
type: Release
title: Acedia 1.8.1.69
description: "답변별 변경 파일 요약·diff, 채팅 지연 개선, 긴 대화의 현재 모델 조회와 Apply 수정."
status: draft
last_updated: 2026-10-09
---

# Acedia 1.8.1.69

## 변경 내용

- 문서·코드 수정 결과를 답변 아래 **수정 파일 요약**으로 표시한다. 처음 3개 파일, 확인 가능한 추가·삭제 줄 수와 **변경 보기**를 제공하고, 전체 파일은 검색 가능한 팝업에서 개별 diff와 경로를 확인한다. 삭제 파일도 목록에 남긴다. 원본을 알 수 없는 전체 쓰기에는 줄 수를 추정하지 않는다.
- 긴 대화에서 파일 경로 탐색과 동기 파일 확인 때문에 발생하던 **채팅 지연**을 줄였다. 파일 확인을 비동기로 제한·캐시하고, 중복 조회를 합치며 접힌 작업의 diff는 펼칠 때 표시한다. 기존 메시지와 이미지 요소를 유지하고 세션 전환 후 늦게 도착한 이전 기록을 무시한다.
- 큰 이미지·긴 작업 기록 뒤에서도 **현재 모델과 effort**를 찾는다. 기록을 역방향으로 읽고 최신 모델 정보를 캐시한다. 팝업에서 현재 모델을 표시하고 긴 목록에서도 선택 항목이 보이도록 이동한다.
- 입력창의 **모델 버튼 하나**에서 모델과 추론 강도(effort)를 함께 설정한다. 같은 설정을 고르면 이미 적용된 값이라고 안내한다. 상태 hook이 없는 재개된 Codex에서도 실제 빈 입력창으로 준비를 확인하여 **Apply가 계속 잠기던 문제**를 수정했다. 작업·질문·입력·대기열 중 변경 제한과 같은 계정·대화로 이어가는 동작을 유지한다.

사용 방법: [워크스페이스 동작](workspace-interactions.md).
기존 서명 APK **1.8.1.39/code 21**을 포함하는 EXE 업데이트다.

## English

- Show **changed-file summaries** beneath their own response: three inline paths, verified added/deleted line counts and **View changes**. Search all files and inspect individual diffs in a dialog. Retain deleted files and omit totals when the original contents are unknown.
- Reduce **Chat delays** from path discovery and synchronous file checks. Limit and cache asynchronous checks, combine repeated refreshes and render collapsed tool diffs only when expanded. Preserve existing messages and images and ignore late history responses after switching sessions.
- Find the **current model and reasoning effort** even behind large images or long tool output. Read backward in chunks, cache the latest model metadata and keep the current selection visible in long catalogs.
- Configure model and effort from **one model button**. Explain unchanged settings and fix **Apply staying disabled** in resumed Codex sessions with missing hooks by verifying the empty native composer. Preserve protection for work, questions, drafts and queued input while resuming the same account and conversation.

## 검증

- 버전 갱신 후 전체 **180개 파일·1,226개 검사**와 모바일 설정·연결 검사 **24개**를 모두 통과했다. 전체 검사에는 이전 병렬 실행에서 실패했던 Store WACK 테스트도 포함한다. 이번 실행은 worker 2개와 검사 제한 60초를 사용했고 실패·건너뛴 검사는 없다.
- 940·390·300px 격리 Electron에서 모델·effort 통합 버튼, 같은 설정 안내, 준비 갱신 후 Apply 활성화, 선택 보존, 작업·질문 중 변경 제한과 실패 처리를 확인했다. 1440px App 렌더러에서 영속 설정·모델 상속·같은 대화와 계정 재실행을 통과했다.
- 1440·390·300px의 파일 요약·개별 diff·검색 팝업과 데스크톱·Remote 질문·로그인·시작 확인·이미지 보존·작업 상태 검사를 통과했다. 검사용 IPC·CLI·클립보드를 사용했고 실제 사용자 세션의 모델은 바꾸지 않았다.
- 실제 대화 저장소의 최근 400개 블록·3개 표본은 첫 조회 61.2~81.8ms, 캐시 조회 7.3~9.6ms였다. 수정 작업 160개·diff 25,600줄을 접은 Electron 화면은 DOM 103개·요약 표시 약 154ms였다. 이 개발 PC의 표본이며 다른 크기의 이전 기록과 직접 배수 비교하지 않는다.
- npm 버전 **1.8.1**, 제품 버전·Android 소스 versionName **1.8.1.69**를 맞췄다. 새 APK를 생성하지 않고 기존 서명 APK **1.8.1.39/code 21**을 재사용한다.

EXE 빌드·패키지·공개 다운로드 검증 결과는 완료 후 이 문서에 추가한다.
상세 구현·검사 기록: [채팅 UX 검토](chat-ux-review-2026-10-08.md).

로컬 증빙: `output/full-suite-exe-1.8.1.69-summary.json`,
`output/full-suite-exe-1.8.1.69.json`, `output/mobile-tests-exe-1.8.1.69.log`,
`output/chat-model-apply-tests.json`, `output/chat-model-ui/`,
`output/chat-files-ui/`, `output/chat-page-performance.json`.

## 공개 배포

EXE 빌드·검증·게시 준비 중이다.
