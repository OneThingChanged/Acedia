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

Git 소스와 EXE 게시를 완료했다. 배포 직후 확인 시 실행 중인 사용자 설치본은 **1.8.1.57**이었으며 자동 설치나 재시작은 수행하지 않았다. Microsoft Store와 새 APK 배포는 수행하지 않았다.

## 설치본과 실제 캐시 재사용 확인

2026-10-06 **20:06:52 KST**에 사용자 PC의 설치 EXE FileVersion이 **1.8.1.59**임을 확인했다. 실행 중인 **ToonShader** 세션의 완료 요청 메타데이터와 Codex 원본 대화 기록을 읽어 실제 입력 토큰 재사용을 확인했다. 검증용 모델 요청을 추가하거나 세션을 재시작하지 않았다.

| 측정 범위 | 완료 호출 | 전체 입력 토큰 | 캐시 입력 | 새 입력 | 캐시 재사용률 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 최신 완료 호출 | 1 | 126,130 | 122,624 | 3,506 | **97.2%** |
| 최근 완료 10회 | 10 | 1,122,842 | 1,096,064 | 26,778 | **97.6%** |
| 보관된 측정 가능 완료 요청 | 42 | 4,047,066 | 3,724,416 | 322,650 | **92.0%** |

최신 호출의 요청 시작은 **20:06:15**, Codex 원본의 완료 토큰 이벤트는 **20:06:38 KST**다. 이 호출의 전체 입력·캐시 입력·새 입력 수치는 라우팅 기록과 원본 기록이 일치했다. 최근 10회 요청 시작 범위는 **19:58:33–20:06:15**, 보관된 42회는 **19:38:05–20:06:15 KST**다. 42회는 보관된 요청 범위이며 세션 전체 누적 사용량을 뜻하지 않는다.

재사용률은 `캐시 입력 합계 / 전체 입력 합계 × 100`으로 계산한다. 출력 토큰·모델 목록 조회·완료되지 않은 요청·사용량 정보가 없는 요청은 제외한다. 라우팅 기록의 입력은 캐시를 포함하고, Usage DB의 새 입력과 캐시 입력은 별도 필드이므로 [계산 기준](usage-accounting.md#codex-cache-reuse-calculation)에 따라 분모를 맞춘다.

이는 해당 시점 ToonShader의 실제 캐시 재사용 관측이다. 동일 조건의 수정 전후 비교를 수행한 것은 아니므로 라우팅 수정만의 개선 폭, 다른 세션의 상태나 구독 한도 절감률을 확정하지 않는다. 위 개발·패키지 검증의 모의 응답 수치와 구분한다.

## 분산 계정 전환과 재시작 실측

2026-10-06 **21:32:19–21:34:04 KST**에 실제 등록된 두 분산 계정 A·B로 새 검증 대화를 실행했다. 검증용 Electron Dashboard 창, 현재 소스의 `AccountPool`과 설치된 Codex CLI **0.160.1**을 사용했다. 작업·Chromium·Codex 홈은 별도 프로필이며 라우터는 독립 loopback 포트를 사용했다. 기존 사용자 작업 세션을 종료하거나 시험 메시지를 보내지 않았다.

모델은 **gpt-6.1-sol**, effort는 **low**, 전송 요청의 service tier는 **default**다. 합성 참조 자료를 첫 메시지에 넣고 후속 메시지를 추가했다. 모델은 도구를 호출하지 않고 짧은 확인 문자열만 출력했다. 같은 Codex 대화 ID와 `session-id`·`thread-id`·`prompt_cache_key`를 유지한 상태에서 A의 후속 호출, A 재시작, B 전환, B 후속 호출과 A 복귀를 차례로 비교했다.

| 완료 시각 (KST) | 단계 | 전체 입력 | 캐시 입력 | 새 입력 | 캐시 재사용률 |
| --- | --- | ---: | ---: | ---: | ---: |
| 21:32:49 | A 최초 호출 | 13,926 | 0 | 13,926 | 0.0% |
| 21:32:53 | A 후속 호출 | 13,956 | 0 | 13,956 | 0.0% |
| 21:33:10 | 같은 A로 재시작 | 13,986 | 13,824 | 162 | **98.8%** |
| 21:33:29 | B 전환 후 첫 호출 | 14,017 | 13,824 | 193 | **98.6%** |
| 21:33:39 | B 후속 호출 | 14,047 | 13,824 | 223 | **98.4%** |
| 21:34:03 | A로 복귀 후 호출 | 14,077 | 13,696 | 381 | **97.3%** |

6회 모두 라우팅 기록, native `thread/tokenUsage/updated`와 원본 JSONL의 개별 토큰 이벤트가 일치했다. 실제 전송 계정 식별값이 A→B→A로 바뀌는 것도 확인했으며, B 전환 요청은 직전 요청의 입력 항목을 그대로 보존했다. 생성 요청의 누적 입력은 **84,009**, 캐시 입력은 **55,168**, 새 입력은 **28,841**, 출력은 **43 토큰**이었다. 실제 사용량을 소비한 검증이며 모의 모델 응답을 사용하지 않았다.

이번 관측에서는 **계정 전환 직후에도 높은 캐시 재사용이 유지됐다**. 따라서 계정 전환이 반드시 캐시 초기화나 낮은 적중률로 이어진다고 설명해서는 안 된다. 다만 두 계정·한 모델·약 14,000 입력 토큰의 짧은 대화 한 건을 단시간에 비교한 결과이며, 다른 계정 조합·모델·긴 비활성 시간·15만 토큰 이상의 대화나 실제 구독 한도 절감률을 검증한 것은 아니다. 초기 A 2회가 0%였던 원인도 확정하지 않았다.

테스트용 프로필에서 표준 Electron 인증 경로로 기존 암호화 계정 자료를 사용했다. 기존 로그인에 영향을 줄 수 있는 인증 갱신은 허용하지 않았고 인증 값을 로그나 검증 보고서에 저장하지 않았다. 종료 후 임시 암호화 계정·키 사본은 제거했다. 원본 수치·요청 메타데이터·검증창 캡처는 Git에서 제외된 로컬 `output/live-account-cache-e38bcef1-d9eb-44dd-a6f0-101a679c6a67/`에 보관한다.
