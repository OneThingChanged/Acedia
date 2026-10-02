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

메뉴·앱 언어·번역 카탈로그·릴리스 버전의 관련 검사 **15개**와 1.8.1.42 TypeScript/Vite 빌드가 통과했다.

[공식 GitHub 빌드](https://github.com/OneThingChanged/Acedia/actions/runs/37026344153)에서 전체 **141개 파일·899개 테스트**, 생성 창 상호작용·22개 화면 조합, native PTY, TypeScript/Vite·NSIS 빌드와 packaged bridge/Dashboard·lifecycle 검증이 통과했다. Windows 설치·watcher 검사 2개와 PowerShell 검사 19개는 공식 절차에 따라 따로 실행했다. 예상한 거부 경로의 오류와 빠른 PTY 종료의 `AttachConsole failed` 로그도 관찰했으므로 로그 전체가 무오류였다는 뜻은 아니다.

## 공개 배포

2026-10-03 **00:25:45 KST**, [v1.8.1.42](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.42)를 당시 최신 안정 릴리스로 게시했다. 제품 태그와 릴리스 대상은 `edb8d7aa4035a484275a0a6a0be91d5a0fbb9912`다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.42-x64.exe` | 120,878,813 | `86a086f07ccfac15f8415f2a9daa42e0008ec3e95f054b821dfc2b999bb6c18f` |
| `Acedia-Setup-1.8.1.42-x64.exe.blockmap` | 126,720 | `247aa6ee2e3c9c718ce3714f4804ac872ddb7acd170958a83f67c787ee64c148` |
| `latest-exe.json` | 256 | `2789fbe8b3c5bf5050523bcf8e3b7d6e6871650d5a123d5df333ba1b6c7107bf` |

공개 설치 파일 FileVersion은 **1.8.1.42**, Authenticode는 **NotSigned**다. 같은 빌드의 manifest와 설치 파일 크기·SHA-256이 일치한다.

00:26:45 KST에 프로덕션 업데이터로 **1.8.1.41 → 1.8.1.42 감지·실제 다운로드·설치 전 해시 검증**을 완료했다. 세 공개 자산의 크기·SHA-256, 제품 소스 태그와 재사용 APK 버전도 확인했다. 설치 프로그램 실행은 별도 사용자 동작이다.
