---
type: Release
title: Acedia 1.8.1.93
status: prepared
last_updated: 2026-10-23
---

# Acedia 1.8.1.93

- 휴대폰·폴드·패드를 **채팅 전용**으로 정리하고 상단 Chat/Terminal/Browser 탭을 제거했다. 넓은 터치 화면이나 APK에서도 채팅을 유지하며, 저장된 PC 모드 선택은 보존한다.
- 입력창을 전체 폭으로 넓히고 첨부·모델·예약·전송을 아래 한 줄에 배치했다. 알림·이름 변경·개인 메모·작업 분담은 **⋯** 메뉴에서 연다. 주요 터치 버튼은 44px, 대화와 입력 글자는 16px를 유지한다.
- 접힌 폴드는 메뉴형 세션 목록, 넓은 패드는 세션 목록과 대화를 나란히 표시한다. 펼침·회전 후에도 선택한 세션과 작성 중 초안을 유지하고, 큰 화면의 대화 폭을 제한해 읽기 편하게 했다.
- **설정 → 에이전트 → 도구 → Dangerous 모드 기본값**에서 **기본 켜짐 / 기본 꺼짐 / 이전 선택 기억**을 선택한다. 고정한 기본값이 마지막 생성 선택보다 우선하며, 새 세션·자식 세션·새 프로젝트 첫 세션에 같은 기준을 적용한다. 생성창에서 이번 세션만 다르게 고를 수 있다.

Standard EXE 호스트 업데이트다. 모바일 화면은 Remote·Dashboard·APK가 공통으로 받는 웹 소스이며, 호스트를 업데이트한 뒤 반영된다. 번들 APK는 기존 서명 검증본 **1.8.1.39/code 21**을 재사용하며 새 APK를 생성하거나 다시 서명하지 않는다.

## English

- Make phones, foldables and tablets chat-only and remove the Chat/Terminal/Browser tabs. Wide touchscreens and the native APK remain in chat while preserving the desktop's saved mode.
- Use a full-width message field with attachment, model, delivery mode and Send below it. Move secondary actions into **More**, retain 44px primary touch targets and 16px conversation/input text.
- Keep the selected session and draft across folding and rotation. Use a navigation drawer on narrow screens and a sidebar on wide tablets, with bounded conversation width for readability.
- Add per-tool **On by default / Off by default / Remember last choice** for Dangerous mode. Apply fixed defaults before remembered choices to new sessions, child sessions and a new project's first session, while allowing individual creation overrides.

This Standard EXE updates the shared web UI delivered to Remote, Dashboard and the Android WebView. It reuses the existing signed Android **1.8.1.39/code 21** artifact; no new APK is built or signed.

## 검증

- PC 전체 **206개 파일·1,572개 검사** 확인. 최초 실행은 205개 파일이 통과했고, Git이 PATH에 없어 배포 자동화 테스트 6개가 실행에 실패했다. 프로세스 PATH에 저장소의 MinGit을 지정한 뒤 해당 파일 **19개 검사**를 다시 실행해 모두 통과했다. `output/exe-93-tests.log`, `output/exe-93-store-unit-recheck.log`.
- PC 전체 npm audit **0개**, 모바일 **24개 검사**와 TypeScript 검사 통과. `output/exe-93-mobile-check.log`. Store 관련 검사는 모의 API를 쓰는 단위 검사이며 Store 제출은 실행하지 않는다.
- Dangerous 기본값 관련 **36개 단위 검사**, 실제 Electron 설정 저장·생성·재로딩과 **18개 생성 화면 조합**, 설정 검색 **121개 항목** 검증을 통과했다.
- 공용 웹·서버 **68개 검사**, Remote·Dashboard의 320/360/390/430px 입력·메뉴·키보드 높이 모사·모델·파일 미리보기·큐 검사와 PC 터미널 검사 통과.
- 폴드 344×882·768×920, 패드 820×1180·1180×820·1366×1024 CSS-pixel 화면 검증 통과. 오래된 터미널 선택이 있어도 채팅으로 열고, 터치 화면에서 터미널 스트림을 열지 않는지 확인했다. 펼침·회전 후 초안 보존과 PC 모드 복원도 확인했다. 실제 UI 캡처와 비교 HTML은 `output/mobile-chat-device-review/`에 생성한다.
- 위 화면 검사는 독립 프로필·검증용 대화·Chromium 터치 및 viewport 모사 결과다. 실물 휴대폰·폴드·패드 설치나 물리 키보드·네이티브 인증 검증을 대신하지 않는다.
- TypeScript·Vite production build 통과. 고정 소스의 NSIS 생성, packaged 검사와 공개 다운로드 검증 결과는 배포 기록에 추가한다.
