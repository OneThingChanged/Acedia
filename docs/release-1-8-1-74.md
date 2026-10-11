---
type: Release
title: Acedia 1.8.1.74
description: "세션별 실행 설정 기억, 사이드바 종료·경로 검색, 고정 큐와 라우팅 사용량 자동 갱신."
status: draft
last_updated: 2026-10-11
---

# Acedia 1.8.1.74

## 변경 내용

- 세션별 **모델·effort·Fast 설정**을 기억해 휴면·종료·재시작 후 다시 적용한다. 터미널 명령으로 바꾼 설정도 native 알림과 현재 터미널·대화 기록에서 확인한다. 같은 계정과 작업 폴더의 설정을 복원하고, 사용자 선택과 실제 실행 중인 설정을 구분해 늦게 도착한 이전 상태가 새 선택을 덮어쓰지 않게 한다. 현재 모델 표시와 지원 effort/Fast 선택도 함께 보완했다.
- 사이드바의 실행 중인 세션에 **× 종료 버튼**을 추가했다. 최근 대화·프로젝트·검색 결과에서 바로 종료하며 대화 기록은 유지한다. 이름 변경은 우클릭의 Rename에서 사용하고 더블클릭 이름 변경은 제거했다.
- 사이드바 검색과 상단 Quick Search에서 **폴더 경로로 프로젝트와 세션**을 찾는다. Windows 경로의 슬래시·대소문자·둘러싼 따옴표를 정규화하며, 세션 자체 경로와 연결된 프로젝트 경로를 모두 검색한다.
- 채팅 하단을 **Working → 큐 → 입력창** 순서로 고정했다. 예약 메시지는 대화 기록과 별도로 스크롤하며, 기록을 이동해도 현재 작업과 큐·입력창은 같은 자리에 유지된다.
- 라우팅 사용량을 **Refresh 없이 자동 반영**한다. Codex의 사용량 변경 알림을 실제 배정 계정에 연결하며, 알림이 없을 때는 기존 native 연결로 계정당 **5분 간격** 조회한다. 같은 계정의 중복 조회를 합치고, 부분 알림에 없는 한도 정보와 조회 실패 시 이전 값을 유지한다. 오래된 응답은 최신 값을 덮어쓰지 않는다.

사용 방법과 구현 범위: [워크스페이스 동작](workspace-interactions.md),
[세션 실행 설정](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.74/docs/agent-launch-options.md),
[라우팅 사용량](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.74/docs/account-pool.md).
기존 서명 APK **1.8.1.39/code 21**을 포함하는 EXE 업데이트다.

## English

- Remember each session's model, reasoning effort and Fast setting across sleeping, closing and restarting. Observe native terminal changes, preserve explicit selections and restore settings for the same account and folder. Improve the current-model display and supported effort/Fast choices.
- Add a close button to active sidebar sessions in recent conversations, projects and search results while keeping their history. Rename sessions through the context menu.
- Find projects and sessions by their own or associated project folder paths in sidebar search and Quick Search, including normalized Windows paths.
- Keep Working, queued messages and the composer in a fixed Chat footer, with independent conversation and queue scrolling.
- Automatically display quota updates for the bound routed account. Use existing native connections for five-minute fallback polling, coalesce duplicate account reads, preserve missing metadata and reject stale responses.

## 검증

- 기능 소스의 전체 **182개 파일·1,299개 검사**를 통과했다. 관련 모델·실행·검색·큐·사용량 단위 검사를 포함하며 건너뛴 검사는 없다.
- 앞선 기능 검증에서 실제 Electron 사이드바의 종료·이름 변경·경로 검색, Chat 모델 선택과 고정 큐 배치를 확인했다. Chat 큐는 **1024·420·320px**에서 Working → 큐 → 입력창 순서와 독립 스크롤을 통과했다.
- 설치된 **Codex 0.162.0**과 격리 프로필·로컬 응답을 사용해 같은 대화의 모델·effort 복원, 명시적 변경과 Fast/Off 설정 해석을 검증했다. 유료 Fast 이용 가능 여부나 실제 과금은 검증하지 않았다.
- 라우팅에서는 실제 CLI의 응답 헤더 → native 사용량 알림 → 배정 계정 한도 연결과 실제 Electron 하단바의 자동 갱신을 확인했다. 수동 Refresh 중 변경 알림, 중복 알림·조회, 이전 연결·응답 무시도 통과했다. 실제 유료 계정의 사용량을 발생시키는 검사는 아니다.
- 주기 조회를 5분으로 조정한 뒤 관련 **19개 검사**를 통과했다. 1분에는 조회하지 않고 5분에 조회하며 마지막 native 연결 종료 시 멈추는 동작을 확인했다.
- 제품 버전과 Android 소스 versionName은 **1.8.1.74**, npm은 **1.8.1**이다. 새 APK를 만들지 않아 기존 서명 APK **1.8.1.39/code 21**을 재사용한다.
- 버전 갱신 후 배포 대상의 전체 **182개 파일·1,299개 검사**와 모바일 **24개 검사**를 통과했다. 첫 전체 실행에서 모의 Store의 WACK XML 검사가 기본 5초 제한에 걸렸다. 단독 재실행에서는 Git PATH 누락을 수정했고, 배포 지침의 `--maxWorkers=2 --testTimeout=60000` 환경으로 전체 검사를 다시 통과했다. Store의 실제 빌드·제출은 실행하지 않았다.
- TypeScript·Vite 프로덕션 빌드를 통과했다. 기존 큰 번들 경고는 유지된다.
- EXE 패키지와 공개 자산 검증 결과는 배포 완료 후 아래에 기록한다.

배포 전 검사 증빙: `output/full-suite-exe-1.8.1.74.log`,
`output/exe-1.8.1.74-store-test-recheck.log`, `output/full-suite-exe-1.8.1.74-bounded.log`,
`output/mobile-tests-exe-1.8.1.74.log`, `output/build-frontend-1.8.1.74.log`.

## 공개 배포

배포 준비 중이다. GitHub 안정 릴리스 게시와 공개 업데이터 다운로드·해시 검증을 완료하면 고정 소스와 결과를 기록한다.
