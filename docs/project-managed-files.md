---
type: Reference
title: 프로젝트의 Acedia 생성 설정 관리
description: "세션 시작 시 생성 설정 관리, Git·Perforce ignore와 읽기 전용 복구."
status: stable
last_updated: 2026-10-07
---

# 프로젝트의 Acedia 생성 설정 관리

로컬 Claude·Codex·Qwen 세션을 시작하거나 훅 설정을 복구할 때 프로젝트의
`.acedia/` 폴더에 Acedia 전용 설정과 `managed-files.json` 관리 목록을 생성한다.
전용 설정에는 Acedia 훅·브라우저 MCP 설정만 저장하며 사용자 설정을 복사하지 않는다.
관리 목록은 각 CLI 설정 경로와 전용 설정 파일을 연결한다.

CLI가 읽는 기존 경로는 유지한다. Claude는 `.claude/settings.local.json`과
`.mcp.json`, Codex는 `.codex/config.toml`, Qwen은 `.qwen/settings.json`을 사용한다.
이 파일에는 기존 사용자 설정을 보존하면서 Acedia 설정을 병합한다.
`.acedia/`의 전용 설정은 매 세션 시작 시 현재 설치 경로에 맞게 갱신된다.

기존 파일의 Acedia 훅 표시(`__source: multiagent`)나 브라우저 MCP 실행 인자가
확인되면 읽기 전용 속성을 자동 해제한다. 설정 내용이 바뀌지 않아도 적용한다.
사용자 설정만 있는 읽기 전용 파일, ACL 접근 거부, 잘못된 JSON은 자동으로 덮어쓰지 않는다.
관리 목록에 적힌 경로만으로 읽기 전용을 해제하지 않으며 링크·junction을 통한
프로젝트 외부 경로 변경도 허용하지 않는다.

Git 저장소에서는 `.git/info/exclude`에 프로젝트 범위의 `.acedia/`와 CLI 설정
경로를 추가한다. 중첩 프로젝트와 Git worktree도 지원한다. 기존 ignore 규칙과
공용 `.gitignore`는 보존한다. 이미 추적 중인 파일은 ignore를 추가해도 추적 상태가
바뀌지 않으며 자동으로 `git rm`하거나 인덱스를 수정하지 않는다.

Perforce는 로컬 `p4 set -q`, 환경 변수, 상위 `P4CONFIG` 및 ignore 파일로 감지한다.
프로젝트 안에서 사용할 수 있는 `P4IGNORE` 파일명을 우선 사용하고, 지정이 없으면
현행 클라이언트의 기본 `.p4ignore`에 규칙을 추가한다. ignore 파일 자체도 ignore한다.
기존 ignore 파일이 읽기 전용이면 쓰기 속성을 해제하고 기존 규칙을 보존한다.
전역 절대 경로만 지정된 경우 프로젝트 파일명을 `P4IGNORE`에 추가해야 한다는
오류를 보고한다. 서버 연결, checkout, submit, 전역 `p4 set` 변경은 수행하지 않는다.
기본 ignore 파일을 지원하지 않는 구형 클라이언트는 `P4IGNORE`를 지정해야 한다.

SSH 원격 부트스트랩과 사용자 계정 홈 설정은 이 프로젝트 자동 관리의 대상이 아니다.
