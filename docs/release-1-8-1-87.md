---
type: Release
title: Acedia 1.8.1.87
description: "기존·OFFLINE 세션 Dangerous 설정의 공개 로컬 API와 MCP 조회·저장 지원."
status: stable
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
- TypeScript·Vite production build와 Standard NSIS 빌드 통과: `output/exe-87-build.log`. 기존 출력과 분리한 `app/electron-dist/exe-1.8.1.87`에 같은 고정 소스를 빌드했다. Vite의 500KB 이상 번들 경고는 남아 있다.
- 패키지의 실행·내장 Git·브라우저 bridge·Dashboard·PTY와 종료·트레이·보안 검사 통과: `output/exe-87-packaged-smoke.log`, `output/exe-87-packaged-lifecycle-smoke.log`. 첫 packaged 검사는 마지막 PTY 확인 단계에서 외부 실행기의 20초 제한으로 종료되어, 임시 실행기만 45초로 늘리고 같은 패키지·전체 성공 조건을 다시 검증했다. 개별 PTY의 8초 제한과 제품 소스는 변경하지 않았다. 첫 기록은 `output/exe-87-packaged-smoke-first-timeout.log`에 보존했다.
- 설치 파일 FileVersion **1.8.1.87**, ProductVersion **1.8.1**, 크기·SHA-256이 같은 빌드의 manifest와 일치한다. Authenticode는 **NotSigned**다. 기존 node-pty 종료 보조 프로세스의 `AttachConsole failed` 진단 뒤에도 필수 성공 marker와 종료 코드 0을 확인했다.
- 신규 세션 설정 서비스를 포함한 패키지의 런타임·렌더러 **322개 파일**이 고정 빌드 소스와 일치했다. 기존 서명 APK **1.8.1.39/code 21**의 패키지·아키텍처·인증서·해시를 재검증했다. `output/exe-release-1.8.1.87/local-verification.json`.
- 공개 GitHub에서 **1.8.1.86·1.8.1.85 → 1.8.1.87** 감지를 확인했다. 실제 업데이터로 EXE 전체를 다운로드하고 공개 자산 세 개의 크기·SHA-256·URL·태그와 소스 커밋을 확인했다. `output/exe-87-public-verify.log`, `.build-tools/public-verified-1.8.1.87.json`.

## 배포 기록

- 공개 게시: **2026-10-22 04:14:03 KST**. [GitHub Release v1.8.1.87](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.87).
- 고정 소스·태그: `12164fba3079c44b762cbd4ea9e944a1394935e6`.
- 공개 다운로드 검증 완료: **2026-10-22 04:14:58 KST**.
- 소스 제품 버전·Android 소스 versionName: **1.8.1.87**. npm 호환 버전: **1.8.1**.
- 기존 서명 APK **1.8.1.39/code 21** 재사용. 새 APK·Company·Microsoft Store 배포는 실행하지 않았다.

| 공개 자산 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Acedia-Setup-1.8.1.87-x64.exe | 151430013 | `352f3a1a34562c82ba6908c59fa128fcc3dc77cbefd4ddc6a27776c5a91d6e3b` |
| Acedia-Setup-1.8.1.87-x64.exe.blockmap | 159186 | `4231096162728bb193b060ace3a9cf362c7f53cd73e3eb8c12b356766c0ada07` |
| latest-exe.json | 256 | `bf8a821bbd6afa11f6db0d46d82f0121fc33bd221c500ad0f00dc86946f68c5e` |

설정의 **Check → Update** 또는 다음 앱 실행의 업데이트 안내로 적용하고, 새 MCP 도구를 사용할 호출 세션을 **Restart**한다. 이 배포에서 설치 프로그램을 실행하거나 실제 사용자 세션의 Dangerous 설정을 바꾸지 않았다. 공개 게시·다운로드 검증 완료와 사용자 PC의 설치 완료는 별개다.
