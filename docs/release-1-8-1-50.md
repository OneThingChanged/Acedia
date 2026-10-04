---
type: Release
title: Acedia 1.8.1.50 Git changes and large Remote HTML previews
description: Show Git changes when Git is absent from PATH or repositories have ownership and long-path issues, and open large HTML previews from Remote with loading and download recovery.
status: draft
last_updated: 2026-10-04
sources:
  - resource: workspace-interactions.md
  - resource: remote-service.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/services/git-command.mjs
  - resource: ../app/electron/services/git-runtime.mjs
  - resource: ../app/scripts/bundle-git-runtime.mjs
  - resource: ../app/src/components/FileTreePanel.tsx
  - resource: ../app/electron/services/remote-documents.mjs
  - resource: ../app/electron/remote-pwa/app.js
  - resource: ../app/scripts/electron-git-panel-smoke.mjs
  - resource: ../app/scripts/electron-remote-html-smoke.mjs
---

# Acedia 1.8.1.50

## 변경 사항

- **Git 변경 파일 표시 수정**: PATH에 Git이 없는 설치 환경에서도 내장 Git으로 변경사항을 읽는다. Windows 계정 소유권이 달라진 저장소, 긴 Unreal 파일 경로, `.git`이 파일인 서브모듈과 worktree를 지원한다. 설정은 Acedia가 실행하는 해당 저장소 명령에만 적용한다.
- **Git 조회 실패 복구**: 오류와 새로고침 버튼을 계속 표시한다. 프로젝트를 바꾸면 이전 선택을 비우고, 늦게 도착한 결과나 오류가 새 프로젝트를 덮어쓰지 않게 한다.
- **큰 Remote HTML 미리보기**: HTML 미리보기 한도를 32MiB로 늘리고 전송 시 gzip을 지원한다. 로딩·취소 표시, 팝업 차단 시 열기 링크, Android 외부 미리보기 연결을 추가했다. 한도를 넘는 파일은 원본 다운로드를 제공한다.
- 제품·설치 파일·Android 소스 버전은 **1.8.1.50**, npm 호환 버전은 **1.8.1**이다. EXE에는 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다.

## Changes

- Show Git changes using installed or bundled Git, including repositories with different Windows ownership, long paths, and submodule/worktree gitfiles. Apply configuration only to the selected worktree's commands.
- Keep Git errors and retry visible, reset selections on repository changes, and ignore results from the previous project.
- Preview Remote HTML up to 32MiB with negotiated gzip, loading/cancellation, popup-blocked recovery, Android external preview support, and original-file downloads for oversized previews.

## 검증

- 전체 **155개 파일·1,002개 테스트**, TypeScript/Vite 프로덕션 빌드와 `git diff --check`를 통과했다.
- 실제 Electron Git 패널에서 기존 서브모듈 프로젝트의 변경 **34개**가 표시됐다. 오류가 5초 후에도 유지되고, 재시도·느린 조회·프로젝트 전환이 정상 동작했다.
- 검증한 MinGit을 포함한 Standard 실행 파일에서 260자를 넘는 경로의 staged 파일과 untracked 파일을 읽었다. packaged bridge/Dashboard 검증을 통과했다.
- 실제 Electron Remote 화면의 세로·가로 모바일 크기에서 8MiB 이상의 HTML, 상대 이미지·CSS·JS·버튼, 격리된 미리보기, 한도 초과 원본 다운로드·취소·팝업 복구를 검증했다.
- 1.8.1.50 NSIS 설치 파일의 버전·manifest·크기·SHA-256과 `.blockmap`을 검증했다. 실제 packaged bridge/Dashboard 및 종료·트레이·보안 lifecycle 검사도 통과했다.
- 설치 파일은 **151,218,362 bytes**, SHA-256은 `ee41524ed5cf7a68e2031e0d6f085f646f8b7a7216cbda665c9f8e72437a250d`다. Authenticode는 **NotSigned**이며 기존 EXE 채널과 같은 서명 상태다.
- 공개 업데이트·다운로드 검증 결과는 게시 후 기록한다.
