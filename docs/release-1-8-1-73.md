---
type: Release
title: Acedia 1.8.1.73
description: "완료 배지·Windows 알림 개선과 Tab으로 선택하는 채팅 후속 메시지 전송."
status: stable
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
- origin/main에 푸시한 고정 소스 `bfc98fd0968dc2d64411dc3ce63586d5d42b2306`에서 TypeScript·Vite·NSIS EXE 빌드를 통과했다. 이전 빌드와 분리된 출력 폴더 및 격리 프로필로 packaged Git query·bridge·문서 브라우저 재사용·Dashboard·Windows 알림 정책·종료/트레이/보안 lifecycle 검사를 통과했다.
- 패키지의 런타임·렌더러 **281개 파일**이 빌드 원본과 일치한다. 설치 파일의 FileVersion **1.8.1.73**, npm 호환 ProductVersion **1.8.1**, manifest·크기·SHA-256 및 포함된 APK의 패키지·아키텍처·서명 인증서·해시를 확인했다. EXE Authenticode는 기존 채널과 같은 `NotSigned`다.
- packaged smoke에는 이전 릴리스와 같은 `AttachConsole failed` 진단 8개가 출력됐다. Git·문서 브라우저·bridge·Dashboard 성공 marker와 프로세스 종료 코드 0을 확인했다.
- 공개 업데이터가 **1.8.1.70·1.8.1.71·1.8.1.72 → 1.8.1.73**을 감지한다. 실제 공개 설치 파일 전체 다운로드와 세 자산의 크기·SHA-256, 태그·고정 소스·latest 안정 릴리스 검증을 통과했다. 1.8.1.71은 공개되지 않은 호환 버전으로 검사했다.

기능 증빙: `output/chat-delivery-full-tests.log`,
`output/sidebar-completion-notification-smoke.log`, `output/notification-native-smoke.log`,
`output/sidebar-workspace-app/sidebar-completion-dark.png`,
`output/sidebar-workspace-app/sidebar-completion-light.png`,
`output/chat-delivery-ui-smoke.log`, `output/chat-steering-native-smoke.log`,
`output/chat-delivery-question-regression.log`, `output/chat-delivery-model-regression.log`,
`output/chat-delivery-mode-build.log`, `output/full-suite-exe-1.8.1.73.log`,
`output/mobile-tests-exe-1.8.1.73.log`, `output/build-frontend-1.8.1.73.log`,
`output/build-exe-1.8.1.73-isolated.log`, `output/mobile-artifact-1.8.1.73.log`,
`output/packaged-smoke-1.8.1.73.log`, `output/packaged-lifecycle-1.8.1.73.log`,
`output/exe-release-1.8.1.73/local-verification.json`,
`output/public-update-verification-1.8.1.73.log`,
`output/public-update-installed-1.8.1.70-to-73.log`, `.build-tools/public-verified-1.8.1.73.json`.

## 공개 배포

- [GitHub 안정 릴리스 v1.8.1.73](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.73)을 2026-10-09 **23:32:27 KST**에 게시했다.
- 소스·태그는 `bfc98fd0968dc2d64411dc3ce63586d5d42b2306`이다. 설치 파일은 origin/main에 푸시한 이 고정 소스에서 만들었다. 기존 서명 APK를 포함하는 EXE 배포이며 Microsoft Store 제출·새 APK 빌드는 실행하지 않았다.
- **23:33:08 KST**에 공개 다운로드·업데이트 검증을 완료했다. 설치 파일을 실행하지 않았으며 사용자의 실행 중인 앱과 프로필은 검증에 사용하지 않았다. 사용자 PC의 설치·업데이트 여부는 별도다. 앱 설정의 Check → Update로 적용한다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.73-x64.exe` | 151332226 | `0b2d0237ff35ff94dc390308577e17c03ef3306c0d92c4fc33f5abe7a2e01038` |
| `Acedia-Setup-1.8.1.73-x64.exe.blockmap` | 159367 | `688f3eb765b396e9beb1ca22acdb0b53a62adb0820a1511701e1a745ceebc664` |
| `latest-exe.json` | 256 | `99c6cce8ab9dc8d8bed537adee758bea2efcf928b49e64a7cb438f10e6302063` |
