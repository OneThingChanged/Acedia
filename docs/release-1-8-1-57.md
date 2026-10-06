---
type: Release
title: Acedia 1.8.1.57 automatic local-page Hosting and conversation reset
description: Open local website links through Hosting automatically and reliably switch Remote chat to a fresh Codex conversation after clear.
status: draft
last_updated: 2026-10-06
sources:
  - resource: remote-service.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/services/remote-hosting.mjs
  - resource: ../app/electron/services/codex-conversation-reset.mjs
  - resource: ../app/electron/remote-pwa/chat-markup.js
  - resource: ../app/scripts/electron-remote-clear-hosting-smoke.mjs
---

# Acedia 1.8.1.57

## 변경 사항

- **로컬 페이지 자동 Hosting**: Remote와 Dashboard 채팅·터미널에서 개발 PC의 `http://127.0.0.1:포트/...`, `localhost`, IPv6 loopback 링크를 클릭하면 프로그램이 Hosting에 등록하고 미리보기를 연다. 다른 기기의 localhost를 잘못 열던 문제를 해결한다. Markdown 링크·일반 주소·인라인 코드 주소를 지원한다.
- **등록 재사용과 링크 갱신**: 같은 페이지는 기존 Hosting 항목을 재사용하고 클릭할 때마다 30분 미리보기 링크를 발급한다. 등록은 Hosting 목록에 유지되며 목록에서도 다시 열 수 있다. 서버가 응답하지 않으면 개발 PC 서버와 URL을 확인하라는 안내를 표시한다.
- **기존 모바일 앱 호환**: Hosting 페이지를 모바일 앱의 격리된 미리보기 안에서 연다. 새 APK 설치 없이 자동 Hosting을 사용할 수 있다. 개발 PC의 웹 서버는 실행 중이어야 한다.
- **Remote `/clear` 수정**: 완성된 명령을 Enter 한 번으로 전송한다. 실제 Codex의 새 대화 ID를 확인한 뒤 채팅을 초기화하고 늦게 도착한 이전 대화 응답을 제외한다. 세션을 다시 선택하거나 페이지를 새로고침해도 이전 기록이 돌아오지 않는다. 전송 실패 시 입력과 기존 화면을 유지하며 저장된 대화 파일은 보존한다.
- 제품·설치 파일·Android 소스 버전은 **1.8.1.57**, npm 호환 버전은 **1.8.1**이다. 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다. 설정의 Check → Update로 데스크톱을 업데이트한 뒤 Remote 페이지를 새로고침하면 적용된다.

## Changes

- Automatically register HTTP loopback links with an explicit port in Hosting when clicked from Remote or Dashboard chat and terminal output. Support Markdown, plain URL and inline-code links.
- Reuse existing page registrations and issue a fresh 30-minute preview link on each open. Keep entries in the Hosting list and report an unavailable development-PC server clearly.
- Open hosted pages inside the existing mobile application's isolated Hosting preview; no new APK is required. The development-PC web server must remain running.
- Submit a completed `/clear` command with one Enter, confirm the actual new Codex conversation ID, and prevent stale transcript responses from restoring the old chat. Preserve drafts and the current view on submission failure, and retain saved conversation files.
- Update the desktop to 1.8.1.57 and refresh Remote. Reuse the signed mobile APK 1.8.1.39.

## 검증

- 전체 **165개 파일·1,085개 검사**를 실행했다. 초기 실패 3개가 포함된 파일은 서비스 워커 캐시 기대값 수정과 worker 1개 재검증 후 **38개 검사**를 통과했다. 관련 기능·버전·APK 검사와 TypeScript/Vite 빌드도 통과했다.
- 설치된 **Codex CLI 0.160.1**을 격리 프로필과 로컬 응답 fixture로 실행해 `/clear` 후 실제 새 대화 ID, 이전 모델 문맥 제외, 새 transcript 일치와 기존 transcript 보존을 확인했다.
- 실제 Electron의 Remote와 Dashboard **1280/390px** 화면에서 자동 Hosting 등록·중복 방지·CSS/이미지·격리된 스크립트 실행, Enter 한 번의 clear, 실패 시 화면 유지, 이전 응답 제외, 세션 재선택·새로고침과 기존 APK 미리보기 호환을 검증했다.
- 실행 중인 사용자 세션에 시험 요청을 보내거나 설치된 앱을 종료하지 않았다. EXE 패키지 및 공개 업데이트 검증 결과는 게시 후 추가한다.
