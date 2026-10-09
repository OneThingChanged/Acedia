---
type: Release
title: Acedia 1.8.1.73
description: "완료 배지·Windows 알림 개선과 Tab으로 선택하는 채팅 후속 메시지 전송."
status: candidate
last_updated: 2026-10-09
---

# Acedia 1.8.1.73

## 변경 내용

- 사이드바에 **체크 아이콘과 완료 배지**를 표시하고 미확인 완료 행을 초록색으로 강조한다. 세 번만 테두리가 깜박인 뒤 표시를 유지하며, 휴면·프로세스 종료 후에도 읽거나 새 작업을 시작할 때까지 남긴다. 분할 화면별 색과 제공자 로고를 유지한다.
- **Windows 알림과 작업표시줄 표시**를 수정했다. 저장된 집중 억제 정책을 적용하고, 창이 비활성일 때의 작업표시줄 요청을 팝업 설정과 분리한다. 초점을 받으면 깜박임을 해제하며 연속 완료 이벤트는 중복 알림을 만들지 않는다. 알림 센터에서 클릭할 수 있도록 네이티브 객체를 유지하고 실제 표시·실패·시간 초과를 알림 테스트에 반영한다.
- 채팅 입력창에서 **Tab으로 중간 지시 / 완료 후 예약**을 선택하고 Enter로 전송한다. 버튼 클릭으로도 바꿀 수 있으며 기본값은 완료 후 예약이다. 작업이 끝나면 지금 전송 / 순서대로 전송으로 표시한다. 작업 중 지시를 보내도 진행 시간은 유지된다.
- 입력 간격 제한 중 보낸 중간 지시는 예약 메시지보다 먼저 전달하고, 완료 후 예약은 실제 완료 후 순서대로 보낸다. 대화별 초안·예약 목록·선택을 유지한다. 질문·시작 확인·모델 변경 보호, 자동완성, Shift+Tab 초점 이동과 한글 조합 입력을 보존한다.

사용 방법: [워크스페이스 동작](workspace-interactions.md).
기존 서명 APK **1.8.1.39/code 21**을 포함하는 EXE 업데이트다.

## English

- Make unread completion visible with a checkmarked Done badge, green row emphasis and three bounded pulses. Keep it through sleeping or process exit until reading or new work, while preserving screen colors and provider logos.
- Fix Windows notification focus policy, independent unfocused taskbar attention and focus clearing. Deduplicate completion bursts, retain native notifications for notification-center clicks and report actual show, failure or timeout results.
- Use Tab or the delivery button to choose current-work steering or a follow-up after completion, then Enter to submit. Keep completion reservations as the default, preserve work timers and prioritize pending steers during input cooldown. Preserve per-conversation drafts, queues and selection, question/startup/model guards, autocomplete, Shift+Tab focus and IME input.

## 검증

- 최종 기능 소스의 전체 **181개 파일·1,247개 검사**를 통과했다. 완료 개선의 첫 실행에서 이전 점 CSS를 기대하던 UI 단언 1개가 실패하여 새 배지의 표시·접근성 단언으로 수정했고, 해당 24개와 이후 전체 재검사를 모두 통과했다.
- 실제 App의 다크·라이트 사이드바에서 완료·읽음·새 작업·휴면·종료, 연속 훅, 집중 정책·음소거·소유 창, 알림 테스트와 기존 스크린/검색/프로젝트 동작을 확인했다. 실제 Windows 무음 알림의 `show` 이벤트와 main 작업표시줄 호출·초점 해제를 확인했다. 숨김 창 검사는 사용자가 실제 배너나 깜박임을 봤는지까지 검증하지 않는다.
- 실제 Chat 렌더러에서 Codex·Claude 전송 경로, Tab·Enter·Shift+Tab·IME·자동완성, 예약 순서·취소·대화별 복원, 질문 보호와 **1024·420·320px** 다크·라이트 배치를 검증했다. Desktop·Remote 질문/미디어/작업 표시와 모델·App 설정 회귀 검사도 통과했다.
- 설치된 **Codex 0.162.0**의 격리 CLI와 로컬 응답 fixture로, 응답 생성 중 보낸 중간 지시가 같은 작업에서 소비되고 완료 후 메시지는 다음 작업으로 시작함을 검증했다. 외부 모델 요청은 사용하지 않았다. Claude 네이티브 소비 시점은 이 실행으로 검증하지 않았으며 앱 전송 경로만 확인했다.
- TypeScript·Vite 프로덕션 빌드를 통과했다. 기존 큰 번들 경고는 유지된다.
- 제품 버전과 Android 소스 versionName은 **1.8.1.73**, npm은 **1.8.1**이다. 새 APK를 만들지 않아 기존 서명 APK **1.8.1.39/code 21**을 재사용한다.
- 버전 갱신 후 배포 대상의 전체 **181개 파일·1,247개 검사**와 모바일 **24개 검사**를 모두 통과했다. 실패·건너뛴 검사는 없다.

기능 증빙: `output/chat-delivery-full-tests.log`,
`output/sidebar-completion-notification-smoke.log`, `output/notification-native-smoke.log`,
`output/sidebar-workspace-app/sidebar-completion-dark.png`,
`output/sidebar-workspace-app/sidebar-completion-light.png`,
`output/chat-delivery-ui-smoke.log`, `output/chat-steering-native-smoke.log`,
`output/chat-delivery-question-regression.log`, `output/chat-delivery-model-regression.log`,
`output/chat-delivery-mode-build.log`, `output/full-suite-exe-1.8.1.73.log`,
`output/mobile-tests-exe-1.8.1.73.log`.

## 공개 배포

소스·문서 검증을 완료했다. 고정 소스의 EXE 빌드·packaged 실행/종료 검사와
설치 파일 검증 후 GitHub 안정 릴리스에 게시하고 공개 다운로드 결과를 기록한다.
사용자의 실행 중인 앱과 프로필은 배포 검증에 사용하지 않는다.
