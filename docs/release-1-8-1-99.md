---
type: Release
title: Acedia 1.8.1.99
status: preparing
last_updated: 2026-10-30
---

# Acedia 1.8.1.99

- API로 만든 로컬 Codex의 전용 작업 폴더가 프로젝트 밖에 있어도 해당 폴더 범위의 `Trust and continue`를 자동 확인한다. 프로젝트 안의 자식은 공유 Git 루트를 포함한 기존 범위를 유지한다. 더 넓은 외부 Git 루트·훅·명령 승인·사용자 질문은 자동 승인하지 않는다.
- `acedia_session_message_send`로 대화 ID가 아직 없는 새 세션에 첫 알림을 보낼 수 있다. 새 실행·빈 입력창·이전 채팅 입력 없음과 실제 알림 수신·새 턴 증거를 확인해 대화 ID를 연결한다. 기존 대화 재개와 작업 분담 세션의 생성·모델 검증 조건은 유지한다.
- 터미널의 커서·장치·포커스 자동 응답과 시작 메뉴 선택을 채팅 입력과 구분한다. 입력했다가 지운 초안과 메뉴에 붙여 넣은 채팅 본문은 새 세션으로 오인하지 않으며 중복·불확실한 알림을 자동 재전송하지 않는다.

Standard EXE 업데이트다. 기존 서명 검증 Android **1.8.1.39/code 21**을 재사용한다.

## English

- Automatically confirm Folder access for an API-created local Codex session's explicit dedicated working folder, even outside its project. Retain the existing project scope for children within it. Do not approve broader external Git roots, hooks, commands or user questions.
- Allow `acedia_session_message_send` to notify a pristine new launch before a conversation ID exists. Verify its empty composer and absence of previous chat input, then bind the ID only from the exact notification's receipt and new turn. Preserve resumed-conversation checks and managed workers' creation and model gates.
- Distinguish terminal cursor/device/focus reports and native startup-menu choices from chat input. Reject previously typed drafts and chat text pasted into a startup menu. Keep notification deduplication and uncertain-delivery handling.

This Standard EXE reuses the existing signed Android **1.8.1.39/code 21** artifact.

## 검증

- 완료한 전체 **214개 파일·1,704개 검사**를 재사용했다. 이후 입력 경계 보완은 관련 **8개 파일·125개 검사**와 최종 **2개 파일·25개 검사**를 통과했다. 전체 실행 이후 추가한 2개 입력 경계 검사까지 검증했으며 1,706개를 한 번에 실행한 것으로 표기하지 않는다. `output/session-startup-first-message/tests-full.log`, `tests-final-targeted.log`, `tests-input-final.log`.
- 설치 Codex **0.164.0**과 임시 프로필·가짜 인증·loopback 응답으로 프로젝트 밖 전용 폴더 Trust 1회 확인 → 대화 ID 없는 첫 알림 → 정확한 첫 턴·대화 연결 → 한글 수신·답장·중복 방지를 확인했다. 기존 대화 재개 후 직접 전달도 통과했다. `native-first-message-receipt.log`, `native-resume.log`.
- 실제 Electron main/coordinator에서 API 프로젝트 첫 세션과 프로젝트 밖 전용 폴더 세션의 자동 Trust, 프로젝트 옵션 꺼짐 유지, 창 활성화 0회·선택·포커스·초안 보존을 확인했다. `electron-external-trust.log`. 초기 fixture·대기 조정 전 기록도 같은 폴더에 보존한다.
- 변경된 런타임·검증 스크립트의 Node 문법 검사와 Git diff 검사를 통과했다. 실제 사용자 세션에는 시험 입력하지 않았다.

배포용 검사·빌드·설치 파일·공개 다운로드의 실제 결과는 게시 기록과 함께 갱신한다.

## 배포 기록

게시 전이다. Microsoft Store·Company·새 APK 빌드와 사용자 앱 설치·재시작은 이번 범위에 포함하지 않는다.
