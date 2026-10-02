---
type: Release
title: Acedia 1.8.1.44 account recovery, token refresh and browser compatibility
description: Resume after account exclusion, keep Dashboard token totals current and display embedded verification widgets.
status: stable
last_updated: 2026-10-03
sources:
  - resource: account-pool.md
  - resource: usage-accounting.md
  - resource: browser-preferences.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/services/account-pool.mjs
  - resource: ../app/electron/services/usage-service.mjs
  - resource: ../app/electron/services/browser-compatibility.mjs
  - resource: ../app/scripts/account-pool-cli-smoke.mjs
  - resource: ../.github/workflows/release-exe.yml
---

# Acedia 1.8.1.44

## 변경 사항

- **계정 제외 후 세션 복구**: 자동 배정 세션에서 A 계정을 분산 제외한 뒤 재시작하면 사용 가능한 다른 계정으로 배정하고 기존 대화를 이어받는다. 대체 계정이 없으면 CLI 시작 전에 안내하며 대화와 기존 배정을 보존한다. 특정 계정에 고정한 세션은 세션 속성에서 직접 계정을 변경한다.
- **토큰 사용량 갱신**: Dashboard와 Remote 사용량 조회 시 진행 중인 대화 파일의 최신 토큰을 수집한다. 사용량 화면을 보고 있는 동안 30초마다 갱신하며 마지막 수집 시각을 표시한다. 숨긴 화면의 반복 조회는 멈추고 화면으로 돌아오면 갱신한다.
- **내장 브라우저 호환성**: 설정 → 브라우저에 기본으로 켜지는 웹사이트 호환성 옵션을 추가했다. 실제 Chromium 버전과 운영체제 정보를 유지하면서 Electron·앱 식별값을 정리해 로그인·인증 화면 호환성을 높인다. Zhihu 이미지 인증창 표시를 확인했으며 사람 인증은 사용자가 직접 완료한다. 옵션을 바꾼 뒤 열린 페이지는 새로고침한다.
- 제품·Android 소스 버전은 **1.8.1.44**, npm 호환 버전은 **1.8.1**이다. EXE 배포에 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다.

## 검증

- 계정 복구 관련 검사 **109개**와 실제 설치 CLI의 격리 실행을 통과했다. 모의 서버로 5회 요청을 검증하고, A 제외 후 B로 같은 대화 ID를 재개하면서 이전 사용자·응답 메시지가 유지되는 것을 확인했다. 실제 상용 서버의 계정 간 대화 접근 정책은 별도다.
- 사용량 갱신 관련 검사 **45개**와 Remote/PWA의 1920px·1024px·390px, 6개 언어 화면 검증을 통과했다.
- 브라우저 관련 검사 **12개**와 실제 Electron 내장 탭의 설정 저장·요청 헤더·페이지 User-Agent·MCP 탭 적용 검증을 통과했다. 동일한 보안 설정의 표시된 테스트 창에서 Zhihu 인증 위젯을 확인했다.
- 로컬 전체 **143개 파일·916개 테스트**, TypeScript/Vite 빌드와 변경 파일 공백 검사를 통과했다. 첫 전체 실행에서 Git 경로가 없어 실패한 7개 검사는 경로를 보완해 통과했고 Windows 설치·PowerShell 검사는 각각 단독 실행했다.
- [공식 Windows 빌드](https://github.com/OneThingChanged/Acedia/actions/runs/37042694410)에서도 **143개 파일·916개 테스트**, 생성 창 상호작용·22개 화면 조합, 터미널 경로 클릭, native PTY, TypeScript/Vite·NSIS 빌드가 통과했다. Packaged bridge/Dashboard·브라우저 호환성 설정·lifecycle 검증이 통과했다. 예상한 거부 경로와 빠른 PTY 종료 시의 `AttachConsole failed` 로그가 있으므로 로그 전체가 무오류였다는 뜻은 아니다.

## 공개 배포

2026-10-03 **02:48:59 KST**, [v1.8.1.44](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.44)를 최신 안정 릴리스로 게시했다. 제품 태그와 릴리스 대상은 고정 소스 `7e27dfb5a8b221395f904fdd38af125de832b733`다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.44-x64.exe` | 120,881,737 | `3c68f401aabeed2d7c4676ff70eca3f06dfb9a1de0aa33bbe9251124b1eeb761` |
| `Acedia-Setup-1.8.1.44-x64.exe.blockmap` | 127,055 | `f6d093cc09b73b07388a2f18caded0a967dee6d0c35eee392f424dd43af60b75` |
| `latest-exe.json` | 256 | `7fd3feabbf13d5e5d19dd0fd3dcbdaac0591797f133e865f74a44ff9aae8bac6` |

공개 설치 파일 FileVersion은 **1.8.1.44**, Authenticode는 **NotSigned**다. 같은 빌드의 manifest와 설치 파일 크기·SHA-256이 일치한다.

**02:50:31 KST**에 프로덕션 업데이터로 **1.8.1.43 → 1.8.1.44 감지·실제 다운로드·설치 전 해시 검증**을 완료했다. 공개 세 자산의 크기·SHA-256, 최신 안정 릴리스, 제품 소스 태그와 재사용 APK 버전도 확인했다. 설치 프로그램은 실행하지 않았으며 사용 중인 앱의 설정에서 업데이트를 진행한다.
