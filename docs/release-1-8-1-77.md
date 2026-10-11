---
type: Release
title: Acedia 1.8.1.77
description: "설정 가능한 기본 모델, 사이드바 호버 동작, 닫힌 콘솔의 EPIPE 오류 방지와 채팅·Codex 통신 리팩토링."
status: stable
last_updated: 2026-10-12
---

# Acedia 1.8.1.77

## 변경 내용

- **설정 → 에이전트 → Codex / Claude → 기본 모델**에서 모델과 effort를 저장하고 Codex Fast의 기본 상태도 지정한다. 모델 설정이 없는 로컬 세션에 적용하며, 세션에 기억된 선택을 우선한다. Remote에서 시작하는 호스트 세션에도 적용한다. 초기값은 Codex `gpt-6.1-sol / xhigh / Fast 꺼짐`, Claude `sonnet / medium`이다. 조회·저장 실패를 안내하고 입력값을 유지하며 실행 중인 세션은 재시작하지 않는다.
- 사이드바 세션의 화면 번호, 경고, 메뉴와 닫기 버튼을 **마우스 호버 또는 키보드 포커스**가 있을 때 표시한다. 항목 폭은 유지하며 완료 표시와 화면별 색상은 계속 보인다. 터치 환경에서는 동작 버튼을 표시한다.
- 앱을 실행한 콘솔이 종료된 뒤 로그 출력에서 발생하던 **`EPIPE: broken pipe, write` 오류 창**을 방지한다. 닫힌 stdout/stderr의 로그 출력을 중단하며 다른 예외는 기존대로 처리한다.
- 1.8.1.76 소스의 **채팅 전송·Codex WebSocket 리팩토링**을 포함한다. 전송 검사와 용량·프레임 처리를 독립 모듈로 분리하고 기존 동작을 유지한다.

사용 방법과 구현 범위: [기본 모델과 세션별 설정](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.77/docs/agent-launch-options.md),
[사이드바 동작](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.77/docs/workspace-interactions.md),
[콘솔 연결 종료](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.77/docs/development-and-build.md#closed-console-output),
[통신 리팩토링](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.77/docs/refactor-chat-transport-2026-10-11.md).
기존 서명 APK **1.8.1.39/code 21**을 포함하는 Standard EXE 업데이트다.

## English

- Configure default models and reasoning effort in **Settings → Agents → Codex / Claude → Default model**, including Codex Fast. Apply defaults to local sessions without remembered model settings, including host sessions started from Remote. Preserve per-session choices, show load/save errors and keep unsaved input without restarting running sessions.
- Show sidebar session screen badges, warnings, menus and close buttons on hover or keyboard focus while preserving row width. Keep completion indicators and screen colors visible, and expose actions on touch devices.
- Prevent main-process **EPIPE error dialogs** after the launching console disconnects. Stop logging to the affected stdout/stderr stream and preserve unrelated error handling.
- Include the 1.8.1.76 chat submission and Codex WebSocket refactor, preserving behavior while separating submission checks and bounded frame transport.

## 검증

- 전체 **188개 파일·1,357개 검사**, TypeScript·Vite 빌드를 통과했다. 버전 갱신 후 버전·APK 계약 **7개 검사**와 렌더러 빌드를 다시 통과했다. 기존 큰 번들 경고는 유지된다.
- 실제 Electron 설정창에서 **123개 검색 항목**, 800/1202/1920px 배치와 기본 모델 저장·복원·effort 호환성·도구별 분리·실패 안내·늦은 응답 무시를 확인했다.
- 실제 main IPC와 격리된 bridge 검사, Remote 모델 선택창의 1024/390px 배치, 사이드바 호버·포커스·위치 유지를 확인했다.
- 실제 Electron의 stdout/stderr 연결을 모두 끊어 `EPIPE` 발생 후에도 오류 창 없이 계속 실행되는 것을 확인했다.
- 제품과 Android 소스 버전은 **1.8.1.77**, npm 호환 버전은 **1.8.1**이다. 포함하는 기존 APK는 **1.8.1.39/code 21**이다.
- 고정 소스 `1a44024a4428c0621b7665e58c3578bc8850c235`를 푸시하고 별도 출력 폴더에서 EXE를 빌드했다. 포함한 기존 APK의 인증서·패키지·아키텍처·SHA-256을 다시 확인했다.
- 실제 packaged Git query·기본 모델 IPC·bridge·문서 브라우저 재사용·Dashboard 검사와 종료·트레이·보안 lifecycle 검사를 통과했다. 패키지의 런타임·렌더러 **294개 파일**이 빌드 원본과 일치한다.
- 설치 파일 FileVersion **1.8.1.77**, npm 호환 ProductVersion **1.8.1**, 설치 파일과 manifest의 크기·SHA-256을 확인했다. Authenticode는 기존 EXE 채널과 같은 `NotSigned`다. packaged 검사에서 기존 `AttachConsole failed` 진단이 출력됐으나 필수 성공 marker와 종료 코드 0을 확인했다.

기능 검증 증빙: `output/model-defaults-epipe-full-tests.log`, `output/model-defaults-build.log`,
`output/model-defaults-settings-full.log`, `output/model-defaults-bridge.log`,
`output/stdio-epipe-smoke.log`, `output/sidebar-hover-check.mjs`.

배포 검증 증빙: `output/version-checks-1.8.1.77.log`, `output/build-frontend-1.8.1.77.log`,
`output/build-exe-1.8.1.77-isolated.log`, `output/packaged-smoke-1.8.1.77.log`,
`output/packaged-lifecycle-1.8.1.77.log`, `output/exe-release-1.8.1.77/local-verification.json`,
`output/publish-exe-1.8.1.77.log`, `output/public-update-verification-1.8.1.77.log`,
`.build-tools/public-verified-1.8.1.77.json`.

## 공개 배포

- [GitHub 안정 릴리스 v1.8.1.77](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.77)를 2026-10-12 **03:01:45 KST**에 게시했다. 태그와 빌드 소스는 `1a44024a4428c0621b7665e58c3578bc8850c235`이다.
- **03:02:26 KST**에 **1.8.1.75·1.8.1.76 → 1.8.1.77** 업데이트 감지, 공개 설치 파일 전체 다운로드와 세 자산의 크기·SHA-256 검증을 통과했다. 1.8.1.76은 별도 공개 설치 파일이 없는 소스 버전이며 업데이터의 현재 버전 입력으로도 확인했다.
- 기존 APK를 포함한 Standard EXE 배포다. 사용자 앱·프로필을 변경하거나 설치 파일을 실행하지 않았다. 앱 설정의 **Check → Update**로 적용한다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.77-x64.exe` | 151352844 | `e4335f324abbf4122c036a043d553ab897455f613881cd236b4bb6857fd34b6f` |
| `Acedia-Setup-1.8.1.77-x64.exe.blockmap` | 159282 | `47bdebb5e8ea632000374b1c6b81a5f389e12d73cf7ee60542bc822441d1240d` |
| `latest-exe.json` | 256 | `1811185111acfdf4b6714b30877aafa2e0512e196193bd738abf5fd918c9d7af` |
