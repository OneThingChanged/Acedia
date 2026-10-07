---
type: Release
title: Acedia 1.8.1.60
description: "스크린 해제 메뉴, 브라우저 테마 동기화, Claude 로그인 안내와 프로젝트 생성 설정 자동 관리."
status: candidate
last_updated: 2026-10-07
---

# Acedia 1.8.1.60

## 변경 내용

- 왼쪽 SCREENS 항목의 우클릭 메뉴에서 **스크린 해제**를 제공한다. 분할 화면을 개별 화면으로 풀면서 탭·선택 상태·프로젝트·세션 고정을 보존한다.
- 앱 테마 변경이 내장 브라우저의 도구 모음·주소 입력·탭 메뉴·방문 기록·다운로드 화면에도 즉시 적용된다. 열려 있는 웹페이지를 다시 로드하지 않는다.
- Claude의 `Login expired · Please run /login`을 일반 답변 대기로 표시하던 문제를 수정했다. 데스크톱과 Remote에 **Claude 로그인 필요** 및 해당 세션의 터미널을 여는 버튼을 표시한다. 인증은 사용자가 터미널에서 `/login`으로 완료한다.
- 로컬 Claude·Codex·Qwen 세션 시작 시 `.acedia/`에 전용 설정과 관리 목록을 생성한다. Git 로컬 exclude 및 Perforce ignore 규칙을 추가하고, 기존 Acedia 설정이 확인된 파일의 읽기 전용 속성을 해제한다. CLI가 읽는 기존 설정 경로와 사용자 설정은 보존한다.
- 설정 병합 실패 시 임시 파일을 정리하고, 링크·junction을 통한 프로젝트 외부 쓰기를 차단한다.

프로젝트 생성 파일의 관리 범위와 Git·Perforce 동작은
[프로젝트 설정 관리](project-managed-files.md)를 참고한다.

## English

- Add an Ungroup screen action to the SCREENS context menu while preserving tabs, focus, project ownership and session pins.
- Apply app themes immediately to embedded browser controls, history and downloads.
- Show a dedicated Claude authentication prompt and terminal action when login expires on desktop and Remote.
- Manage generated project settings under `.acedia/`, add local Git/Perforce ignores and repair read-only files containing verified Acedia settings while retaining user configuration.
- Preserve existing CLI configuration paths; reuse the signed mobile APK 1.8.1.39.

## 검증

- 전체 **166개 파일·1,123개 검사** 및 TypeScript 검사를 통과했다.
- 설정 관리·터미널 실행 관련 **50개 검사**에서 실제 Windows 읽기 전용 파일 해제, 사용자 설정 보존, Git 중첩 프로젝트·worktree, Perforce 사용자 지정 ignore와 junction 차단을 확인했다.
- 실제 Electron에서 스크린 우클릭 메뉴·해제·레이아웃 복원과 4개 테마의 브라우저 도구 모음·메뉴·방문 기록·다운로드 표시를 확인했다.
- Claude 인증 안내는 데스크톱 및 Remote **1024/390px**에서 로그인 필요 표시·터미널 열기·오류 해제 후 복구를 검증했다. 실제 OAuth 로그인이나 ACL 접근 거부 복구를 검증한 것은 아니다.

EXE 빌드·패키지 및 공개 배포 검증은 완료 후 기록한다. Microsoft Store와 새 APK 배포는 이 릴리스에 포함하지 않는다.
