---
type: Release
title: Acedia 1.8.1.27 EXE release
description: Remote full-path previews, account login and restart routing, and session server opening.
status: stable
sources:
  - resource: remote-service.md
  - resource: account-pool.md
  - resource: ../app/electron/services/remote-documents.mjs
  - resource: ../app/electron/services/account-pool.mjs
  - resource: ../app/src/components/SessionServerButton.tsx
---

# Acedia 1.8.1.27

- Remote 채팅에서 Unreal 플러그인이 속한 `.uproject` 작업공간의 전체 파일 경로를 연다. 이미지와 JSON 보고서를 지원하며, 작업공간 밖 경로는 차단한다.
- 분산 계정 로그인을 시작하면 인증 탭을 열고, 팝업 차단 시 복사할 주소를 표시한다.
- 계정 한도가 소진된 Codex 대화를 재시작하면 사용 가능한 다른 분산 계정으로 배정하고 이어받기를 시도한다. 진행 중인 요청은 전환하지 않는다.
- 세션에서 발견한 로컬 웹 서버를 상단 버튼으로 Chrome에서 연다. 서버가 여러 개면 목록에서 선택한다.
- Remote 서비스 워커 캐시를 v71로 갱신한다.

Standard EXE 채널의 데스크톱 전용 배포다. 검증된 기존 APK를 재사용하며 Microsoft Store는 갱신하지 않는다.
분산 계정 간 Codex 대화 이어받기는 실제 계정 권한에 따라 거부될 수 있다.
