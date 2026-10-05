---
type: Release
title: Acedia 1.8.1.56 verified session task delivery
description: Deliver tasks to live Codex sessions through MCP, verify receipt and task start, prevent duplicate execution, and show delivery status.
status: stable
last_updated: 2026-10-05
sources:
  - resource: workspace-mcp.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/services/session-delivery.mjs
  - resource: ../app/electron/services/pty-submit.mjs
  - resource: ../app/src/components/SessionDeliveryNotice.tsx
  - resource: ../app/scripts/codex-session-delivery-smoke.mjs
---

# Acedia 1.8.1.56

## 변경 사항

- **세션 간 작업 전달 MCP**: `acedia_session_send`로 다른 실행 중인 로컬 Codex 세션에 사용자가 맡긴 작업을 전달한다. `acedia_session_delivery`로 같은 요청의 상태를 조회한다. 수신 세션의 모델·effort·계정·기존 대화와 CLI를 유지한다.
- **전송·수신·작업 시작 확인**: 터미널 입력 성공과 실제 작업 접수를 구분한다. 수신 대화의 사용자 메시지 본문과 고유 전달 번호, 새로운 `task_started`를 확인하고 보내는 세션과 받는 세션 상단에 3단계 상태를 표시한다. 시작은 작업 완료를 뜻하지 않는다.
- **중복 실행 방지와 미확인 안내**: 같은 요청 키는 동시 호출·시간 초과·앱 재시작 후에도 다시 전송하지 않는다. 결과를 확정하지 못하면 경고하고 기존 응답 필요 알림 설정을 따른다. 작업 중·질문 대기·입력 초안·대화 변경을 감지하면 전달을 거부한다.
- **Windows 문자 보존**: 한글 문장 속 특수기호·화살표·이모지가 단축키로 처리되어 빠지던 문제를 수정했다. 여러 줄 입력과 별도 Enter를 순서대로 전송한다. 메시지는 최대 8 KiB이며 줄바꿈 외의 제어 문자와 탭은 거부한다. 들여쓰기는 공백을 사용한다.
- 제품·설치 파일·Android 소스 버전은 **1.8.1.56**, npm 호환 버전은 **1.8.1**이다. 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다. 업데이트 후 **호출하는 CLI 세션을 다시 시작**해야 새 MCP 도구가 나타난다. 현재 수신 대상은 로컬 Codex이며 Claude·SSH는 지원하지 않는다.

## Changes

- Add `acedia_session_send` and `acedia_session_delivery` for user-authorized tasks sent to another live local Codex session, preserving its model, effort, account, conversation and CLI.
- Distinguish terminal submission from a matching user-message receipt and a new task-start event. Show Sent → Received → Task started in both desktop session panes. Task start does not imply completion.
- Persist request identities before submission, prevent replay across concurrent retries and app restarts, and warn when receipt/start cannot be confirmed. Reject busy receivers, questions, existing drafts and changed conversations.
- Preserve Unicode punctuation, arrows and emoji through Windows ConPTY. Submit multiline text before a separate Enter. Messages are limited to 8 KiB; use spaces instead of tabs.
- Restart calling CLI sessions after updating to expose the new MCP tools. Receiving sessions currently support local Codex. Reuse the signed mobile APK 1.8.1.39.

## 검증

- 전체 **164개 파일·1,075개 검사**, TypeScript/Vite 빌드를 통과했다. 후속 입력·인증 경계 변경은 관련 27개 회귀 검사를 다시 통과했다.
- 설치된 **Codex CLI 0.160.0**을 격리 프로필과 로컬 응답 fixture로 실행해 실제 stdio MCP·한글·특수기호·이모지·줄바꿈 전달, 원래 문맥·모델·effort 유지, 수신·작업 시작, 동일 키 및 앱 재시작 후 중복 방지를 검증했다.
- 실제 Electron의 **900/390px** 화면에서 3단계 상태·미확인 경고·닫기·좁은 화면 배치를 검증했다. production main/preload 브리지 검사를 통과했다.
- 버전·APK·업데이터 관련 **14개 검사**도 통과했다.
- EXE 생성과 packaged bridge·Dashboard·내장 Git·종료·트레이·보안 lifecycle 검증을 통과했다. 패키지의 관련 Electron 소스 **8개**, 별도 unpacked MCP 실행 파일과 renderer 파일 **3개**가 빌드 원본과 일치하고 재사용 APK도 일치했다.
- 설치 파일 FileVersion **1.8.1.56**, manifest의 파일명·크기·SHA-256과 blockmap을 확인했다. `publish-github-exe.ps1 -VerifyOnly`를 통과했다. Authenticode는 기존 EXE 채널과 같은 **NotSigned**다.
- 실제 사용자 설치 프로그램을 실행하거나 사용자 작업 세션에 모의 요청을 전달하지 않았다.

## 공개 배포

2026-10-05 **22:05:06 KST**, [v1.8.1.56](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.56)를 최신 안정 EXE 릴리스로 게시했다. 제품 태그와 릴리스 대상은 검증한 소스 `95b9a0f97ca7c512b66972f97f6dd15a0482ef17`이다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.56-x64.exe` | 151,268,876 | `86171f98981bfa7492d6d884e1754b9087ec9938cc7f57353ad892a2c2a1ff82` |
| `Acedia-Setup-1.8.1.56-x64.exe.blockmap` | 159,395 | `531a2f221bc1cb12ab791d2ca7b1aafe61a55e19549303fef10a03dcdbdd2665` |
| `latest-exe.json` | 256 | `ee3850d901a9ae9d8bb0fa6e0d3f897b87e34cd1d0f38c7447decd7ad5f6cb8c` |

**22:06:00 KST**에 프로덕션 업데이터의 **1.8.1.54 및 1.8.1.55 → 1.8.1.56 감지**와 **1.8.1.55 기준 공개 EXE 다운로드·설치 전 해시 검증**을 완료했다. 세 공개 자산의 크기·SHA-256, 최신 안정 릴리스, 소스 태그와 번들 APK 버전 **1.8.1.39**도 일치했다.

Git 소스와 EXE 게시를 완료했다. 설정의 Check → Update로 적용하고 **CLI 세션을 다시 시작**하면 새 MCP 도구가 나타난다. 사용자 PC에 설치를 실행하지 않았으며 Microsoft Store와 새 APK 배포는 수행하지 않았다.
