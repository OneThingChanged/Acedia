---
type: Release
title: Acedia 1.8.1.42 session project folder shortcut
description: Open a local session's project folder from its tab context menu.
status: stable
last_updated: 2026-10-03
sources:
  - resource: workspace-interactions.md
  - resource: exe-release-workflow.md
  - resource: ../app/src/App.tsx
  - resource: ../app/src/components/Menus.tsx
  - resource: ../app/src/lib/locales/workspace.ts
  - resource: ../app/scripts/publish-github-exe.ps1
  - resource: ../.github/workflows/release-exe.yml
---

# Acedia 1.8.1.42

## 구현

- 로컬 세션 탭의 우클릭 메뉴에 **현재 프로젝트 열기 / Open current project**를 추가했다. 클릭하면 해당 세션이 속한 프로젝트의 루트 폴더를 Windows 탐색기로 연다.
- 다른 프로젝트나 탭이 활성화돼 있어도 우클릭한 세션의 프로젝트를 기준으로 연다. 로컬 폴더가 없는 세션과 SSH 세션에는 이 메뉴를 표시하지 않는다.
- 클릭 후 메뉴를 닫고, 폴더를 열 수 없으면 기존 오류 알림으로 안내한다. 문서 탭의 **탐색기에서 보기**는 파일 위치 표시 동작을 유지한다.
- 한국어·영어·중국어 간체·중국어 번체·일본어·스페인어 메뉴를 반영하고 [워크스페이스 사용법](workspace-interactions.md), 한국어·영어 README와 문서 목록을 정리했다.
- EXE만 갱신하며 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다. 제품·Android 소스 버전은 1.8.1.42, npm 호환 버전은 1.8.1이다.

## 검증

메뉴·앱 언어·번역 카탈로그·릴리스 버전의 관련 검사 **15개**와 1.8.1.42 TypeScript/Vite 빌드가 통과했다. 공식 GitHub 러너의 전체 검사·native PTY·packaged bridge/Dashboard·lifecycle 검증을 진행한다.

## 공개 배포

공식 GitHub EXE 워크플로우에서 고정 소스를 빌드하고 같은 빌드의 설치 파일·blockmap·`latest-exe.json`을 검증해 게시한다. 공개 배포 후 프로덕션 업데이터의 이전 버전 감지와 실제 다운로드·설치 전 해시 검증 결과를 기록한다.
