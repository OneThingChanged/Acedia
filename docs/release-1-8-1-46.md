---
type: Release
title: Acedia 1.8.1.46 questions, LAN access and unified account usage
description: Cyan question status and Chat answers, per-session alerts, local-network Dashboard access, and consistent Codex account quotas.
status: draft
last_updated: 2026-10-03
sources:
  - resource: notifications-and-power.md
  - resource: local-dashboard.md
  - resource: account-pool.md
  - resource: usage-accounting.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/services/active-questions.mjs
  - resource: ../app/electron/services/question-responder.mjs
  - resource: ../app/electron/services/lan-access.mjs
  - resource: ../app/electron/services/codex-usage-accounts.mjs
  - resource: ../.github/workflows/release-exe.yml
---

# Acedia 1.8.1.46

## 변경 사항

- **Question 답변 대기와 Chat 응답**: Codex가 답변을 기다릴 때 Cyan 상태와 알림으로 표시한다. Chat에서 선택지 또는 단일행 직접 입력으로 답하면 원래 CLI 질문에 전달되어 작업이 이어진다. 데스크톱·Dashboard·Remote에 적용되며, 작업을 계속하는 비동기 질문은 작업 중 상태를 유지한다.
- **세션별 알림과 아이콘 도구**: 세션 상단의 종 아이콘으로 해당 세션의 질문·완료·벨 알림을 켜거나 끈다. 복구·알림·작업자·Chat/터미널 전환을 아이콘으로 표시하고 마우스 및 키보드 포커스 툴팁을 제공한다. 알림 설정은 다시 실행해도 유지되며 다른 창과 웹 화면에 공유된다.
- **같은 공유기에서 Dashboard 접속**: 설정 → 대시보드에서 **LAN 접속 허용**을 켜고 표시된 IP·포트 주소와 8자리 연결 코드를 다른 PC에서 사용한다. 연결 코드를 갱신하거나 LAN을 끄면 연결된 기기의 접근을 해제한다. 앱 재시작 후에는 다시 연결하며, 방화벽·공유기 설정은 자동 변경하지 않는다.
- **Codex 계정 사용량 통합**: 하단바·에이전트 사용량·Dashboard·Remote에서 계정 관리에 등록한 이름과 한도를 함께 사용한다. 같은 계정의 기존 `Default` 표시는 등록한 이름으로 합치고 선택·숨김 설정을 이어받는다. 분산 제외 계정도 사용량을 확인할 수 있으며 하단 사용량 창에서 **계정 관리·분산**을 바로 연다.
- 제품·Android 소스 버전은 **1.8.1.46**, npm 호환 버전은 **1.8.1**이다. EXE에는 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다.

## Changes

- Show waiting questions in cyan and notify when an answer is needed. Answer supported Codex questions from Chat on desktop, Dashboard and Remote, including choices and single-line text.
- Add persistent per-session alert controls and icon toolbar actions with mouse and keyboard tooltips.
- Allow Dashboard access from another PC on the same LAN using the displayed address and an eight-digit connection code.
- Unify Codex quota names and data with Accounts & routing. Match duplicate default logins by account identity, preserve display choices, and keep excluded accounts available for quota display.

## 검증

- 로컬 전체 **150개 파일·957개 테스트**, TypeScript/Vite 프로덕션 빌드와 `git diff --check`를 통과했다.
- 실제 Electron과 프로덕션 preload/IPC 허용 목록으로 사용량 통합·계정 선택 승계·이름 변경·관리 화면 연결, LAN 연결·Chat 전송·문서 열기·복사·로그아웃을 검증했다.
- 질문 UI·세션 아이콘·알림 설정을 데스크톱 및 390px/1024px 웹 화면에서 확인했다. 설치된 Codex CLI 0.160.0과 모의 모델 서버로 단일/여러 질문 감지 및 네이티브 폼 응답을 검증했으며 유료 모델 호출은 하지 않았다.
- 기존 Remote/PWA의 PC·모바일 화면, 문서·사용 기록·서비스 워커와 6개 언어, 계정 등록·로그인·갱신 흐름을 확인했다.
- GitHub Windows 빌드·packaged bridge/Dashboard·lifecycle 검증과 공개 업데이터 다운로드 확인은 배포 실행에서 완료 후 아래에 기록한다.

## 공개 배포

EXE 라이브 배포 준비 중이다. Microsoft Store와 새 APK 배포는 이 릴리스 범위에 포함하지 않는다. 게시 결과와 자산 무결성 검증을 완료한 뒤 갱신한다.
