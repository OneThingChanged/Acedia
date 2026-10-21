---
type: Release
title: Acedia 1.8.1.87
description: "기존·OFFLINE 세션 Dangerous 설정의 공개 로컬 API와 MCP 조회·저장 지원."
status: validating
last_updated: 2026-10-22
---

# Acedia 1.8.1.87

## 변경 내용

- 기존 로컬 세션의 Dangerous 설정을 조회·저장하는 **`acedia_session_settings` MCP**와 인증된 **`POST /integration/v1/workspace/session-settings` API**를 제공한다. 대상 세션이 **OFFLINE**이어도 설정을 저장할 수 있다.
- 로컬 Codex·Claude·Qwen·Antigravity를 지원한다. 조회한 `dangerous`를 `expectedDangerous`로 전달하며, 정확한 불리언·대상·편집 가능 여부와 충돌을 검증한다. coordinator가 저장한 workspace snapshot의 실제 값을 main이 확인한 뒤 성공을 반환한다.
- 설정 저장은 화면·세션 선택·포커스·입력 초안을 유지한다. OFFLINE 세션을 시작하거나 실행 중인 CLI를 재시작하지 않으며 **다음 세션 실행부터 적용**한다. 모델·effort·계정·이름과 새 세션 기본값은 유지한다.
- 시간 초과·저장 실패를 성공으로 처리하지 않는다. 저장 상태를 재조회한 뒤 재시도할 수 있다. SSH·지원하지 않는 도구와 다른 작업창에 분리된 세션의 수정은 거부한다.

업데이트 후 새 MCP 도구를 사용할 호출 세션을 **Restart**한다. API 사용법과 적용 범위는 [Workspace MCP](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.87/docs/workspace-mcp.md#기존-세션-dangerous-설정)를 참고한다.

Standard EXE 업데이트다. 기존 서명 APK **1.8.1.39/code 21**을 재사용한다.

## English

- Add **`acedia_session_settings` MCP** and authenticated **`POST /integration/v1/workspace/session-settings`** to read and save Dangerous mode for existing local sessions, including **OFFLINE** targets.
- Support Codex, Claude, Qwen and Antigravity with exact booleans, previously read settings, target validation and conflict handling. A successful response requires the main process to verify the coordinator's saved workspace snapshot.
- Preserve the selected session, pane, focus and draft. Saving never starts an offline session or restarts a running CLI; changes **apply on the next session start**. Keep model, effort, account, name and new-session defaults.
- Treat persistence failures and timeouts as failures. Read back before retrying. Reject SSH, unsupported tools and targets detached into another workspace window.

Restart the calling CLI after updating to load the new MCP tool. This Standard EXE release reuses the signed Android **1.8.1.39/code 21** artifact.

## 검증

- 기능 구현 후 전체 **199개 파일·1,489개 검사** 통과: `output/session-launch-settings-tests.log`. 이후 제품 코드는 유지하며 배포 버전 메타데이터를 갱신했다.
- 실제 HTTP·stdio MCP에서 인증·Origin·호출 세션·입력·OFFLINE 조회/변경을 확인했다. 서비스 검사로 네 도구, 충돌·동시 수정·저장 실패·timeout·종료·늦은 응답을 검증했다.
- 실제 Electron의 임시 프로필·모의 CLI에서 OFFLINE·실행 중 세션을 함께 저장하고 디스크 snapshot, 화면·포커스·초안 보존과 자동 시작·재시작 부재를 확인했다. 별도로 세션을 다시 열어 다음 CLI가 저장된 Dangerous 인수를 받는 것을 확인했다. `output/session-launch-settings-electron.log`.
- 버전·APK 검증·runtime variant **3개 파일·15개 검사**와 네이티브 PTY 검사 통과: `output/exe-87-version-tests.log`, `output/exe-87-pty-smoke.log`.
- TypeScript·Vite 빌드, 패키지와 공개 다운로드 검증 결과는 배포 실행 뒤 기록한다.

## 배포 기록

배포 검증 진행 중이다. 소스 제품 버전·Android 소스 versionName은 **1.8.1.87**, npm 호환 버전은 **1.8.1**이다. 새 APK·Company·Microsoft Store 배포는 실행하지 않는다.
