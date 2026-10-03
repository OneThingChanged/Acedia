---
type: Release
title: Acedia 1.8.1.45 responsive Dashboard usage collection
description: Open usage immediately from stored totals and process large transcript histories in bounded background batches.
status: stable
last_updated: 2026-10-03
sources:
  - resource: usage-accounting.md
  - resource: local-dashboard.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/services/usage-service.mjs
  - resource: ../app/electron/services/usage-transcript-reader.mjs
  - resource: ../app/electron/services/usage-transcript-reader.test.mjs
  - resource: ../app/electron/services/usage-transcript-refresh.test.mjs
  - resource: ../app/scripts/electron-remote-pwa-smoke.mjs
  - resource: ../.github/workflows/release-exe.yml
---

# Acedia 1.8.1.45

## 변경 사항

- **대용량 대화의 Dashboard 멈춤 방지**: 사용량 화면은 저장된 집계를 먼저 표시하고 대화 파일 탐색·추가 집계를 백그라운드에서 수행한다. 미집계 기록 전체를 한꺼번에 메모리에 올리거나 집계가 끝날 때까지 화면 응답을 기다리지 않는다.
- **활성 세션 우선 집계**: 현재 실행 중인 세션부터 처리하고 과거 세션의 누적 사용량도 보존한다. 파일은 256 KiB씩 읽으며 처리 사이에 앱의 다른 작업이 실행될 수 있도록 한다.
- **집계 상태와 이어 읽기**: 사용 기록 집계 중 상태를 표시하고 진행 중에는 자동으로 갱신한다. 중간 저장 위치와 토큰 중복 방지 정보를 함께 기록해 다음 갱신에서 이어서 읽는다. 일부 파일을 읽지 못하면 기존 합계를 유지하고 다시 시도할 수 있도록 안내한다.
- 제품·Android 소스 버전은 **1.8.1.45**, npm 호환 버전은 **1.8.1**이다. EXE 배포에 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다.

## 검증

- 기능 수정 후 로컬 전체 **144개 파일·925개 테스트**, TypeScript/Vite 빌드를 통과했다.
- 대용량 회귀 검사는 파일 크기를 **11 GiB로 보고하는 모의 파일 접근**으로 읽기 크기 제한·집계 중 Dashboard 응답·종료 시 파일 정리를 확인한다. 실제 11 GiB 파일 전체를 집계한 시험이라는 뜻은 아니다.
- 여러 읽기 구간에 걸친 UTF-8·Claude 사용량, 불완전한 마지막 행, 재시작 후 모델·누적 토큰 상태 보존, 동시 hook/새로고침 중복 방지, 파일 축소와 64 MiB 초과 단일 행의 안전한 실패를 확인했다.
- 실제 Electron Remote/PWA 화면을 1920px·1024px·390px 및 6개 언어로 검증했다. 파일 탐색을 의도적으로 대기시켜도 사용량 응답과 집계 중 표시가 나오며, 집계 완료 후 화면 합계가 갱신되는 것을 확인했다.
- [공식 Windows 빌드](https://github.com/OneThingChanged/Acedia/actions/runs/37091625536)의 전체 자동 검사, 생성 창·터미널 링크·native PTY, TypeScript/Vite·NSIS 빌드, packaged bridge/Dashboard·lifecycle 검증이 모두 통과했다.

## 공개 배포

2026-10-03 **12:03:17 KST**, [v1.8.1.45](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.45)를 최신 안정 릴리스로 게시했다. 제품 태그와 릴리스 대상은 고정 소스 `2294fbd0e200b78f95e1706832180ff0ca049973`다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.45-x64.exe` | 120,885,129 | `061ad86d33c374db963340f88e6e86615ed943c2bc504597b429aa252cce7ec7` |
| `Acedia-Setup-1.8.1.45-x64.exe.blockmap` | 126,889 | `53a6154fb56f758bab78272f24e401ee128100bfb4a5dfca500affcaab882567` |
| `latest-exe.json` | 256 | `ee9403f495113f8c4b04d8d8988c1948a81335f1528a152c37a5501db7133df3` |

공개 설치 파일 FileVersion은 **1.8.1.45**, Authenticode는 **NotSigned**다. 같은 빌드의 manifest와 설치 파일 크기·SHA-256이 일치한다.

**12:04:34 KST**에 프로덕션 업데이터로 **1.8.1.44 → 1.8.1.45 감지·실제 다운로드·설치 전 해시 검증**을 완료했다. 세 공개 자산의 크기·SHA-256, 최신 안정 릴리스, 제품 소스 태그와 재사용 APK 버전도 확인했다. 설치 프로그램은 실행하지 않았으며 사용자 PC 설치는 별도다.
