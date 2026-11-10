---
type: Release
title: Acedia 1.8.2.09
status: published
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
- 패키지의 Electron Node 런타임에서 실제 main 등록·정리 코드를 사용한 창 수명 모델을 검증했다. 파괴 뒤 native getter가 예외를 내는 조건에서 이동·크기 변경·종료·재열기가 통과하고 작업창 등록은 유지된다. 보드 권한 제한, 기존 세션 열람·큐·첨부 파일·수집 API·native PTY 회귀 검사도 통과했다.
- ASAR 런타임·렌더러 파일 390개와 Pixel Office 자산·라이선스 20개가 고정 소스와 일치한다. 로컬·공개 설치 파일의 NSIS CRC `f97cf362`, 압축 파일 전체 검사와 설치 전 검증 모드 시작을 통과했다. 기존 EXE 채널과 같은 미서명(`NotSigned`) 상태이며 사용 중인 앱을 종료하거나 설치를 덮어쓰지 않았다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.09](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.09).
- 게시: **2026-11-10 13:09:08 KST**. 공개 전체 다운로드 검증: **13:09:57 KST**.
- 제품 소스 커밋: `a8c36ebffc68b615eb3cae002480bd54e6fed7e5`.
- 실제 업데이터에서 **1.8.2.08 / 1.8.2.07 / 1.8.2.06 → 1.8.2.09** 감지를 확인했다. 공개 자산의 태그·크기·SHA-256·manifest가 빌드 원본과 일치한다.
- 앱 업데이트·재시작 후 적용된다. 기존 서명 APK 1.8.1.39를 재사용하며 새 APK·Store·Company 배포는 수행하지 않았다. 운영 세션·설정·브라우저 큐는 배포 과정에서 조작하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.09-x64.exe` | 156275809 | `c6c823609758c86da1ed3409c3daeb90953c85e1bda479161fe78f6c060b1c7a` |
| `Acedia-Setup-1.8.2.09-x64.exe.blockmap` | 163665 | `f8a30ad84bd2d91aed35d630f37a135de00e5c9027ea07a9d45f9a565c23d5e1` |
| `latest-exe.json` | 256 | `599a57e76ca44056123872342a82a79d73207cea797736a69051022ed733d2e6` |
