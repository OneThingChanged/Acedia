---
type: Release
title: Acedia 1.8.1.11
description: Release terminal color correction and child Git repository selection.
status: stable
sources:
  - resource: ../app/electron/services/terminal-launcher.mjs
  - resource: ../app/electron/services/git-submodules.mjs
  - resource: ../app/src/components/FileTreePanel.tsx
---

# Acedia 1.8.1.11

- 릴리즈에서도 터미널 생성 시 상속된 `NO_COLOR`를 제거합니다. 개발 모드에만 적용하던 조건을 없앴으며 Codex·Claude·일반 셸 회귀 테스트를 추가했습니다. 수정 버전에서 세션을 다시 시작해야 적용됩니다.
- 프로젝트 루트가 Git 저장소가 아니어도 하위 저장소를 Repository 목록에서 선택할 수 있습니다. worktree와 기존 서브모듈을 지원하며 선택한 저장소 기준으로 파일과 Source Control을 표시합니다.

## 검증

전체 테스트 710개, TypeScript/Vite 빌드, PTY smoke, packaged bridge와 lifecycle smoke를 통과했습니다. Codex 색상 smoke에서 색상 종류는 NO_COLOR 유지 시 0개, 제거 시 3개였으며 모델 요청은 없었습니다. 패키지의 터미널 환경·실행기·저장소 탐색 소스가 작업 트리와 일치함을 확인했습니다.

패키지 검사 중 종료된 PTY의 AttachConsole 진단과 종료 시 GPU 진단이 출력됐으나 필수 성공 마커와 프로세스 종료 코드는 정상입니다. 설치 파일 FileVersion은 1.8.1.11이며 Authenticode는 NotSigned입니다.

EXE와 blockmap, latest-exe.json을 같은 빌드로 게시합니다. 기존 검증 APK 1.8.0.1을 재사용하며 Store 제출은 포함하지 않습니다. 실제 사용자 프로필의 설치·업데이트 적용은 별도 확인 항목입니다.
