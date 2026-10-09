---
type: Release
title: Acedia 1.8.1.70
description: "브라우저 작업 기본 백그라운드 처리, 화면·입력 포커스 유지, Chat Working 중복 수정."
status: draft
last_updated: 2026-10-09
---

# Acedia 1.8.1.70

## 변경 내용

- 브라우저 조사·자동화는 **기본적으로 백그라운드**에서 진행한다. 새 탭을 만들 때 우측 분할을 자동 추가하지 않으며, 예전 보조 스크립트의 배치 값도 자동 표시로 처리하지 않는다. **“옆에 열어줘”처럼 표시를 요청할 때만** 기존 탭을 화면에 연결하도록 MCP·스킬 안내를 맞췄다.
- 브라우저를 연결하거나 반복 표시해도 **현재 Screen·세션·입력 포커스**를 유지한다. 다른 Screen이나 창에 배치한 브라우저를 다시 이동하지 않는다. 숨겨진 탭에서도 정상 크기의 화면 캡처와 작업을 계속할 수 있다.
- Chat의 **Working 중복 표시**를 제거했다. 입력창 위의 상태 바 하나에서 현재 작업·경과 시간·작업 내역을 확인한다. 시작·복구·작업 중 질문과 완료 후 상태 전환을 유지한다.

사용 방법: [워크스페이스 동작](workspace-interactions.md).
기존 서명 APK **1.8.1.39/code 21**을 포함하는 EXE 업데이트다.

## English

- Run browser research and automation **in the background by default**, without automatically adding right-hand splits. Ignore legacy placement hints on creation. Display an existing tab **only when the user explicitly asks to see the page**; update the MCP and bundled skill guidance accordingly.
- Preserve the **current Screen, session and input focus** during browser connections and repeated display requests. Retain tabs placed in other Screens or workspace windows. Keep a usable hidden viewport for browser capture and automation.
- Remove the duplicate **Working** indicator in Chat. Keep one status bar above the composer with the current tool, elapsed time and work details, including startup, recovery, asynchronous questions and completion.

## 검증

- 브라우저 배치·MCP·백그라운드 처리 검사 75개와 기본 백그라운드 생성·명시적 표시 검사 24개를 통과했다.
- 격리된 실제 App 렌더러에서 다른 Screen의 최초·반복 연결, 동일 Screen의 다른 분할, 입력 포커스·작성 내용 유지와 명시적 사용자 선택을 확인했다. 레이아웃 800·1202·1920px 검사와 실제 Electron의 숨겨진 1280×800 캡처·창 표시/포커스 없음 검사를 통과했다.
- Chat 질문·Desktop/Remote·모델 선택 검사를 통과했다. Desktop의 작업 중 질문과 1280·420px에서 작업 표시가 하나인 것, 완료 후 숨김과 새 작업의 시간 초기화를 확인했다.
- 버전 갱신 후 전체 **180개 파일·1,236개 검사**와 모바일 설정·연결 검사 **24개**를 모두 통과했다. worker 2개·검사 제한 60초로 실행했고 실패·건너뛴 검사는 없다.
- 재사용하는 APK **1.8.1.39/code 21**의 패키지·아키텍처·서명 인증서·SHA-256을 확인했다. npm 버전 **1.8.1**, 제품 버전·Android 소스 versionName **1.8.1.70**을 맞췄다.
- 고정 소스 EXE 빌드·패키지 실행·공개 다운로드 검증은 배포 과정에서 기록한다.

로컬 증빙: `output/full-suite-exe-1.8.1.70.json`,
`output/full-suite-exe-1.8.1.70-summary.json`, `output/mobile-tests-exe-1.8.1.70.log`,
`output/browser-background-default-tests.log`, `output/browser-selection-workspace-smoke.log`,
`output/browser-selection-background-smoke.log`, `output/chat-working-single-question-smoke.log`,
`output/chat-working-single-model-smoke.log`, `output/apk-reuse-verification-1.8.1.70.log`.

## 배포 상태

EXE 빌드·배포 진행 중. 기존 서명 APK를 재사용하며 Microsoft Store 제출과 새 APK 빌드는 이 배포에 포함하지 않는다.
