---
type: Release
title: Acedia 1.8.1.24 EXE release
description: Multiple account selections in the desktop status bar.
status: stable
sources:
  - resource: status-bar-settings.md
  - resource: properties-and-usage.md
  - resource: ../app/src/lib/statusBarSettings.ts
  - resource: ../app/src/components/UsageStatusBar.tsx
  - resource: ../app/scripts/electron-properties-smoke.mjs
---

# Acedia 1.8.1.24

- 계정 한도 창의 하단바 표시 선택을 체크박스로 변경해 여러 계정을 동시에 표시한다.
- 기존 한 계정 선택을 유지하고, 모두 해제한 상태도 저장한다. 계정 관리 버튼은 계속 남는다.
- 선택은 계정 ID를 기준으로 저장하며 재시작과 작업창 사이에서 유지한다.
- 숨기거나 등록 해제한 계정은 표시에서 제외하고, 제공자 필터를 다시 켜면 저장된 선택을 복원한다.
- 계정이 많으면 하단 영역을 가로로 스크롤하거나 Tab으로 이동한다. 하단바 높이는 28px로 유지한다.
- 하단바 표시 선택은 세션의 로그인 계정을 바꾸지 않는다.

다중 선택·저장 실패·모두 해제·창 재열기·다른 창 변경·계정 이름 변경·삭제·제공자 필터를
1202×801, 800×640, 390×844 Electron 화면에서 검증했다.

배포 대상은 Standard EXE GitHub 채널이다. 기존 검증된 APK 1.8.1.19를 재사용하며
새 APK나 Microsoft Store 제출은 생성하지 않는다. 이전부터 수정 중이던 hook 서비스와
해당 테스트는 작업 트리에 보존하고 이번 배포에 포함하지 않는다.

게시 및 자산의 최종 상태는 [릴리스 페이지](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.24)에서 확인한다.
GitHub 게시와 사용자 PC에 업데이트 설치 완료는 별도다.
