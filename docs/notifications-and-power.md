---
type: Feature
title: 알림 조건과 절전 방지
description: 질문·완료·터미널 벨 알림, 세션별 알림 설정과 작업 상태에 따른 시스템 절전 방지.
status: stable
sources:
  - resource: ../app/src/components/NotificationPolicyPanel.tsx
  - resource: ../app/electron/services/notification-policy.mjs
  - resource: ../app/electron/services/notification-policy-smoke.mjs
  - resource: ../app/electron/services/native-notifications.mjs
  - resource: ../app/electron/services/native-notifications.test.mjs
  - resource: ../app/scripts/electron-notifications-smoke.mjs
  - resource: ../app/src/components/CompletionBadge.tsx
  - resource: ../app/src/hooks/useAttentionState.ts
  - resource: ../app/scripts/electron-sidebar-workspace-smoke.mjs
  - resource: ../app/electron/services/terminal-session-service.mjs
  - resource: ../app/electron/services/session-notifications.mjs
  - resource: ../app/electron/services/active-questions.mjs
  - resource: ../app/electron/services/codex-capacity-retry.mjs
  - resource: ../app/src/components/CapacityRetryNotice.tsx
  - resource: ../app/scripts/codex-capacity-retry-smoke.mjs
  - resource: ../app/electron/services/question-responder.mjs
  - resource: ../app/src/App.tsx
---

# 알림 조건과 절전 방지

설정 → 일반의 ‘알림 조건과 절전’에서 편집한 뒤 저장한다. 질문과 완료 알림은 기본 켬,
터미널 벨과 앱 집중 중 억제는 기본 끔이다. 소리와 Windows 알림의 종류는 기존 설정을
사용한다. 조건은 앱 프로필에 저장하며 모든 작업창이 공유하고 오래된 창의 저장은 거부한다.

집중 중 억제는 해당 세션을 소유한 작업창에 초점이 있을 때 소리·앱 팝업·Windows 알림을 억제한다.
완료 상태와 사이드바의 미확인 표시는 유지한다. 세션 소유 창만 알림을 처리해 중복을 막는다.
집중 중 억제를 끄면 초점 여부와 관계없이 저장된 Windows 알림 설정을 따른다. 모바일 질문·완료 푸시에도
전역 질문·완료 설정과 세션별 음소거를 적용한다. 원격 접속 요청은 별도다.
‘알림 테스트’는 조건을 우회해 선택한 소리·Windows 알림을 시험한다. 실제 네이티브
`show` 이벤트를 받은 후 전송 성공을 표시한다. `failed` 이벤트, 미지원, 5초 내 확인되지
않은 전송은 오류를 표시하며 Windows 알림이 꺼진 경우 그 설정을 안내한다.

## 완료 표시와 Windows 작업표시줄

미확인 완료는 최근 대화·검색 결과·펼친 프로젝트·세션 선택 목록에서 **✓ 완료 / Done**
배지로 표시한다. 최근 대화 행은 초록색 배경과 테두리를 사용하고 테두리만 3회 부드럽게
깜박인 후 멈춘다. 동작 줄이기 설정에서는 깜박임을 생략한다. 스크린별 색상과 S 번호,
작업 상태 점은 각각 유지하며 밝은 테마에서는 완료 표시의 초록색을 진하게 조정한다.

완료 표시는 세션을 선택하거나 알림 센터에서 읽음 처리할 때, 또는 새 작업을 시작할 때
해제한다. 휴면 전환·PTY 종료만으로 해제하지 않으며 저장된 미확인 기록은 앱 재실행에도
유지한다. 세션 삭제 및 알림 기록의 기존 최대 100개 제한은 그대로 적용한다.

알림 조건이 허용한 세션 소유 창에 초점이 없으면 Windows 작업표시줄에 `flashFrame`을
요청한다. Windows 팝업을 끄더라도 작업표시줄 주의 표시는 작동하고, 앱에 초점이 돌아오면
해제한다. 요청 중 초점이 바뀐 경우에도 활성 창을 새로 깜박이지 않는다. 창을 강제로
활성화하지 않는다. 세션 음소거·전역 완료/질문 조건·소유 창 판정은 그대로 적용한다.

Windows 알림 객체는 클릭 처리를 위해 최대 1시간 유지한다. 배너 표시 시간이 끝나도
알림 센터 클릭을 받을 수 있게 유지하며 클릭·사용자 닫기·전송 실패 시 정리한다.
알림별 고유 키를 사용하여 같은 이름의 세션이나 여러 완료 알림의 클릭이 충돌하지 않는다.

### 2026-10-09 원인 분석과 소스 검증

기존 사이드바 스타일이 완료 애니메이션을 끄고 점을 5px로 축소했다. 미확인 목록도
실행 중인 세션으로 제한하여 휴면·종료하면 완료 표시가 사라졌다. Windows 알림은
저장된 집중 억제 설정과 별개로 활성 창에서 항상 차단되었고, 작업표시줄 깜박임도
Windows 팝업 설정에 묶여 있었다. 네이티브 전송은 `show()` 호출만으로 성공을 반환하고
오류를 삼켰다. 연속 훅의 상태 반영 지연은 완료 알림 누락·중복도 유발할 수 있었다.

개발 PC의 Standard AUMID `com.jintae.multiagent.electron`에 대한 Windows 알림 상태는
읽기 전용 검사에서 `Enabled`였다. 당시 실행 중인 설치본은 1.8.1.70이다. 이번 수정은
[1.8.1.73 EXE 배포](release-1-8-1-73.md)에 포함한다. 사용자의 설치·업데이트 여부는 별도다.

격리 프로필의 실제 App 화면에서 연속 working/done/done 알림 1회, 휴면·종료 후 배지 유지,
읽음·새 작업 해제, 집중 정책, Windows 팝업과 독립적인 작업표시줄 요청, 음소거·소유 창
중복 방지, 알림 테스트 실패/성공 안내를 확인했다. 밝은/어두운 테마의 완료 화면과 기존
사이드바 상호작용·1280/800px 레이아웃도 통과했다. 숨김 Electron은 실제 main 처리기와
네이티브 flash API의 호출·초점 해제를 확인했고, 무음 테스트 알림의 Windows `show`
이벤트를 수신했다. 숨김 창 테스트는 작업표시줄의 시각적 깜박임이나 사용자가 실제로
배너를 봤는지까지 확인하는 검사는 아니다. TypeScript/Vite 빌드와 관련 24개 테스트가
통과했다. 전체 검사 181개 파일/1,247개 중 1,246개가 첫 실행에서 통과했고, 이전 완료 점의
CSS 클래스를 기대하던 UI 단언 1개는 새 배지의 표시·접근성 검증으로 갱신했다. 해당 파일과
알림 상태 파일의 24개 테스트 재검사도 통과하여 전체 대상의 검증을 완료했다.
이후 Chat 후속 전송 방식 수정까지 포함한 전체 재검사도 181개 파일/1,247개 모두 통과했다
(`output/chat-delivery-full-tests.log`).
검증 로그는 `output/sidebar-completion-notification-smoke.log`,
`output/notification-native-smoke.log`, `output/completion-notification-tests.log`,
`output/completion-notification-full-tests.log`, `output/completion-notification-sidebar-tests.log`에 있다.

네이티브 동작의 기준은 [Electron Notification](https://www.electronjs.org/docs/latest/api/notification)과
[Windows taskbar](https://www.electronjs.org/docs/latest/tutorial/windows-taskbar) 문서다.

## 세션 알림과 상단 도구

세션 상단은 복구, 알림, 작업자, Chat/터미널 전환 순서의 아이콘을 사용한다.
마우스를 올리거나 키보드로 포커스를 옮기면 설명이 나타난다. 작업자는 Codex 세션에서만 표시한다.
복구 아이콘은 기존의 복구 확인 패널을 연다.

종 아이콘은 해당 세션의 알림을 켜고 끈다. 기본값은 켬이다. 끄면 질문·완료·벨의
소리와 팝업, 모바일 질문·완료 알림을 억제한다. 화면의 상태 표시와 알림 센터 기록은 유지한다.
설정은 앱 프로필의 `session-notifications.json`에 세션별로 저장하고 재실행 시 복원한다.
다른 작업창과 Dashboard/Remote는 같은 설정을 공유한다. 다른 기기의 오래된 저장 요청은 거부한다.

## Question 답변 대기

Codex의 동기 `request_user_input`과 Claude 질문을 Cyan의 `Question · 답변 대기`로 표시한다.
탭, 사이드바, Chat, Dashboard/Remote 세션 및 상태별 보드에 적용한다. 질문을 기다리는 동안
작업 스피너를 멈추고 새 메시지는 대기열에 넣는다. 답변 후 CLI가 질문을 처리하면 상태를 해제한다.
비동기 `request_user_input_async`는 실행을 멈추지 않으므로 대기 상태로 분류하지 않는다.
새 비동기 질문도 폰의 응답 필요 알림으로 전달한다. 작업 상태를 바꾸는 대기 훅과 분리하며,
대화·질문 call ID로 한 번만 알린다. 부분 답변과 다른 질문 폼을 오가도 같은 질문을
다시 알리지 않는다. 전역 질문 알림과 세션 음소거는 그대로 적용한다.
1.8.1.53에서는 채팅 갱신만 호출해 폰 전송이 누락됐고 1.8.1.54에서 수정했다.

질문 감시는 Chat 열기와 독립적으로 실행한다. 실행 중이며 계정·세션에 연결된 transcript만
1.5초 간격으로 확인한다. 파일이 바뀐 경우 최대 256 KiB의 끝부분을 비동기로 읽고,
질문 call ID와 해당 결과를 추적한다. 휴면 기록 전체를 읽거나 카탈로그를 다시 스캔하지 않는다.

Codex의 식별 가능한 선택형 질문은 Chat에서 선택지와 설명을 보고 답할 수 있다.
여러 질문과 ‘직접 입력’(CLI 메모란에 맞춘 단일행)을 지원하며, 모든 답을 고른 뒤 ‘답변 보내기’를 눌러야 전송한다.
Electron의 공통 처리기가 세션·질문 ID와 실제 xterm 화면을 확인하여 원래 CLI 폼에 입력한다.
다른 창·기기의 중복 답변, 바뀐 질문, 일부만 전송된 답변의 재전송을 차단한다.
식별할 수 없는 폼, SSH 질문, 지원하지 않는 CLI 화면에서는 ‘터미널에서 답변’을 사용한다.

새 질문은 한 번만 알린다. 알림을 클릭하면 해당 세션의 Chat을 연다. 같은 질문을
훅과 transcript에서 모두 발견하거나 화면을 다시 연결해도 중복 팝업을 만들지 않는다.

터미널 벨은 실제 PTY 출력에서 감지하며 제목·링크용 OSC 문자열의 종료 문자는 제외한다.
같은 세션의 벨은 3초 간격으로 제한하고 저장된 화면 복원에서 다시 울리지 않는다.

## Codex 모델 용량 부족 재시도

로컬 Codex의 현재 턴이 `Selected model is at capacity. Please try a different model.` 또는
`server_overloaded` 오류로 종료되면 30초·60초·120초 간격으로 최대 3회 이어서 진행한다.
Codex 자체 재연결이 끝나고 턴 종료가 기록된 뒤 Acedia의 재시도가 시작된다. 기존 PTY와
대화·계정·모델·effort를 유지하고, 완료한 작업을 확인한 뒤 이어가라는 메시지를 보낸다.
실행한 도구나 사용자 요청 전체를 자동으로 재전송하지 않는다.

터미널과 Chat 상단에 대기 시간·횟수·취소 버튼을 표시하고 Dashboard/Remote에서도
진행 상황을 확인한다. 3회 후에도 실패하면 자동 재시도를 멈추고 세션에 경고를 남긴다.
데스크톱 알림 센터에도 기록하며, 소유 창의 팝업·소리·Windows 알림은 기존 응답 필요
알림 조건과 세션 음소거를 따른다. 이 실패 안내는 모바일 시스템 푸시로 전송하지 않는다.

사용자의 터미널 입력·메시지 전송·중단·세션 종료 및 재시작, 새 대화와 질문은 예약을
취소한다. 복원한 과거 실패와 채팅·도구 출력에 인용된 오류는 자동 재시도 대상이 아니다.
계정 한도·인증 오류·일반 네트워크 오류·SSH는 이 정책에 포함하지 않는다. 현재 대화와
실제 Codex 입력 화면을 확인할 수 없거나 전송 결과가 불확실하면 추가 입력 없이 안내한다.

검증: `codex-capacity-retry.test.mjs`와 완료·입력 처리 테스트, `electron:capacity-retry-smoke`
화면 검증, `ACEDIA_CODEX_BINARY`로 설치 CLI 경로를 지정한 `codex:capacity-retry-smoke`의
로컬 응답 fixture로 같은 모델·effort·계정·대화 유지, 성공 복구와 3회 실패 종료를 확인한다.

| 절전 방지 | 동작 |
|---|---|
| 끔 | 기본값. 앱이 요청한 절전 방지를 해제한다. |
| 작업 중 | 훅으로 확인한 작업·권한/응답 대기·차단 상태 동안 유지한다. 모든 작업의 완료·취소·PTY 종료 시 해제한다. |
| 항상 | 앱이 트레이에 남아 있는 동안에도 유지한다. 끔으로 변경하거나 앱 종료 시 해제한다. |

시스템 절전만 방지하며 화면 꺼짐은 허용한다. 훅이 없는 Shell 작업이나 상태를 알 수 없는
원격 작업은 작업 중 모드의 자동 감지 대상이 아니다. 패널은 실제 blocker 상태와 작업 수를
표시한다. 운영체제의 강제 절전·종료를 차단하는 기능은 아니다.

## 검증

1.8.1.46 배포 소스는 2026-10-03 기준 150개 파일의 957개 테스트와 프로덕션 빌드를 통과했다.
`electron-session-toolbar-smoke.mjs`에서 실제 PaneSlot의 아이콘·포커스/마우스 툴팁·세션 알림
토글·Chat 전환을 밝은/어두운 테마와 390/900px에서 확인했다.
`electron-chat-question-smoke.mjs`에서 데스크톱과 Remote 1024/390px의 질문·선택·직접 입력·전송 및 오류를 확인했다.
`codex-question-cli-smoke.mjs`는 격리 프로필과 모의 모델 서버로 설치된 Codex CLI 0.160.0을 실행한다.
단일/여러 질문을 Chat 열기 없이 transcript에서 감지하고, 선택지와 한국어 단일행 답변을
네이티브 폼으로 전송하여 원래 턴이 재개되는 과정 및 중복 제출 방지를 확인했다.

이전 검증에서는 95개 설정 검색 대상·세 창 크기의 UI 검증을 통과했다.
조건별 허용 여부, OSC/BEL 분리, 여러 작업의 완료·취소·종료 시 해제와 앱 종료 정리를
단위 테스트로 확인했다. 숨김 Electron의 실제 IPC와 운영체제 blocker를 사용해
항상/작업 중/해제와 저장 충돌·입력 거부를 확인했다. 컴퓨터를 실제로 재우거나 사용자에게
알림음을 재생하는 검증은 수행하지 않았다.
