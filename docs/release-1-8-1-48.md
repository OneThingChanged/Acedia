---
type: Release
title: Acedia 1.8.1.48 native Codex tools and workspace MCP
description: Preserve native tools for distributed Codex accounts and create projects and sessions through the managed MCP connection.
status: draft
last_updated: 2026-10-03
sources:
  - resource: account-pool.md
  - resource: workspace-mcp.md
  - resource: embedded-browser-mcp.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/services/account-pool-session.mjs
  - resource: ../app/electron/services/workspace-management.mjs
  - resource: ../app/scripts/account-pool-tools-smoke.mjs
  - resource: ../app/scripts/electron-workspace-mcp-smoke.mjs
  - resource: ../.github/workflows/release-exe.yml
---

# Acedia 1.8.1.48

## 변경 사항

- **분산 계정의 Codex 기본 도구 유지**: 각 세션을 배정 계정으로 인증한 전용 native app-server에 연결한다. 이미지·검색 등 Codex 기본 도구 요청을 같은 계정으로 전달하고, 기존 MCP·hooks·실행 프로필과 대화 이어받기를 유지한다. 실제 계정 토큰은 실행 인수·환경변수·공용 로그인 파일에 기록하지 않는다.
- **프로젝트·세션 생성 MCP**: 기존 `multiagent_browser` 연결에 `acedia_projects`, `acedia_project_create`, `acedia_session_create`를 추가한다. 이미 있는 로컬 폴더를 프로젝트로 등록해 첫 세션을 만들거나 추가 세션을 생성할 수 있다. 중복 폴더·재시도를 처리하며, 저장 및 시작 결과를 구분해 반환한다.
- 분산 실행에는 **Codex CLI 0.160.0 이상**이 필요하다. 각 계정의 도구 제공 여부와 외부 Apps 연결 권한은 해당 서비스에서 결정한다. 업데이트 후 기존 세션을 다시 시작해야 새 연결 방식과 MCP 도구 목록이 적용된다.
- 제품·설치 파일·Android 소스 버전은 **1.8.1.48**, npm 호환 버전은 **1.8.1**이다. EXE에는 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다.

## Changes

- Preserve native Codex tools for routed accounts by connecting each session to a dedicated app-server authenticated with its assigned ChatGPT account. Retain MCP, hooks, named launch profiles and conversation resume without writing account tokens into shared login files or launch arguments.
- Add `acedia_projects`, `acedia_project_create` and `acedia_session_create` to the managed MCP connection. Register existing local folders, create the first or an additional session, prevent duplicate retries, and return durable creation and startup results separately.
- Routed sessions require Codex CLI 0.160.0 or later. Tool availability and external Apps permissions remain account dependent. Restart existing sessions after updating to load the new connection and MCP tools.

## 검증

- 로컬 전체 **153개 파일·980개 테스트**, TypeScript/Vite 프로덕션 빌드와 `git diff --check`를 통과했다.
- 실제 설치 CLI **0.160.0**과 격리된 두 모의 계정으로 native 이미지·검색 결과 및 MCP 호출, 동일 계정 인증 갱신, 프로필의 MCP·개발자 지시 적용을 검증했다. 계정 제외 후 실제 TUI로 같은 대화를 이어받아 기존 메시지 보존과 이전 연결의 해제가 새 연결에 영향을 주지 않는 것을 확인했다.
- 실제 Electron의 격리된 작업 공간에서 모의 프로젝트 등록과 두 세션 생성, 중복 방지, snapshot 저장 및 기본 실행 설정을 검증했다. 실제 사용자 프로젝트 등록·상용 이미지 생성·외부 Apps 인증은 이 검사에 포함하지 않았다.
- 공식 Windows 빌드·설치본 실행 검사와 공개 업데이트 다운로드 결과는 게시 후 기록한다.
