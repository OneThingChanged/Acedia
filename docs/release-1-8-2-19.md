---
type: Release
title: Acedia 1.8.2.19
status: prepared
last_updated: 2026-11-15
---

# Acedia 1.8.2.19

- 실제 자식 작업을 기다리는 리더 세션에 보라색 상태점과 대기 수, 3.6초마다 회전하는 테두리를 표시한다. 프로젝트 목록·최근 대화·보드에 같은 대기 상태를 사용한다. 동작 줄이기 설정에서는 고정 테두리를 표시한다.
- 현재 작업 시도의 시작 증거 또는 최신 지시의 착수·원문 읽음과 자식의 진행 상태를 확인한다. 리더의 직접 작업 재개·질문·중단과 자식의 응답 종료를 우선하며, 예전 지시를 새 작업의 대기로 오인하지 않는다. 이전 미확인 결과와 읽음 영수증은 보존한다.
- 리더의 실제 작업 대기는 실행 중인 세션에 연결해 관측한다. 사용자 화면의 상태 조회와 조직상의 부모 관계만으로 대기를 만들지 않는다. 사이드바는 본문 없이 대기 수·세션 ID만 가볍게 조회한다.
- 보드에서 숨긴 세션·접은 프로젝트·축소 화면의 실제 카드 크기에 맞춰 자동 정렬한다. 펼친 상태의 높이와 전체 표시 위치를 빈 공간으로 남기지 않는다.
- 전체 표시의 수동 배치는 보존하며 자동 정렬 보기의 드래그는 임시로 적용한다. 다시 모두 펼쳐 상세 표시하면 저장 배치를 복원한다. 기존 보드 위치가 화면 밖에 남지 않도록 보기 위치를 한 번 갱신하며, 찾기로 숨긴 세션을 임시 표시하는 동작과 업무순 정렬도 유지한다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 재사용한다.

## English

- Show a purple status dot, child-task count and a border orbiting every 3.6 seconds while a leader waits for actual delegated work. Honor reduced-motion preferences with a stationary outline.
- Require current task-start evidence or an exactly started and read handoff to a working child. Prioritize resumed foreground work, questions and stopped/completed children without consuming earlier results or changing read receipts.
- Observe authenticated owner waits against the exact running session. Keep UI polling and organizational parent relationships distinct from delegation; poll only concise waiting metadata in the sidebar.
- Repack the board around visible sessions, folded projects and overview headers instead of reserving space for expanded or hidden content.
- Preserve saved full-board placement while allowing temporary dragging in automatic views. Restore saved placement in the fully expanded detailed view and migrate old viewport offsets once.
- Reuse the existing signed 1.8.1.39 Android APK for this Standard EXE release.

## 검증

- 전체 Vitest 261개 파일·2,113개 테스트와 TypeScript/Vite 프로덕션 빌드가 통과했다. 버전 갱신 후 고정 소스의 검사와 패키지·공개 다운로드 결과는 배포 기록에 추가한다.
- GUI 자동화, 운영 세션의 입력·중단·재시작과 실제 설치는 수행하지 않는다. 공개 게시와 사용자 PC의 설치·업데이트 확인은 구분한다.
