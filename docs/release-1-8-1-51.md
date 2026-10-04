---
type: Release
title: Acedia 1.8.1.51 parent and child session organization
description: Organize real sessions as a project tree with folder, instruction and model inheritance while preserving independent conversations and creation provenance.
status: stable
last_updated: 2026-10-04
sources:
  - resource: session-organization.md
  - resource: exe-release-workflow.md
  - resource: ../app/src/components/SessionOrganization.tsx
  - resource: ../app/src/lib/sessionHierarchy.ts
  - resource: ../app/src/lib/spawn.ts
  - resource: ../app/electron/services/workspace-management.mjs
  - resource: ../app/scripts/electron-session-organization-smoke.mjs
---

# Acedia 1.8.1.51

## 변경 사항

- **세션 조직도**: Browser hub 바로 아래의 조직도에서 실제 프로젝트와 세션을 트리로 확인한다. 활성·전체 세션 필터, 검색, 가지 접기, 확대·축소, 전체 프로젝트 보기를 제공한다.
- **부모·자식 관리**: 선택한 세션 아래에 독립 자식을 만들고, 같은 프로젝트 안에서 부모를 변경한다. 순환 관계를 막으며 부모 삭제 시 자식을 한 단계 위로 옮기고 유효 설정을 보존한다.
- **설정 상속**: 부모의 작업 폴더·추가 지침을 이어받고, 같은 제공자의 로컬 Codex·Claude 모델·effort를 선택적으로 상속한다. 자식의 개별 값을 보존하고 직접 모델을 바꾸면 모델 상속을 해제한다. 저장한 설정은 다음 실행에 적용한다.
- **대화와 생성 기록 보존**: 폴더 관계를 옮겨도 기존 대화 ID와 생성 주체가 유지된다. 복원 경로와 실제 실행 폴더를 구분하며 재실행·공유 작업창 동기화를 지원한다. Acedia MCP가 같은 프로젝트에 생성한 세션은 호출 세션의 자식으로 기록한다.
- 제품·설치 파일·Android 소스 버전은 **1.8.1.51**, npm 호환 버전은 **1.8.1**이다. EXE에는 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다.

## Changes

- Add Organization below Browser hub to view real project/session trees, with active/all filters, search, collapsed branches, zoom and a project overview.
- Create independent child sessions and move sessions within their project. Prevent cycles and preserve effective child settings when deleting a parent.
- Inherit working folders, additional instructions and optional local same-provider model/effort defaults. Preserve individual overrides and apply changes on the next launch.
- Preserve conversation IDs, original resume lookup folders and creation provenance. Restore relationships across restarts and shared workspace windows, and record local MCP-created sessions under their caller in the same project.

## 검증

- 전체 **157개 파일·1,021개 테스트**, TypeScript/Vite 프로덕션 빌드와 `git diff --check`를 통과했다.
- 실제 App의 별도 임시 프로필에서 자식 생성, 부모 변경, 폴더·지침·모델 전달, 직접 모델 변경, 순환 방지와 기존 브라우저 이동을 검증했다.
- 재실행 복원, 공유 작업창의 저장 이벤트, 상속 폴더가 바뀐 대화의 첫 복원과 후속 실행을 확인했다. 1600×1000, 1280×900, 800×640에서 배치를 검증했다.
- 세션·프로젝트 생성 창의 한국어·영어, 세 테마, 데스크톱·모바일 및 확장 설정 배치와 터미널 링크·native PTY 검증을 통과했다.
- Standard 패키지의 내장 Git, bridge/Dashboard, 종료·트레이·보안 lifecycle 검사와 설치 파일·manifest·크기·SHA-256·blockmap 검증을 통과했다.
- 공개 설치 파일에도 `publish-github-exe.ps1 -VerifyOnly`를 적용해 버전과 실제 다운로드의 일치를 확인했다. Authenticode는 **NotSigned**이며 기존 EXE 채널과 같은 서명 상태다.

## 공개 배포

2026-10-04 **21:27:01 KST**, [v1.8.1.51](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.51)를 최신 안정 EXE 릴리스로 게시했다.
제품 태그와 릴리스 대상은 고정 소스 `8b12bb5f6685a354564a123cd986b6f5d8b0cd16`다.
로컬에서 검증한 세 자산의 업로드 크기·GitHub SHA-256·소스 태그를 확인한 뒤 게시했다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.51-x64.exe` | 151,228,964 | `d57ab288090633ded18027d8ce9a59e499a15b408c863cab6875ed7dc5171d99` |
| `Acedia-Setup-1.8.1.51-x64.exe.blockmap` | 159,129 | `bcedd712202f23d83e4a6668c47d23eebc0dc708d40ec24741ca8a6d53cf3a47` |
| `latest-exe.json` | 256 | `bbf634bd3b55e4e085494f7116d35df411913a3fcc8ac0c3b4e19677bd58d9e4` |

**21:28:22 KST**에 프로덕션 업데이터로 **1.8.1.49 및 1.8.1.50 → 1.8.1.51 감지**와
**1.8.1.50 기준 실제 설치 파일 다운로드·설치 전 해시 검증**을 완료했다.
세 공개 자산의 실제 다운로드 크기·SHA-256, 최신 안정 릴리스, 제품 소스 태그와 재사용 APK 버전도 확인했다.

EXE와 Git 소스 게시를 완료했다. 사용자 PC의 설치 프로그램은 실행하지 않았으며 앱의 Check → Update에서 적용한다.
Microsoft Store와 새 APK 배포는 수행하지 않았다.

## 지원 범위

조직 관계는 폴더와 설정 상속을 위한 것이다. 기존 CLI 내부 작업자 모니터와 별도로 관리하며, 자동 작업 위임·결과 회수를 추가하지 않는다.
로컬 Claude의 복원된 추가 지침 갱신은 Claude Code 2.1.257 이상, 다른 폴더에서 대화 ID 복원은 2.1.223 이상이 필요하다.
SSH Claude의 추가 지침과 SSH 모델 상속은 현재 지원하지 않는다. 자세한 규칙은 [세션 조직도](session-organization.md)를 따른다.
