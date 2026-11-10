---
type: Release
title: Acedia 1.8.2.09
status: prepared
last_updated: 2026-11-10
---

# Acedia 1.8.2.09

- 프로젝트 보드 창 정리 중 이미 파괴된 창의 `webContents`를 다시 읽어 `Object has been destroyed` 오류창이 뜨던 문제를 수정했다. 생성할 때 보관한 ID로만 등록을 해제하고, 종료 시 이동·크기 변경 저장 타이머와 뒤늦은 표시 콜백을 정리한다.
- 보드 내부를 드래그한 직후 마우스를 놓거나 드래그가 취소되면, 늦게 실행된 화면 갱신이 빈 드래그 정보를 읽던 오류를 수정했다. 포인터 캡처가 해제되는 경우도 처리하며 위치·크기·확대 상태 저장과 기존 세션 상태는 유지한다.
- 우측 파일 패널을 포함한 메뉴·사이드바·목록·대화상자·도구 모음의 실수로 인한 드래그 텍스트 선택을 차단한다. 입력창·편집기와 대화·문서·터미널의 복사용 선택은 유지한다.
- 기존 서명 APK 1.8.1.39를 재사용한다. 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Fix `Object has been destroyed` errors while cleaning up Project Board windows. Capture the renderer ID before destruction and cancel pending geometry saves and display callbacks when the board closes.
- Fix delayed pan updates reading a cleared drag anchor after pointer release, cancellation or lost capture. Preserve saved geometry and existing session state.
- Prevent accidental drag text selection across desktop navigation, including the right file panel, menus, lists, dialogs and toolbars. Keep editing and deliberate selection/copying in conversation, document and terminal contents available.

## 검증

- 전체 236개 파일의 1,906개 테스트와 TypeScript/Vite 빌드를 통과했다.
- 기존 소스에서 실제 main-process 등록 해제 코드를 사용해 `Object has been destroyed`를 재현하고, 수정 후 이동·크기 변경·종료·재열기·로딩 실패 정리 검사를 통과했다.
- 드래그 종료·취소 이후 실행되는 지연 React 갱신의 null 참조 오류를 재현하고, 포인터 캡처 해제까지 포함한 회귀 검사를 통과했다. 보드 관련 5개 파일의 28개 검사와 TypeScript/Vite 빌드를 통과했으며 GUI 자동화나 운영 세션 입력은 사용하지 않았다.
