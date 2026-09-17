---
type: Release
title: Acedia 1.8.1.17 EXE release
description: Unified chat and Remote composer keys, including the previously unpublished 1.8.1.16 changes.
status: stable
sources:
  - resource: ../app/src/components/ChatView.tsx
  - resource: ../app/electron/remote-pwa/app.js
  - resource: remote-service.md
  - resource: release-1-8-1-16.md
---

# Acedia 1.8.1.17

- 채팅·리모트 입력에서 Enter는 전송, Ctrl+Enter는 커서 위치 또는 선택 영역에 줄바꿈입니다. Cmd+Enter도 줄바꿈으로 처리합니다.
- 자동완성 목록이 있으면 일반 Enter/Tab은 항목을 선택하며, Ctrl+Enter는 줄바꿈합니다. 한글 등 IME 조합 중에는 전송하지 않습니다.
- 리모트 줄바꿈 시 임시 입력 저장·입력창 높이를 함께 갱신합니다. 안내 문구와 PWA 캐시를 갱신했습니다.
- [1.8.1.16 소스 변경](release-1-8-1-16.md)의 브라우저 확장·대화 옆 브라우저 스킬·삭제 포커스·Antigravity 시작 수정도 포함합니다.

EXE 전용 배포입니다. APK는 기존 검증된 파일을 포함하며 새 APK나 Store 제출을 만들지 않습니다.
리모트는 데스크톱 업데이트 후 페이지를 새로고침해야 새 키 처리를 사용합니다.

소스 검증: TypeScript, Remote 키 처리·선택 영역 줄바꿈·IME 방지 검사 및 OKF 검증을 통과했습니다.
전체 회귀 검사는 단일 worker 실행에서 123개 파일·737개 테스트가 통과했습니다.
최초 병렬 실행의 캐시 기대값 불일치는 갱신했으며, 함께 나타난 Store 검사 시간 초과와
사용량 수집기 합계 불일치는 재검사에서 통과했습니다. 수집기 문제를 수정한 릴리스는 아닙니다.

소스 검사와 패키지 검증 후 GitHub Release에 게시합니다. 실제 게시 상태·산출물은
[GitHub Release](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.17)에서 확인합니다.
게시 성공은 사용자 PC의 설치 완료를 의미하지 않습니다.
