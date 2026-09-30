---
type: Release
title: Acedia 1.8.1.34 EXE release
description: Change Codex and Claude session model/effort from Remote and keep waiting questions visible in chat.
status: stable
last_updated: 2026-09-30
sources:
  - resource: agent-launch-options.md
  - resource: remote-service.md
  - resource: ../app/electron/services/session-model-service.mjs
  - resource: ../app/electron/shared/chat-prompt.mjs
  - resource: ../app/scripts/electron-chat-question-smoke.mjs
---

# Acedia 1.8.1.34

- Remote와 Dashboard에서 세션을 우클릭하거나 상단 **모델 / effort** 버튼을 누르면 Codex·Claude 설정을 변경한다. **저장 (다음 시작)**은 작업을 유지하며 다음 시작에 적용하고, **저장 후 재시작**은 작업이 끝난 세션의 같은 대화·계정을 새 설정으로 이어간다.
- Codex 모델과 effort 목록은 해당 세션 계정의 `model/list`에서 확인한다. Claude 목록은 설치된 CLI의 별칭과 effort이며 계정의 실제 사용 권한은 실행 시 CLI가 확인한다. 계정 소유권, 대화 복원 경로와 재시작 후 시작 훅을 검증하며 공용 CLI 설정은 바꾸지 않는다. SSH와 다른 창에 분리된 세션의 변경은 지원하지 않는다.
- 데스크톱·Remote·Dashboard 채팅은 Question 상태에 **답변 대기 중** 안내를 표시한다. 선택지가 없는 질문, 질문 내용이 전달되지 않은 상태, 대화 기록 로딩 중에도 안내를 유지한다. Codex의 미응답 native 질문은 라이브 기록에서도 찾는다.
- 여러 질문과 선택지 설명을 모두 보여주고 **터미널에서 답변**으로 실제 입력 화면을 연다. 작업이 재개되면 안내를 해제하며 답변 전송 실패 시 남은 키를 보내지 않는다. 예약 메시지는 질문 대기 중 자동 전송하지 않는다.
- 모바일은 질문 본문을 스크롤하면서 답변 버튼을 계속 볼 수 있고, 상단 세션명·상태와 제어 버튼을 두 줄로 배치해 좁은 화면에서도 확인할 수 있다. Remote PWA cache는 **v79**다.
- Standard EXE와 같은 빌드의 `latest-exe.json`, blockmap을 게시한다. 서명·검증된 기존 Android APK **1.8.1.28**을 재사용하며 Android 소스 versionName만 1.8.1.34로 맞춘다. APK를 재빌드하지 않아 versionCode는 유지한다.

소스 검증: 전체 **858개 테스트**가 `--maxWorkers=4`로 통과했다. 프로덕션 빌드와 데스크톱 Chat·Remote 1024px/390px 질문 표시, 모델/effort 편집 UI, Remote PWA 회귀 smoke가 통과했다. 단위 테스트와 질문 UI 검증은 실계정의 모델 생성을 호출하지 않는다.

패키지 검증: Standard EXE 빌드, packaged bridge/Dashboard smoke와 packaged lifecycle smoke가 통과했다. 패키지에 포함된 모델 설정·질문 표시 모듈은 작업 소스와 해시가 일치하며 설치 파일의 FileVersion은 **1.8.1.34**다. 설치 파일과 `latest-exe.json`의 크기·SHA-256도 일치한다.

- 설치 파일: `Acedia-Setup-1.8.1.34-x64.exe`
- 크기: **120416797 bytes**
- SHA-256: `360297ed53566598d4275ea9cf28092e41537062764b20aaa3bfa5562f7cdd11`
- Authenticode: **NotSigned**. 파일 무결성 검증은 코드 서명을 대신하지 않는다.

GitHub [v1.8.1.34](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.34)는 소스 커밋 `b71b1e5afbca42b262a08ce92e35a4a78617f082`에서 게시됐다. 실제 자동 업데이트 코드가 이전 버전 1.8.1.33에서 새 버전을 감지하고 공개 설치 파일 다운로드·크기·SHA-256 검증을 통과했다. 게시 완료가 사용 중인 PC의 설치 완료를 뜻하지 않는다.
