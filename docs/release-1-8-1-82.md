---
type: Release
title: Acedia 1.8.1.82
description: "Qwen 터미널 갱신 안정화, Claude 공통 자동 감지, 채팅 단계별 로딩·전송과 사이드바 개선."
status: internal
last_updated: 2026-10-15
---

# Acedia 1.8.1.82

## 변경 내용

- Qwen 터미널의 화면 지우기·다시 그리기가 조각별로 노출되는 문제를 수정했다. 완성된 화면 갱신을 묶어서 전달하고 로컬 Qwen의 동기 화면 출력을 활성화한다. 중첩 갱신 신호를 처리하며 누락된 종료 신호·큰 출력은 제한 시간과 버퍼 상한으로 처리한다.
- Claude 설치 후 Acedia에 예전 PATH가 남아 있어 실행 파일을 찾지 못하는 문제를 수정했다. 신규·재개·재시작 세션, 계정 로그인, 모델 조회가 최신 Windows 설치 경로를 자동 감지한다. 계정별 환경과 사용자가 명시한 실행 설정을 유지하며 세션마다 설치 경로를 지정할 필요가 없다.
- 데스크톱·Remote·Dashboard 채팅은 최근 대화 5묶음부터 읽고, 위로 스크롤하면 이전 대화를 추가한다. 갱신 시 새 기록만 요청하고, 이전 기록을 읽는 중 답변이 들어와도 읽던 위치를 유지한다. 실패한 이전 기록 요청은 대화를 유지한 채 재시도한다.
- 이미지는 화면 가까이에서 읽고 작업 출력·수정 상세는 펼칠 때 불러온다. 대화 캐시를 제한하고 큰 원본 기록은 백그라운드로 정리해 첫 화면 부담을 줄였다. 작업·질문·큐는 대화 페이지와 별도로 유지한다.
- 한 줄 채팅을 전송할 때 상태줄 갱신 때문에 Enter가 전달되지 않던 문제를 수정했다. 전송 전에 실제 Codex 입력란을 확인해 남은 문장 위에 재전송 내용을 이어 붙이지 않는다. Remote 큐에서 전송되지 않은 이유와 터미널 확인을 제공한다.
- Codex의 실행 명령 승인 질문을 채팅에서도 확인하고 답변할 수 있다. 한 번 허용·해당 명령 접두사 기억·거부를 제공하며 현재 명령과 선택이 바뀌면 이전 질문의 답변을 전송하지 않는다.
- 세션 우클릭에 Restart를 추가했다. 같은 대화와 모델·effort·Fast·계정 선택을 유지하면서 다시 시작하고, 중복 재시작과 실패한 준비 과정을 처리한다. 데스크톱·Remote에서 지원한다.
- 사이드바의 스크린·알림·메뉴·닫기 표시는 평소 공간을 차지하지 않고 호버·키보드 탐색 때 표시한다. Done 글자 배지를 제거해 세션명을 넓게 표시하며 완료 강조와 알림은 유지한다.
- 소스 1.8.1.81의 Remote 터미널 마지막 줄 잘림과 오래된 Luna 모델 표시 수정도 포함한다. 현재 native 모델 설정과 화면 상태줄을 다시 맞춘다.

Standard EXE 업데이트다. 기존 서명 APK **1.8.1.39/code 21**을 재사용하며 Remote 웹 변경은 호스트 업데이트로 제공한다.

## English

- Stabilize Qwen terminal repaints by forwarding complete redraws together and enabling synchronized output for local sessions. Handle nested repaint markers and bound incomplete frames and buffering while preserving terminal content and cursor behavior.
- Automatically discover newly installed Claude CLIs for new, resumed and restarted sessions, account sign-in and model help, even when Acedia inherited an older Windows PATH. Preserve account isolation and explicit launch overrides.
- Load the latest five complete conversation turns first, fetch older turns on upward scroll and use incremental live updates. Preserve the reading position during concurrent older reads and new replies; retain history on failure and offer retry.
- Load nearby images and expanded work details on demand. Bound rendering caches and index large transcripts in the background while keeping work state, questions and queues independent.
- Send single-line Chat messages despite continuous footer repaints. Check the native Codex composer before pasting to prevent concatenated retry messages; explain blocked Remote queue submissions and provide terminal review.
- Answer Codex execution approvals from Chat, with allow once, remember command prefix and deny. Validate the current command and native selection before sending an answer.
- Add session context-menu Restart on desktop and Remote, preserving conversation identity, model, effort, Fast and account selection.
- Hide sidebar trailing actions until hover or keyboard focus and remove the Done text badge to show longer session names while retaining completion highlighting and notifications.
- Include the previously source-only 1.8.1.81 fixes for Remote terminal clipping and stale model labels.

## 검증

- 일반 전체 검사 190개 파일·1,380개 테스트와 별도 사용량·Electron 서비스 검사 21개가 통과했다. 이후 추가한 Qwen watchdog 세션 수명 검사 1개도 포함해 총 1,402개 검사를 확인했다.
- TypeScript와 Vite 프로덕션 빌드가 통과했다.
- 실제 Electron 화면에서 중첩 갱신 도중의 빈 화면이 노출되지 않는 것을 확인했다. 격리된 Qwen 0.25.1의 초안·커서 출력 68조각을 31묶음으로 전달했고 최종 화면·대화 내용이 동일했다. 모델 요청은 0건이다.
- 생성 창·프로젝트 보드·세션 사용량·native PTY를 실제 Electron에서 검증했다. PC·모바일 창에서의 기존 채팅 페이지·승인·질문·큐·재시작 검사도 통과했다.

고정 소스 빌드, packaged 실행·종료 검사와 공개 다운로드 검증 결과를 아래 배포 기록에 추가한다.

앞선 격리 검증에서는 200-turn 채팅 fixture의 초기 응답이 703,351바이트에서 11,713바이트로 줄었고,
PC·모바일 Remote/Dashboard의 페이지 로딩·상세 요청·스크롤 유지·재시도를 확인했다. 실제 외부망 속도 측정은 아니다.
실제 Codex CLI와 모의 로컬 모델에서 한 줄 입력의 단일 전달, 남은 초안의 전송 차단과 확인 후 재시도도 검증했다.

동작 규칙은 [Claude 계정](claude-accounts.md), [Workspace interactions](workspace-interactions.md),
[Remote service](remote-service.md)에 기록했다.

## 배포 기록

검증 중이다. 소스 버전은 **1.8.1.82**, npm 호환 버전은 **1.8.1**이고 Android 소스 버전도 1.8.1.82다.
APK versionCode는 새 APK를 만들지 않아 21을 유지한다. 공개 게시 여부와 설치 여부는 별도로 기록한다.
