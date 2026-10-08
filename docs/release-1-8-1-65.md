---
type: Release
title: Acedia 1.8.1.65
description: "프로젝트별 세션 접기·펼치기와 Remote/Dashboard ZIP 첨부 지원."
status: stable
last_updated: 2026-10-08
---

# Acedia 1.8.1.65

## 변경 내용

- 사이드바에서 프로젝트를 누르면 그 아래에 세션 목록을 펼치고 다시 누르면 접는다. 프로젝트별 펼침 상태를 저장하며, 세션 상태가 바뀌거나 앱을 재실행해도 사용자가 정한 상태를 유지한다.
- 하위 세션은 제목 중심의 간결한 행으로 표시하며, 클릭 또는 Enter/Space로 대화를 연다. 선택 표시·상태·완료·분할 화면 배지와 대화 메뉴를 유지하며, 프로젝트 행에는 새 대화 아이콘을 제공한다.
- Remote와 로컬 Dashboard에서 ZIP을 파일 선택·드래그앤드롭으로 첨부할 수 있다. 이미지는 파일당 8 MiB, ZIP은 32 MiB, 한 입력에 합계 4개까지 지원한다. ZIP은 파일명과 배지로 표시하고 원본 파일을 저장해 세션에 경로를 전달한다.
- Windows ZIP MIME과 빈 MIME을 정규화하고 업로드 크기·파일 형식·인증을 검증한다. 이미지와 ZIP을 함께 보내거나 파일만 보내는 입력을 지원하고, 새 서비스 워커가 첨부 모듈을 갱신한다.

사용 방법: [워크스페이스 동작](workspace-interactions.md), [Remote 첨부](https://github.com/OneThingChanged/Acedia/blob/main/docs/remote-service.md#session-and-content-surface).
기존 서명 APK 1.8.1.39/code 21을 포함하는 EXE 업데이트다.

## English

- Expand and collapse conversations directly below each project in the sidebar. Persist each project's expansion independently, without reopening folded projects on session updates or app restart.
- Use compact nested conversation rows with pointer and keyboard selection, status/completion/split indicators and the existing conversation menu. Add a new-conversation icon on each project row.
- Attach ZIP archives through the Remote and local Dashboard file picker or drag and drop. Support images up to 8 MiB, ZIPs up to 32 MiB and four total attachments, including mixed image/ZIP and attachment-only messages.
- Normalize Windows and empty ZIP MIME types, validate upload size/signature and retain existing authentication controls. Store original archive bytes and pass their paths to the session; refresh attachment code through the service worker.
- Reuse the signed mobile APK 1.8.1.39.

## 검증

- 전체 **177개 파일·1,193개 검사**와 버전 갱신 후 모바일 메타데이터·연결 검사 **24건**을 통과했다.
- 사이드바·탐색 집중 검사 **33건**과 TypeScript 검사를 통과했다.
- 실제 Electron의 격리 프로필에서 프로젝트별 접기·펼치기, 메뉴·새 대화, 하위 세션의 클릭·키보드 선택, 보관 대화 제외, 재시작 상태 복원, 밝은 테마와 800–1440px 배치를 확인했다. IPC는 fixture로 검증하며 실제 사용자 세션을 조작하지 않는다.
- Remote·Dashboard HTTP 집중 검사와 실제 1024/390px Electron 페이지에서 **9 MiB ZIP** 전송·원본 바이트 일치, 파일 선택·드롭, 이미지/ZIP 혼합·파일만 전송, 첨부 제거와 크기·형식·인증 거부를 확인했다. 실제 모델 응답과 Android 기기 동작은 별도 검증이다.
- 고정 소스의 TypeScript·Vite 및 Standard EXE 빌드와 패키지 bridge·Dashboard·Git·종료·트레이·보안 검증을 통과했다. renderer·runtime 파일 **275개**가 빌드 원본과 일치하며 새 ZIP 첨부 모듈도 패키지에 포함된다.
- 설치 파일의 FileVersion **1.8.1.65**, 크기·SHA-256과 `latest-exe.json` 일치를 확인했다. npm 호환 버전은 **1.8.1**이다. EXE Authenticode 상태는 기존 채널과 같은 `NotSigned`이며, 서명 APK **1.8.1.39/code 21**의 인증서·패키지·아키텍처·해시를 검증해 재사용했다.
- 공개 업데이터가 **1.8.1.63·1.8.1.64 → 1.8.1.65**를 감지한다. 공개 설치 파일을 실제로 내려받아 설치 파일 검증을 통과했고, 세 자산의 크기·SHA-256과 최신 안정 릴리스·소스 태그 일치를 확인했다.

실제 사용자 앱의 설치·재시작과 Android 기기 동작은 별도 검증이다.

## 공개 배포

- [GitHub 안정 릴리스 v1.8.1.65](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.65)를 2026-10-08 **13:32:03 KST**에 게시했다.
- 소스·태그는 `cbc495a8a049ac681de6b4118c8c8f7279c7140b`이며 `origin/main` 푸시 후 빌드했다. Microsoft Store 제출과 신규 APK 빌드는 실행하지 않았다.
- **13:32:47 KST**에 공개 다운로드·업데이트 검증을 완료했다. 사용 중인 앱과 세션을 재시작하거나 설치 프로그램을 실행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.65-x64.exe` | 151307612 | `604cb160eb3d620ef0d35d4cb9086ddc95761dbe84b3aa30964ece82b7d1737b` |
| `Acedia-Setup-1.8.1.65-x64.exe.blockmap` | 159471 | `3c2a74360e22a36e4738ae4a99d28f0023f19b106fad29ec15cfb7db95f75cb7` |
| `latest-exe.json` | 256 | `1048a5d6c4678d0c078d97d28535ba7cc264f7c58a6d4b6f6c02c5ff8f6ab78c` |

로컬 증빙: `output/full-suite-exe-1.8.1.65.json`, `output/mobile-tests-exe-1.8.1.65.log`, `output/build-exe-1.8.1.65.log`, `output/packaged-smoke-1.8.1.65.log`, `output/packaged-lifecycle-1.8.1.65.log`, `output/public-update-verification-1.8.1.65.log`, `output/exe-release-1.8.1.65/local-verification.json`, `output/exe-release-1.8.1.65/public-verification.json`, `output/sidebar-workspace-app/`, `output/remote-zip-{remote,dashboard}-{1024,390}.png`.
