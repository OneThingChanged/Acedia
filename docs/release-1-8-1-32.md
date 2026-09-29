---
type: Release
title: Acedia 1.8.1.32 EXE release
description: Restore live Remote conversations and queued messages, and improve session and document controls.
status: stable
sources:
  - resource: remote-service.md
  - resource: account-pool.md
  - resource: ../app/electron/main.mjs
  - resource: ../app/electron/services/codex-turn-completion.mjs
  - resource: ../app/electron/remote-pwa/app.js
  - resource: ../app/src/components/SessionLaunchAccountModal.tsx
---

# Acedia 1.8.1.32

- Remote와 Dashboard 채팅은 Codex 대화 파일 경로가 Windows 연결 경로를 통과해도 같은 계정의 파일로 인식한다. 새 hook이 보고한 세션 ID로 전환하고, 브라우저에 남은 이전 세션의 대화 캐시는 버린다.
- 완료 hook이 누락되어 세션이 계속 `Working`으로 보이는 경우, 마지막 hook 이후 대화 파일에 기록된 Codex 턴 완료를 확인해 상태를 복구한다. 이를 통해 Remote의 예약 메시지 대기열이 완료된 턴 뒤에 다시 진행된다. 현재 작업 중임이 불확실하거나 다른 계정의 파일이면 상태를 바꾸지 않는다.
- Remote 전송의 결과를 확인할 수 없을 때 같은 요청을 자동 재전송하지 않는다. 대화와 터미널을 확인한 뒤 사용자가 새 전송을 선택하도록 안내한다.
- 데스크톱에서 세션을 시작할 때 분산 계정을 자동 배정하거나 지정하는 선택 창을 제공한다. Codex hook 설정의 관리 구역이 재배치된 경우에도 사용자 설정을 보존하며 복구한다.
- Remote의 새 세션 창은 바깥 영역 클릭으로 닫히지 않고 **Cancel** 또는 **Esc**로 닫는다. Documents 파일의 우클릭·작업 버튼에서 상대/절대 경로를 확인·복사하거나 확인 후 휴지통으로 이동할 수 있다.
- Remote 서비스 워커 캐시를 v77로 갱신한다. Standard EXE만 배포하고 기존 서명된 Android APK를 재사용한다. Microsoft Store는 갱신하지 않는다.

검증: 데스크톱 테스트 801개, 프로덕션 빌드, Remote PWA 테스트와 패키지 실행·종료 테스트가 통과했다. 설치 파일의 버전·크기·SHA-256은 `latest-exe.json`과 일치한다. 임시 Codex 프로필을 쓰는 선택적 이미지 전송 통합 테스트는 Codex CLI 0.157.1의 daemon 설치가 완료되지 않아 전송 단계까지 확인하지 못했다. EXE는 기존 1.8.1.31 설치본과 마찬가지로 Authenticode 서명이 없다. 실제 사용자 PC의 설치·업데이트는 릴리스 게시와 별개로 확인한다.
