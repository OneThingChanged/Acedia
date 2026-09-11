---
type: Guide
title: 설정 확장 일괄 확인
description: 1.8.0.10–1.8.0.15 설정 기능을 한 번에 확인하는 순서와 자동 검증 범위.
status: stable
sources:
  - resource: ../app/src/components/SettingsModal.tsx
  - resource: ../app/scripts/electron-settings-search-smoke.mjs
  - resource: ../app/scripts/electron-terminal-settings-smoke.mjs
  - resource: ../app/electron/services/idle-session-smoke.mjs
---

# 설정 확장 일괄 확인

이 문서의 확인 대상은 **1.8.0.15** 소스다. 이전 개발앱이 실행 중이면 종료 후 다시 실행해야 새
메인 프로세스 기능을 사용할 수 있다. `app/`에서 `npm run electron:dev`로 실행한다.
설치본 갱신·배포는 이번 소스 제출 범위에 포함하지 않는다.

## 반영한 커밋

| 버전 | 커밋 | 기능 문서 |
|---|---|---|
| 1.8.0.10 | `008bd9c` | [브라우저 기본 설정](browser-preferences.md) |
| 1.8.0.11 | `1a8ba3a` | [브라우저 프로필·웹 탭 복원](browser-preferences.md) |
| 1.8.0.12 | `0935839` | [저장 명령·프로젝트 시작](saved-commands.md) |
| 1.8.0.13 | `f4d58f3` | [알림 조건·절전 방지](notifications-and-power.md) |
| 1.8.0.14 | `100007c` | [상태 표시줄 구성](status-bar-settings.md) |
| 1.8.0.15 | `88eef80` | [유휴 세션 중지·복원](idle-sessions.md) |

## 사용자 확인 순서

| 순서 | 확인할 내용 | 기대 결과 |
|---|---|---|
| 1 | 설정 → 브라우저에서 홈·검색엔진·배율·링크 열기 저장 | 새 탭의 홈, 주소 검색, 현재·새 탭 배율과 앱 웹 링크 동작이 반영된다. |
| 2 | 브라우저 프로필 추가 후 프로필별 새 탭 열기 | 탭에 프로필 이름이 표시되고 같은 사이트의 로그인이 분리된다. 웹 탭 복원을 켜면 앱 재시작 후 프로필과 탭이 복원된다. |
| 3 | 설정 → 명령 및 시작에서 프로젝트를 선택하고 `Get-Location` 저장·실행 | 표시한 로컬 폴더에서 새 Shell이 열린다. 프로젝트 시작 자동 실행은 켠 뒤 프로젝트 클릭 시 앱 실행당 한 번 실행된다. |
| 4 | 일반 → 완료/벨/집중 중 억제, 알림 테스트 | 선택한 소리·Windows 알림을 시험할 수 있다. 실제 작업 완료와 벨은 저장한 조건을 따른다. |
| 5 | 일반 → 절전 방지 ‘작업 중’ | 확인된 작업이 있을 때 활성, 모든 작업 완료·취소·종료 시 해제로 바뀐다. |
| 6 | 상태 표시줄에서 제공자, 사용/남은 비율, 리소스·포트 선택 | 하단과 상세 한도 비율이 일치하고 다른 창에도 반영된다. |
| 7 | 유휴 세션 자동 중지 5분을 켜고 완료된 로컬 세션의 화면을 떠남 | 최근 입력·출력·화면 사용 이후 5분이 지나면 복원 가능한 세션만 파란 대기로 전환한다. 클릭 시 원래 계정·대화·실행 옵션으로 재개한다. |

유휴 자동 중지와 프로젝트 시작 자동 실행은 기본적으로 꺼져 있다.
저장 명령 예시는 로컬 PowerShell 기준이며 SSH 명령은 해당 원격 셸의 문법을 사용한다.

## 완료한 자동 검증

1.8.0.15 소스에서 다음 검증을 통과했다. 실행 명령의 기준 디렉터리는 `app/`다.

| 명령 | 확인 결과 |
|---|---|
| `npm test` | 102개 파일, 583개 테스트 통과 |
| `npm run build` | TypeScript 검사와 프런트엔드 빌드 통과 |
| `npm run electron:settings-search-smoke` | 105개 검색 대상, 세 창 크기, 명령·알림·유휴 편집, 상태 표시줄과 창 간 동기화 |
| `npm run electron:bridge-smoke` | 실제 IPC·브라우저·로컬 셸·OS 절전 blocker, 유휴 PTY 중지와 정확한 대화 조회 |
| `npm run electron:browser-profiles-smoke` | 두 Electron 프로세스 사이 쿠키 격리와 탭·프로필 복원 |
| `npm run electron:terminal-settings-smoke` | ANSI 색상 보존, 설정·창 간 동기화, 유휴 대기 버튼의 재개 요청과 복원 실패 보호 |
| `npm run electron:advanced-launch-smoke` | 고급 실행 설정 편집·동기화·복원과 실제 PTY 인수 전달 |
| `npm run electron:account-onboarding-smoke` | 계정 등록 흐름·실패 처리·창 간 동기화·화면 배치 |
| `npm run electron:lifecycle-smoke` | 앱 종료, 트레이 유지와 런타임 보안 경계 |

실계정 로그인, 실제 SSH 호스트, 장시간 제공자 작업, 사용자의 소리·배너 체감은 사용자
확인 대상으로 남긴다. 자동 검증에 사용한 대화 파일·훅 상태·로그인 결과는 격리된
테스트 데이터다. 소스 검증 결과를 설치본·실계정 검증 완료로 해석하지 않는다.
