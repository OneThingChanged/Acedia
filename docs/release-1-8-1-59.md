---
type: Release
title: Acedia 1.8.1.59 Codex cache routing and project folder hierarchy
description: Preserve Codex cache affinity headers, accurately record completed streamed usage, and show active projects with automatic folder relationships.
status: candidate
last_updated: 2026-10-06
sources:
  - resource: account-pool.md
  - resource: usage-accounting.md
  - resource: session-organization.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/services/account-pool.mjs
---

# Acedia 1.8.1.59

## 변경 사항

- **Codex 캐시 연결 정보 보존**: 계정 분산 라우팅에서 Codex가 보내는 `session-id`, `thread-id`, `x-client-request-id`를 전달한다. 대화의 캐시 키와 요청 본문, 턴 상태를 유지하며 Acedia의 세션 ID로 바꾸지 않는다. 실제 캐시 적중률은 모델·대화·서버 조건에 따라 달라진다.
- **완료 응답의 사용량 기록 수정**: 스트림이 `application/json`으로 표시되어도 완료 이벤트와 토큰 사용량을 읽는다. Codex가 완료 직후 연결을 닫아도 완료된 요청을 취소로 잘못 기록하거나 사용량을 누락하지 않는다. 실제 0토큰 응답과 토큰 정보가 없는 응답을 구분한다.
- **활성 프로젝트 보드**: Active 보기에서는 실행 중인 세션 프로세스가 없는 프로젝트를 숨긴다. 프로젝트 필터·연결선·미니맵도 보이는 프로젝트를 기준으로 갱신한다.
- **폴더 상하 관계 표시**: 상위·하위 작업 폴더를 자동 연결하고, Arrange로 부모 프로젝트 아래에 자식 프로젝트를 정렬한다. 자동 폴더 관계와 수동 부모 설정·참조 관계를 구분하며 배치 변경의 실행 취소·다시 실행을 지원한다.
- 제품·설치 파일·Android 소스 버전은 **1.8.1.59**, npm 호환 버전은 **1.8.1**이다. 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다. 데스크톱 업데이트 후 분산 Codex 세션을 다시 열어 새 라우팅을 적용한다. 저장된 대화는 유지된다.

## Changes

- Preserve native Codex session, thread and client request headers through account routing, along with the original cache key, request body and turn state. Actual cache reuse remains dependent on model, conversation and server conditions.
- Recognize streamed completion and usage even when the upstream labels the response as JSON. Keep completed requests completed when the client closes immediately, and distinguish reported zero usage from unavailable usage.
- Hide projects without a live session process in the Active organization board, including filters, connections and the minimap.
- Automatically connect nested project folders and arrange children below parents. Distinguish folder relationships from manually configured parents and references, with undo and redo for layout changes.
- Update the desktop to 1.8.1.59 and restart routed Codex sessions to use the corrected transport while retaining saved conversations. Reuse the signed mobile APK 1.8.1.39.

## 검증

- 캐시·스트림·사용량·버전 관련 **6개 파일·111개 검사**, TypeScript/Vite 빌드와 설치된 **Codex CLI 0.160.1**의 격리 계정·네이티브 도구·계정 전환·대화 복원 검증을 통과했다.
- 별도 프로필의 **1.8.1.59 데브 앱**을 실행했다. 로컬 모의 응답과 실제 Codex CLI의 연속 두 턴에서 캐시 식별 정보 유지 및 완료·토큰 기록을 검증했다.
- 실제 Electron Usage 화면의 **1100/390px**에서 생성 요청 10건과 모델 조회 1건, 0토큰·정보 없음의 구분 및 가로 넘침 없음을 확인했다. 모의 응답을 사용했으며 실제 상용 캐시 적중률의 개선 폭은 측정하지 않았다.
- 프로젝트 보드는 실제 Electron 창에서 프로세스 종료 후 프로젝트·연결선·진행 중 연결 동작의 제거, 폴더 계층 배치, 실행 취소·다시 실행과 크기 변경을 검증했다.
- EXE 빌드·패키지 검증·공개 게시 및 업데이터 다운로드 결과는 완료 후 이 문서에 기록한다.
