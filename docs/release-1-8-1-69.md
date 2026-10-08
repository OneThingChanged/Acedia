---
type: Release
title: Acedia 1.8.1.69
description: "답변별 변경 파일 요약·diff, 채팅 지연 개선, 긴 대화의 현재 모델 조회와 Apply 수정."
status: stable
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

- TypeScript·Vite 빌드와 고정 소스의 Standard EXE 빌드를 통과했다. 사용 중인 앱이 기본 출력 폴더의 `app.asar`를 잠그고 있어 **별도 출력 폴더** `app/electron-dist/exe-1.8.1.69/`에서 생성했다. 제품 소스는 변경하지 않고 빌드 CLI의 `--publish never`를 한 번만 전달했다. 기존 앱과 사용자 세션을 종료하지 않았다.
- 해당 패키지의 bridge·Dashboard·Git·네이티브 PTY·종료·트레이·보안 검사를 통과했다. 검사 실행 경로만 별도 출력 폴더로 바꿨고 기존 검증 조건을 유지했다. 패키지의 renderer·runtime **278개 파일**이 빌드 원본과 일치한다. 콘솔 목록 보조 프로세스의 `AttachConsole failed` 진단 8회는 이전 버전과 같으며 필수 검증은 모두 통과했다.
- 설치 파일 FileVersion **1.8.1.69**, 크기·SHA-256과 같은 빌드의 `latest-exe.json` 일치를 확인했다. Authenticode 상태는 기존 채널과 같은 `NotSigned`다. 포함된 APK **1.8.1.39/code 21**의 서명 인증서·패키지·아키텍처·해시도 검증했다.
- 공개 업데이터의 **1.8.1.67·1.8.1.68 → 1.8.1.69** 감지와 실제 설치 파일 다운로드를 통과했다. EXE·blockmap·manifest의 크기·해시, 최신 안정 릴리스와 소스 태그가 일치한다.

상세 구현·검사 기록: [채팅 UX 검토](chat-ux-review-2026-10-08.md).
실제 사용자 앱의 업데이트 설치·재시작과 Android 기기 동작은 별도 검증이다.

로컬 증빙: `output/full-suite-exe-1.8.1.69-summary.json`,
`output/full-suite-exe-1.8.1.69.json`, `output/mobile-tests-exe-1.8.1.69.log`,
`output/chat-model-apply-tests.json`, `output/chat-model-ui/`,
`output/chat-files-ui/`, `output/chat-page-performance.json`,
`output/build-exe-1.8.1.69-isolated-final.log`,
`output/packaged-smoke-1.8.1.69.log`, `output/packaged-lifecycle-1.8.1.69.log`,
`output/exe-release-1.8.1.69/local-verification.json`,
`output/public-update-verification-1.8.1.69.log`,
`output/exe-1.8.1.69-public-verify/`, `.build-tools/public-verified-1.8.1.69.json`.

## 공개 배포

- [GitHub 안정 릴리스 v1.8.1.69](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.69)를 2026-10-09 **02:13:35 KST**에 게시했다.
- 소스·태그는 `a547e79f28329489efe384fef3080b3039432df7`이다. 설치 파일은 `origin/main`에 푸시한 이 고정 소스에서 만들었다. 기존 서명 APK를 포함하는 EXE 배포이며 Microsoft Store 제출·새 APK 빌드는 실행하지 않았다.
- **02:15:17 KST**에 공개 다운로드·업데이트 검증을 완료했다. 설치 파일을 실행하는 대신 공개 업데이터의 다운로드·무결성 검증 완료 상태를 확인했다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.69-x64.exe` | 151324411 | `95da65b0d3840a32719a15c990c48509f3150a56013a65774aaf88a658b22508` |
| `Acedia-Setup-1.8.1.69-x64.exe.blockmap` | 159318 | `d097989531129c381ea656da3952b4f087b9e40f098d42f8762ade3e27e5b9cf` |
| `latest-exe.json` | 256 | `2210068dd398a5c8461ff9fc1bb1a7583c5b7de1631f47f25f0459618e951654` |
