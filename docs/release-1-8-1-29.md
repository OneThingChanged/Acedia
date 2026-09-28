---
type: Release
title: Acedia 1.8.1.29 EXE release
description: Keep Remote navigation open and identify routed requests by project and session.
status: stable
sources:
  - resource: remote-service.md
  - resource: account-pool.md
  - resource: ../app/electron/remote-pwa/app.js
  - resource: ../app/electron/remote-pwa/account-pool.js
  - resource: ../app/electron/services/hook-service.mjs
  - resource: ../app/src/components/SessionAccountIndicator.tsx
---

# Acedia 1.8.1.29

- Remote에서 세션을 선택해도 데스크톱·태블릿의 좌측 탐색 목록을 자동으로 접지 않는다. 사용자가 접기 버튼으로 정한 상태를 유지한다. 모바일 탐색 서랍은 선택 후 닫아 대화 내용을 보여 준다.
- Usage의 최근 분산 요청은 찾을 수 있는 세션을 `프로젝트명 · 세션명`으로 표시한다. 삭제되었거나 현재 작업 공간에 없는 세션 기록은 ID를 유지한다.
- 데스크톱 세션에는 현재 연결된 분산 계정 또는 직접 연결 계정을 표시한다. 분산 계정은 첫 요청 전 배정 대기로 나타난다.
- 계정 한도는 남은 비율로 표시하며 오래된 조회와 초기화 시각이 지난 값을 구별한다.
- Codex의 승인·신뢰 설정이 브라우저 MCP 설정 갱신 과정에서 지워지지 않도록 관리 구역 제거를 제한한다.
- Remote 서비스 워커 캐시를 v74로 갱신한다. Standard EXE만 배포하며 기존 서명된 Android APK를 재사용한다. Microsoft Store는 갱신하지 않는다.

실제 분산 계정 한도 소진과 계정 간 대화 재개는 서버 정책에 영향을 받으므로 별도 실계정 검증이 필요하다.
