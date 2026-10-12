---
type: Release
title: Acedia 1.8.1.78
description: "Fast 상태에서 터미널로 변경한 모델·effort가 재개 시 이전 설정으로 돌아가는 오류 수정."
status: review
last_updated: 2026-10-12
---

# Acedia 1.8.1.78

## 변경 내용

- 터미널에서 **Sol / xhigh**로 변경하고 닫았다 다시 열었을 때 이전 **Luna / max**가 복원되는 오류를 수정했다. 상태줄의 `xhigh fast`처럼 effort 바로 뒤에 붙는 Fast·Ultrafast·Standard 표시를 읽는다.
- 분산 세션의 이전 native 모델 정보보다 **새로 변경된 상태줄**을 우선해 저장한다. 이후 선택창 등으로 상태줄이 가려져도 최신 선택을 유지한다. 새 설정 알림 직후 잠깐 남아 있는 이전 화면은 저장값을 되돌리지 않는다.
- native 서비스 티어 `priority`가 화면에서 `fast`로 표시될 때 확인된 티어를 유지한다. 같은 대화·계정의 모델·effort·Fast 복원과 다음 시작에 저장한 선택을 보존한다.

사용 방법과 검증 범위: [세션별 모델 설정](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.78/docs/agent-launch-options.md#세션별-마지막-실행-설정).
기존 서명 APK **1.8.1.39/code 21**을 포함하는 Standard EXE 업데이트다.

## English

- Fix terminal model and effort changes reverting from **Sol / xhigh** to an older **Luna / max** choice after closing and resuming a session. Recognize Fast, Ultrafast and Standard displayed directly after the effort value.
- Remember a newly changed native footer ahead of an older routed thread snapshot. Keep that selection when the footer is hidden, while preventing a stale TUI repaint from undoing a newly received settings notification.
- Preserve the confirmed native `priority` tier when the TUI labels it `fast`, along with the same conversation, account and pending launch selection.

## 검증

- 관련 **4개 파일·109개 검사**를 통과했다.
- 설치된 Codex **0.162.1**에서 **Luna / max / Fast → `/model`로 Sol / xhigh / Fast 선택 → 추가 메시지 없이 휴면 → 저장 파일 재로드 → 같은 대화 재개**를 확인했다. 재개한 실제 상태줄과 loopback 서버 요청의 모델·effort·서비스 티어도 확인했다.
- 기존 일반 모델·effort 복원, 명시적 선택과 Fast/Off 인수의 native 검증도 재실행해 통과했다. 격리 프로필과 합성 인증 정보만 사용한다.
- 제품과 Android 소스 버전은 **1.8.1.78**, npm 호환 버전은 **1.8.1**이다. 포함하는 기존 APK는 **1.8.1.39/code 21**이다.
- 배포 전 전체 **188개 파일·1,363개 검사**를 통과했다. 버전·APK 계약 검사도 이 전체 검사에 포함한다. 빌드·packaged 및 공개 다운로드 결과는 완료 후 기록한다.

기능 검증 증빙: `output/model-inline-fast-regression.log`, `output/model-inline-fast-native.log`,
`output/model-settings-native-regression.log`, `output/session-settings-cli/profile-o9xZfV/passed.json`.

배포 전 전체 검사 증빙: `output/full-suite-exe-1.8.1.78.log`.
