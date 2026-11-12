---
type: Release
title: Acedia 1.8.2.12
status: prepared
last_updated: 2026-11-12
---

# Acedia 1.8.2.12

- 프로젝트 보드를 제공된 HTML 기준의 카드·상태 아이콘·확인 목록·툴바 구성으로 정리했다. 실제 프로젝트 폴더와 등록된 부모 관계를 배치에 반영하며, 세션이 많은 카드는 내부 스크롤과 정확한 세션 찾기를 제공한다.
- 계층선과 메시지 읽기 참조선이 중간 카드를 피하도록 경로를 계산한다. 역방향 참조는 서로 마주 보는 끝점을 사용하며, 접힌 카드·개요 모드·스크롤 상태도 반영한다. 이동·확대만으로 경로를 재계산하지 않는다.
- Remote의 두 세션 동기화 경로에서 빠졌던 부모 ID·프로젝트 ID·보관 및 비활성 자식 표시 설정을 전달한다. Active에서도 실행 중인 자식에 필요한 비활성 부모를 보존하며, 부모 변경·해제를 반영한다.
- Remote/Dashboard 세션 목록에 계층선·부모 이름·표시 중인 자식 수를 제공하고, 대화 상단의 상위 세션 경로에서 해당 대화로 이동할 수 있다. 깊은 트리의 모바일 들여쓰기를 제한하고 트리 모듈의 캐시 갱신을 보강했다.
- 기존 서명 APK 1.8.1.39를 포함한다. 이번 배포는 Standard EXE와 GitHub 채널이며 새 APK·Microsoft Store·Company 배포는 포함하지 않는다.

## English

- Align the project board with the supplied HTML design, with folder-aware project placement, readable session cards, a review inbox and bounded scrolling for large projects.
- Route hierarchy and observed message-read connections around cards, with facing endpoints, rounded corners and support for folded or scrolled views.
- Restore parent and visibility metadata in both Remote synchronization payloads. Show nested session families, parent labels, child counts and navigable ancestor paths in Remote/Dashboard.
- Refresh the session-tree module through the app-shell cache policy. Reuse the existing signed mobile APK; this release publishes only the Standard EXE channel.

## 검증

- 전체 **246개 파일·1,972개 테스트**를 확인했고 skip·todo는 0개다. 첫 실행의 Git PATH 누락으로 Store 시뮬레이션 6건이 실패했으며, 환경을 보완한 해당 파일 재검증을 합산한 결과다. 제품 코드나 테스트를 바꿔 통과시키지 않았다.
- SVG의 선분·둥근 모서리를 샘플링해 카드 침범을 확인하고, 역방향·중간 장애물·접기·스크롤·깊은 세션 트리를 검사했다.
- 실제 데스크톱 Remote 직렬화, 인증된 HTTP 상태, 운영 코드의 Node DOM 탐색·접기·상위 세션 이동과 서비스워커 갱신 검사를 통과했다.
- GUI나 사용 중인 세션 조작은 수행하지 않는다. 고정 소스의 패키지·설치 파일과 공개 다운로드 결과는 배포 후 기록한다.
