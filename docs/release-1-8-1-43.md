---
type: Release
title: Acedia 1.8.1.43 highlighted terminal path boundaries
description: Exclude adjacent Korean particles from highlighted terminal filesystem links.
status: stable
last_updated: 2026-10-03
sources:
  - resource: workspace-interactions.md
  - resource: exe-release-workflow.md
  - resource: ../app/src/lib/terminal.ts
  - resource: ../app/scripts/electron-terminal-links-smoke.mjs
  - resource: ../.github/workflows/release-exe.yml
---

# Acedia 1.8.1.43

## 구현

- 초록색 등으로 강조된 터미널 파일·폴더 경로의 클릭 범위를 글자 색상 경계에 맞췄다. `03_Development/GitHub/SubStorage` 바로 뒤의 일반 색상 `는`이 경로에 포함되지 않는다.
- 링크 밑줄·마우스 클릭 범위와 직접 클릭 시 경로 판별에 같은 경계를 적용했다. 조사 부분을 클릭하면 파일·폴더 열기를 실행하지 않는다.
- 한글 폴더명, 이름 자체가 `는`으로 끝나는 폴더, 공백이 포함된 절대 경로와 줄바꿈 경로를 유지한다. ANSI 팔레트 색상과 RGB 색상을 지원한다.
- [1.8.1.42의 현재 프로젝트 열기](release-1-8-1-42.md)를 포함한다. 워크스페이스 사용법·한국어·영어 README·배포 기록을 갱신하고 공식 배포 전에 실제 터미널 링크 마우스 검사를 실행한다.
- EXE만 갱신하며 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다. 제품·Android 소스 버전은 1.8.1.43, npm 호환 버전은 1.8.1이다.

## 검증

수정 전 실제 Electron에서 `SubStorage는`을 여는 실패를 재현했다. 수정 후 팔레트/RGB·상대/절대·한글·줄바꿈 경로 **8개 조합**의 클릭 대상과 조사 비클릭 검사가 통과했다. 기존 soft/hard wrap 경로와 색상 없는 한글 이름 검사도 통과했다.

관련 검사 **24개**와 1.8.1.43 TypeScript/Vite 빌드가 통과했다. 공식 러너의 전체 검사·native PTY·EXE 패키지 검증을 진행한다.

## 공개 배포

공식 GitHub EXE 워크플로우에서 고정 소스를 빌드하고 같은 빌드의 설치 파일·blockmap·`latest-exe.json`을 검증해 게시한다. 공개 배포 후 실제 업데이터 다운로드와 설치 전 해시 검증 결과를 기록한다.
