---
type: Release
title: Acedia 1.8.1.49 terminal file URL links
description: Open file URLs from terminal output through the local file resolver and preserve the complete link target across wrapped lines and OSC 8 labels.
status: stable
last_updated: 2026-10-04
sources:
  - resource: workspace-interactions.md
  - resource: exe-release-workflow.md
  - resource: ../app/src/lib/terminal.ts
  - resource: ../app/electron/services/terminal-path-service.mjs
  - resource: ../app/electron/services/terminal-path-service.test.mjs
  - resource: ../app/scripts/electron-terminal-links-smoke.mjs
  - resource: ../.github/workflows/release-exe.yml
---

# Acedia 1.8.1.49

## 변경 사항

- **터미널 파일 URL 열기 수정**: `file:///C:/...` 링크를 실제 파일 경로로 변환해 연다. Codex가 생성한 이미지처럼 프로젝트 밖에 있는 파일도 이미지 뷰어에서 확인할 수 있다. 링크 앞부분과 드라이브 문자, 줄바꿈된 끝부분을 클릭해도 같은 파일을 연다.
- **파일명과 링크 형식 보존**: 공백·한글·`#` 등 URL로 인코딩된 파일명은 한 번만 디코딩한다. `file://localhost/` 주소와 이름만 보이는 OSC 8 링크도 지원한다. 잘못된 URL이나 없는 파일은 오류를 표시하며 다른 경로로 바꿔 열지 않는다. HTTP 링크는 기존 브라우저 설정을 따른다.
- 제품·설치 파일·Android 소스 버전은 **1.8.1.49**, npm 호환 버전은 **1.8.1**이다. EXE에는 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다.

## Changes

- Open terminal `file:///` links through the local filesystem resolver, including generated images outside the project. Clicking the scheme, drive or wrapped continuation resolves the same complete target.
- Decode encoded filenames once, support `file://localhost/` and OSC 8 links with visible labels, and reject malformed or missing targets. HTTP links retain the configured browser behavior.

## 검증

- 로컬 전체 **153개 파일·983개 테스트**, TypeScript/Vite 프로덕션 빌드와 `git diff --check`를 통과했다. Git 실행 경로가 누락되어 실패했던 두 파일의 22개 검사는 실행 환경을 맞춘 뒤 통과했다.
- 실제 Electron에서 긴 파일 URL의 앞·중간·끝 클릭, 공백·한글이 인코딩된 주소와 OSC 8 파일 링크를 검증했다. HTTP 링크와 지원하지 않는 URI의 분리, 기존 soft/hard wrap 경로와 색상 경계 8개 조합도 통과했다.
- 사용자 스크린샷에 표시된 실제 생성 이미지의 파일 URL이 이미지 경로로 정상 해석되는 것을 확인했다.
- [공식 Windows 빌드](https://github.com/OneThingChanged/Acedia/actions/runs/37147421153)에서 전체 **153개 파일·983개 테스트**, 생성 창·터미널 파일 URL 클릭·native PTY, TypeScript/Vite·NSIS 빌드, packaged bridge/Dashboard·lifecycle 검증과 자산 게시가 모두 통과했다.

## 공개 배포

2026-10-04 **04:23:51 KST**, [v1.8.1.49](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.49)를 최신 안정 릴리스로 게시했다. 제품 태그와 릴리스 대상은 고정 소스 `5b2095db77148d901b0332c163471794657fafca`다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.49-x64.exe` | 120,966,297 | `6dd47af0892baef8d1983c9d93dc6aee04b52a95ed1fdb9689755a33ee3dd458` |
| `Acedia-Setup-1.8.1.49-x64.exe.blockmap` | 127,136 | `5edd38927ca3b6e8734828f301f40f2df4841c97ef987f499a8c568f5f974160` |
| `latest-exe.json` | 256 | `6c9f475904c7615237966d268f5af881e6b95793609b8bd39e33af1281cff99f` |

공개 설치 파일 FileVersion은 **1.8.1.49**, Authenticode는 **NotSigned**다. 같은 빌드의 manifest와 설치 파일 크기·SHA-256이 일치한다.

**04:24:50 KST**에 프로덕션 업데이터로 **1.8.1.46 및 1.8.1.48 → 1.8.1.49 감지**, **1.8.1.48 기준 실제 다운로드·설치 전 해시 검증**을 완료했다. 세 공개 자산의 크기·SHA-256, 최신 안정 릴리스, 제품 소스 태그와 재사용 APK 버전도 확인했다. 공개 다운로드 파일에 `publish-github-exe.ps1 -VerifyOnly`를 적용해 설치 파일 버전과 manifest 일치를 다시 확인했다.

설치 프로그램은 실행하지 않았으며 사용자 PC 설치는 앱의 Update에서 진행한다. Microsoft Store와 새 APK 배포는 수행하지 않았다.
