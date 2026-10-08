---
type: Release
title: Acedia 1.8.1.65
description: "프로젝트별 세션 접기·펼치기와 Remote/Dashboard ZIP 첨부 지원."
status: draft
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
- 고정 소스 EXE 빌드, packaged smoke/lifecycle 및 공개 업데이터 검증을 진행한다. 완료 결과와 공개 자산 해시는 배포 후 이 문서에 기록한다.

로컬 증빙: `output/full-suite-exe-1.8.1.65.json`, `output/mobile-tests-exe-1.8.1.65.log`, `output/sidebar-workspace-app/`, `output/remote-zip-{remote,dashboard}-{1024,390}.png`.

## 배포 상태

GitHub Standard EXE 배포 준비 중이다. 신규 APK 빌드와 Microsoft Store 제출은 이 배포에 포함되지 않는다.
사용 중인 앱의 설치·재시작은 실행하지 않는다.
