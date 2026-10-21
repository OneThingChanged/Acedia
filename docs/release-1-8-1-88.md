---
type: Release
title: Acedia 1.8.1.88
description: "앱 종료 없이 기존 비활성 세션의 프로젝트 소속·작업 폴더를 변경하는 공개 로컬 API와 MCP."
status: stable
last_updated: 2026-10-22
---

# Acedia 1.8.1.88

## 변경 내용

- **`acedia_sessions_relocate` MCP**와 인증된 **`POST /integration/v1/workspace/relocate-sessions` API**로 기존 비활성 로컬 세션 1~20개의 프로젝트 소속·작업 폴더를 변경한다. 앱 종료나 저장 파일 직접 편집 없이 처리하며 `acedia_projects`에서 현재 등록 폴더도 조회할 수 있다.
- 대상 프로젝트는 이미 등록되어 있고 새 작업 폴더는 존재해야 한다. 실제 파일·디렉터리 이동과 프로젝트 루트 등록 변경은 별도다. 실제 디렉터리를 먼저 옮겨 이전 폴더가 없어도 세션 등록을 갱신할 수 있다.
- 기존 프로젝트·폴더를 확인하고 전체 요청을 검증한 뒤 저장 직전에 다시 검증한다. 실행 중·시작 중·복구 중인 대상, SSH, 다른 창의 대상과 미완료 작업 분담 세션은 거부한다. 부모·자식 프로젝트 불일치, 미지정 자식의 상속 폴더 변경과 서로 다른 고정 대화의 충돌도 거부한다.
- 세션 ID·이름·대화·계정·Dangerous·실행 옵션, 화면 배치·포커스·입력 초안을 보존한다. 이동한 세션은 비활성으로 유지하고 명시적으로 다시 열 때 새 작업 폴더를 적용한다. Codex·Claude·Antigravity의 기존 대화 조회 경로를 기억하고, Codex·Claude 모델 기억 저장소에서 해당 세션·계정의 모델·effort·Fast·예약 선택을 이어간다.
- 저장 중인 대상의 동시 시작·계정 변경을 막는다. main이 실제 저장된 세션 등록을 확인한 뒤 성공을 반환하며, 시간 초과·저장 실패는 성공으로 처리하지 않는다. 같은 목적지로 재시도해도 세션을 중복 생성하지 않는다.

업데이트 후 새 MCP 도구를 사용할 호출 세션을 **Restart**한다. 사용법과 지원 범위는 [Workspace MCP](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.88/docs/workspace-mcp.md#기존-세션-소속작업-경로-변경)를 참고한다.

Standard EXE 업데이트다. 기존 서명 APK **1.8.1.39/code 21**을 재사용한다.

## English

- Add **`acedia_sessions_relocate` MCP** and authenticated **`POST /integration/v1/workspace/relocate-sessions`** to change the registered project and working folder of 1–20 existing inactive local sessions without closing the app. Include the registered session folder in `acedia_projects` results.
- Require a registered destination project and an existing destination folder. This changes session registration; moving physical directories and changing project roots remain separate operations. The previous physical folder may already have been moved.
- Validate the entire request and revalidate immediately before saving. Reject running, starting or recovering targets, SSH, sessions in another window, unfinished orchestration, hierarchy conflicts, unintended inherited folder changes and conflicting pinned conversations.
- Preserve session identity, conversations, account, Dangerous mode, launch options, panes, focus and drafts. Keep relocated sessions inactive until explicitly reopened in the new working folder. Retain conversation lookup context for Codex, Claude and Antigravity, and Codex/Claude model memory for the same session/account, including effort, Fast and pending selection.
- Block concurrent starts and account switches during persistence. Report success only after verifying the saved registry. Treat timeouts and persistence failures as failures; retrying the same destination does not create duplicate sessions.

Restart the calling CLI after updating to load the new MCP tool. This Standard EXE release reuses the signed Android **1.8.1.39/code 21** artifact.

## 검증

- 최종 기능 소스의 전체 **201개 파일·1,505개 검사** 통과: `output/session-relocation-tests.log`. 배포 단계에서는 기능 코드를 유지하고 제품 버전 메타데이터를 갱신했다.
- 실제 HTTP·stdio MCP와 서비스·IPC·순수 상태 변환 검사로 입력·상태·소유권·경로·계층·동시 수정·저장 실패·timeout·늦은 응답과 모델 기억 이동을 확인했다.
- 실제 Electron 임시 프로필·모의 CLI에서 실행 중 대상 거부, 두 세션의 등록·디스크 저장·설정·포커스·초안 보존, 비활성 유지와 명시적 재개 후 새 폴더의 네이티브 CLI 시작을 확인했다. 다른 실행 중 세션과 원래 디렉터리도 유지했다. `output/session-relocation-electron.log`.
- TypeScript·Vite production build 통과: `output/session-relocation-build.log`.
- 버전·APK 검증·runtime variant **3개 파일·15개 검사**와 네이티브 PTY 검사 통과: `output/exe-88-version-tests.log`, `output/exe-88-pty-smoke.log`.
- 고정 소스의 TypeScript·Vite production build와 Standard NSIS 빌드 통과: `output/exe-88-build.log`. 기존 출력과 분리한 `app/electron-dist/exe-1.8.1.88`에 빌드했다. 기존 Vite 500KB 이상 번들 경고는 남아 있다.
- 패키지의 실행·내장 Git·브라우저 bridge·Dashboard·PTY와 종료·트레이·보안 검사 통과: `output/exe-88-packaged-smoke.log`, `output/exe-88-packaged-lifecycle-smoke.log`. 임시 packaged 실행기의 외부 제한을 처음부터 45초로 설정했고 원래 검사 조건·제품 소스와 개별 PTY 8초 제한을 유지했다. 기존 node-pty 종료 보조 프로세스의 `AttachConsole failed` 진단 뒤에도 필수 성공 marker와 종료 코드 0을 확인했다.
- 설치 파일 FileVersion **1.8.1.88**, ProductVersion **1.8.1**, 크기·SHA-256이 같은 빌드의 manifest와 일치한다. Authenticode는 **NotSigned**다. `output/exe-release-1.8.1.88/windows-verification.json`.
- 새 세션 이동 서비스를 포함한 패키지 런타임·렌더러 **324개 파일**이 고정 빌드 소스와 일치했다. 기존 서명 APK **1.8.1.39/code 21**의 패키지·아키텍처·인증서·해시도 재검증했다. `output/exe-release-1.8.1.88/local-verification.json`.
- 공개 GitHub에서 **1.8.1.87·1.8.1.86 → 1.8.1.88** 업데이트 감지를 확인했다. 실제 업데이터로 EXE 전체를 다운로드하고 공개 자산 세 개의 크기·SHA-256·URL·태그·소스 커밋과 최신 안정 릴리스를 확인했다. `output/exe-88-public-verify.log`, `.build-tools/public-verified-1.8.1.88.json`.

## 배포 기록

- 공개 게시: **2026-10-22 07:56:30 KST**. [GitHub Release v1.8.1.88](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.88).
- 고정 소스·태그: `6a4876bbfb276ce2d5d3f81229026cfae8107045`.
- 공개 다운로드 검증 완료: **2026-10-22 07:57:06 KST**.
- 소스 제품 버전·Android 소스 versionName: **1.8.1.88**. npm 호환 버전: **1.8.1**.
- 기존 서명 APK **1.8.1.39/code 21** 재사용. 새 APK·Company·Microsoft Store 배포는 실행하지 않았다.

| 공개 자산 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Acedia-Setup-1.8.1.88-x64.exe | 151433848 | `8d9dcb8cbe934473484d3d1b5a72426c6582b28141ae6cc949e58c16fb8511ca` |
| Acedia-Setup-1.8.1.88-x64.exe.blockmap | 159232 | `10e4d4f91c79dae50bff4ad9131a40851efb0963543ab689ca6e32df17668997` |
| latest-exe.json | 256 | `ac873fdbcd498f7b490caa8ab46060cb01ed58d090649bb7e21f97c5eb44b100` |

설정의 **Check → Update** 또는 다음 앱 실행의 업데이트 안내로 적용하고, 새 MCP 도구를 사용할 호출 세션을 **Restart**한다. 이 배포에서는 설치 프로그램을 실행하거나 실제 사용자 폴더·세션 등록을 변경하지 않았다. 공개 게시와 사용자 PC의 설치 완료는 별개다.
