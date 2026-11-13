---
type: Release
title: Acedia 1.8.2.15
status: ready
last_updated: 2026-11-13
---

# Acedia 1.8.2.15

- 프로젝트 보드의 연결점을 부모 아래·자식 위로 고정하지 않고, 카드 배치에 따라 상하좌우에서 마주 보는 면을 선택한다.
- 옆에 놓인 카드나 긴 부모 카드의 중간 높이에 있는 자식은 좌우로 직접 연결할 수 있다. 카드와 겹치지 않는 경로의 길이와 꺾임을 비교하며, 연결면이 막히면 다른 방향도 검사한다.
- 접기·개요 보기·드래그 후 표시된 카드 크기로 연결점을 다시 계산한다. 프로젝트 배치와 실제 부모·자식 관계는 그대로 유지한다.
- 짧은 직선 경로가 확인되면 불필요한 방향 탐색을 생략한다. 기존 메시지 읽기 참조선과 프로젝트 내부 세션 트리는 유지한다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 포함한다. 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Choose facing project-card ports from all four directions instead of forcing every parent connection from bottom to top.
- Connect side-by-side cards directly, including children placed beside the middle of a tall parent. Compare obstacle-free routes by distance and bends and try another direction when an exit is blocked.
- Recompute visible ports after dragging, folding or entering overview without modifying saved positions or parent relationships. Stop searching when remaining candidates cannot improve the route.
- Preserve observed message-read connections and internal session trees. Reuse the existing signed mobile APK for the Standard EXE channel.

## 검증

- 방향 선택·장애물 회피·접기·이동·기존 보드 회귀 테스트 54개와 TypeScript/Vite 빌드가 통과했다.
- 전체 Vitest 249개 파일·2024개 테스트가 실패·대기 없이 통과했다. 패키지 API·native PTY, 설치 파일 CRC·압축 데이터·설치 전 검증 모드 및 공개 다운로드는 배포 과정에서 추가 확인한다.
- GUI 자동화나 운영 세션의 메시지 전송은 수행하지 않는다.
