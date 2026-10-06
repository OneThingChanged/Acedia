---
type: Release
title: Acedia 1.8.1.59 Codex cache routing and project folder hierarchy
description: Preserve Codex cache affinity headers, accurately record completed streamed usage, and show active projects with automatic folder relationships.
status: stable
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

- 전체 **166개 파일·1,108개 검사**를 검증했다. 설치·제거 표시 버전과 검사 환경의 Git 경로를 바로잡고, 초기 실패가 있었던 **2개 파일·27개 검사**를 다시 실행해 통과했다.
- 캐시·스트림·사용량·버전 관련 **6개 파일·111개 검사**, TypeScript/Vite 빌드와 설치된 **Codex CLI 0.160.1**의 격리 계정·네이티브 도구·계정 전환·대화 복원 검증을 통과했다.
- 별도 프로필의 **1.8.1.59 데브 앱**을 실행했다. 로컬 모의 응답과 실제 Codex CLI의 연속 두 턴에서 캐시 식별 정보 유지 및 완료·토큰 기록을 검증했다.
- 실제 Electron Usage 화면의 **1100/390px**에서 생성 요청 10건과 모델 조회 1건, 0토큰·정보 없음의 구분 및 가로 넘침 없음을 확인했다. 모의 응답을 사용했으며 실제 상용 캐시 적중률의 개선 폭은 측정하지 않았다.
- 프로젝트 보드는 실제 Electron 창에서 프로세스 종료 후 프로젝트·연결선·진행 중 연결 동작의 제거, 폴더 계층 배치, 실행 취소·다시 실행과 크기 변경을 검증했다.
- TypeScript/Vite와 EXE 빌드, packaged bridge·Dashboard·내장 Git 및 종료·트레이·보안 lifecycle 검증을 통과했다.
- 실제 `app.asar`의 라우팅·Dashboard 모듈로 HTTP 응답 8종과 실제 Codex CLI 연속 두 턴, **1100/390px** Usage 표시를 다시 검증했다. 생성 요청 **10건**과 모델 조회 **1건**을 기록했으며, 잘못된 실패·취소 기록은 **0건**이었다. 모의 응답만 사용했고 상용 모델 호출은 없었다.
- 패키지의 라우팅·사용량 Electron 파일 **11개**, 프로젝트 보드 관련 파일 **13개** 및 renderer 파일 **3개**가 빌드 원본과 일치했다. 번들 APK 해시도 기존 서명 APK와 일치했다.
- 설치 파일 FileVersion **1.8.1.59**, 파일명·크기·SHA-256과 blockmap을 확인하고 `publish-github-exe.ps1 -VerifyOnly`를 통과했다. Authenticode는 기존 EXE 채널과 같은 **NotSigned**다.
- 실행 중인 사용자 세션에 시험 요청을 보내거나 설치된 앱을 종료하지 않았다.

## 공개 배포

2026-10-06 **18:54:28 KST**, [v1.8.1.59](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.59)를 최신 안정 EXE 릴리스로 게시했다. 제품 태그와 릴리스 대상은 빌드·패키지 검증을 완료한 소스 `a9c4aa9b2f6e7069727e5bee12c26843722b0651`이다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.59-x64.exe` | 151,274,654 | `2e1c63fd10630dcf849ad7b6d4a85f532f14f3daadd0d04477041dadde8610c0` |
| `Acedia-Setup-1.8.1.59-x64.exe.blockmap` | 159,125 | `c3149c6f60a90a9b713af7dd3feb70456b25fcc10089bab302c6a0b213a3dc27` |
| `latest-exe.json` | 256 | `eabee03d17839c583c15f87c169108b4addd60e63350c50a319da39b3f148e9b` |

**18:55:32 KST**에 프로덕션 업데이터의 **1.8.1.54·1.8.1.57·1.8.1.58 → 1.8.1.59 감지**와 **1.8.1.57 기준 공개 EXE 다운로드·설치 전 해시 검증**을 완료했다. 세 공개 자산의 크기·SHA-256, 최신 안정 릴리스, 소스 태그와 번들 APK 버전 **1.8.1.39**도 일치했다.

Git 소스와 EXE 게시를 완료했다. 확인 시 실행 중인 사용자 설치본은 **1.8.1.57**이며 자동 설치나 재시작은 수행하지 않았다. 설정의 Check → Update로 데스크톱을 업데이트하고 분산 Codex 세션을 다시 열면 새 라우팅이 적용된다. Microsoft Store와 새 APK 배포는 수행하지 않았다.
