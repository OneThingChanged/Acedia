---
type: Feature
title: 유휴 세션 자동 중지와 복원
description: 완료된 로컬 세션의 안전한 유휴 중지와 원래 계정·대화 복원.
status: stable
sources:
  - resource: ../app/electron/services/idle-session-policy.mjs
  - resource: ../app/electron/services/idle-session-smoke.mjs
  - resource: ../app/electron/services/session-service.mjs
  - resource: ../app/src/components/IdleSessionsPanel.tsx
  - resource: ../app/src/lib/idleSessions.ts
  - resource: ../app/src/lib/spawn.ts
  - resource: ../app/scripts/electron-terminal-settings-smoke.mjs
---

# 유휴 세션 자동 중지와 복원

설정 → 유휴 세션에서 자동 중지와 시간을 선택한 뒤 저장한다. 기본값은 꺼짐·30분이며
5·15·30·60·120분을 선택할 수 있다. 동일 앱 프로필의 창들이 설정을 공유하고 오래된
창의 저장을 거부한다. 소유 작업창이 열려 있을 때 약 10초마다 검사한다.

## 중지 조건

다음 조건을 모두 충족해야 한다.

* 로컬 Codex 또는 Claude의 실제 PTY가 있으며 마지막 확인된 훅이 완료다.
* 입력·출력·화면 사용과 완료 이후 설정한 시간이 지났다. 권한·응답 대기와 차단 상태는 제외한다.
* 현재 화면의 그룹에 없고 연결된 터미널 뷰도 없다. 가시성 정보가 오래되거나 소유 창이 없으면 제외한다.
* 같은 계정의 대화 파일에서 정확한 대화 ID와 프로젝트 폴더를 다시 확인할 수 있다.
* 대화 검사 이후에도 같은 프로세스·소유 창·완료 상태·입출력 시점·설정·가시성이 유지된다.

SSH, 일반 Shell, 시작 중인 세션, 훅이 없거나 복원이 불확실한 세션은 자동 중지하지 않는다.
취소 훅만 있는 세션도 완료로 추정하지 않는다. 모든 검사를 통과하면 앱이 소유한 해당 PTY에
기존 sleep 동작을 적용한다. 원격 호스트나 프로세스 이름 전체에 종료를 요청하지 않는다.

## 복원

중지된 세션은 파란 대기 상태와 자동 중지 안내를 표시한다. 계정, 대화 ID, CLI 경로,
인수·환경변수, 권한·작업자 설정을 보존하며 렌더러의 화면 이력도 저장한다.
세션을 클릭하면 기존 실행 경로에서 같은 대화를 다시 확인한 후 재개한다.
파일 삭제·계정 불일치·복원 실패 시 다른 대화를 대신 실행하지 않고 오류를 표시한다.
실행 설정에서 사용자가 명시적으로 계정을 변경하면 새 계정의 대화 선택 규칙을 따른다.

일반 세션을 수동 비활성화하는 동작과 자동 중지의 복원 표식은 구분한다.
자동 중지 설정을 끄는 것만으로 이미 중지한 세션을 실행하지 않는다.

## 검증

정상 중지와 중복 요청, 작업·대기·차단·SSH·Shell·전경·입출력·시작·소유권·복원 부재 제외를
검증했다. 대화 검사 도중 입력·훅·설정·프로세스·소유 창·화면이 바뀌면 중지를 취소한다.
숨김 Electron의 실제 IPC·ConPTY에서 화면 보호와 중지, 지정 계정 대화 조회 및 파일 삭제 후
복원 거부를 확인했다. 실제 PaneSlot의 대기 버튼에서 계정·대화·고급 실행 옵션을 보존한
재개 요청과 대화 부재 시 프로세스 생성 거부를 확인했다.

이 검증은 임시 대화 파일과 셸, 주입한 완료 상태를 사용한다. 실제 제공자 계정의 장시간
작업과 CLI 대화 재개 결과는 사용자 확인 대상이다.

검증 명령: `npm test`, `npm run build`, `npm run electron:bridge-smoke`,
`npm run electron:terminal-settings-smoke`, `npm run electron:settings-search-smoke` (`app/`).
