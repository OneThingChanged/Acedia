---
type: Release
title: Acedia 1.8.2.33
status: published
last_updated: 2026-11-23
---

# Acedia 1.8.2.33

- 업무 보드의 프로젝트 제목에서 우클릭으로 새 세션을 만들 수 있습니다. 프로젝트와 세션의 계층 편집 메뉴는 해당 항목을 선택한 상태로 계층 보드를 엽니다.
- 업무 보드에서 폴더 계층과 별도로 지정한 부모 프로젝트를 구분해 그립니다. 연결선을 직선이나 곡선으로 설정하고, 업무 보드·계층 보드·Pixel Office를 오갈 수 있습니다.
- 새 세션 창의 경로를 클릭해 작업 폴더를 지정할 수 있습니다. 로컬 폴더 선택, SSH 경로 입력, 자식 세션의 기본 폴더 상속을 지원합니다.
- 보드에서 결과를 확인하면 왼쪽 세션 목록의 해당 완료 표시도 해제됩니다. 이후 도착한 결과와 질문은 계속 표시합니다.
- 인계 알림에 한글 프로젝트명과 발신 세션명을 표시합니다. 받는 대화가 바뀌면 원문이 해당 수신함에 남아 있다고 안내하고 같은 대상의 반복 경고를 줄입니다.
- Windows Standard EXE에 기존에 서명한 Android APK 1.8.1.39를 포함합니다.

## English

- Create a session from a project header's context menu. Edit a project's or session's hierarchy with the selected item open in the hierarchy board.
- Distinguish folder ancestry from configured project parents. Choose straight or curved connections and switch between the work board, hierarchy board, and Pixel Office.
- Set the working folder in the new-session dialog using the local folder picker or an SSH path. Child sessions can use the inherited folder.
- Reviewing a result in the board clears its completion highlight in the sidebar. New results and questions retain their indicators.
- Handoff notifications show the project and sender names, including Korean names. If the receiving conversation changes, the notice points to the stored original and repeated warnings for the same target are reduced.
- The Windows Standard EXE bundles the existing signed Android APK 1.8.1.39.

## 배포 및 검증

- 2026-11-23 02:49:59 KST에 `83c21307649883a882ad2ecfdf3d4c0843962db9`에서 빌드한 Windows Standard EXE를 게시했습니다. [GitHub 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.33)
- 데스크톱 테스트 2,338개를 통과했습니다. 빌드된 패키지에서 보드 이동과 결과 확인, 한글 발신자 표시와 원문 조회, Dashboard·Remote API 및 앱 수명주기를 검증했습니다.
- 1.8.2.31과 1.8.2.32에서 업데이트를 감지했습니다. 02:50:57 KST에 공개 자산의 SHA-256, NSIS CRC `46062b96`, 압축 데이터와 설치 프로그램 시작을 검증했습니다. 설치 파일의 Authenticode 상태는 `NotSigned`입니다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.33-x64.exe` | 156426520 | `94fca2f05844dbed95e516122885846929704954540426b0742abcf175f49c7a` |
| `Acedia-Setup-1.8.2.33-x64.exe.blockmap` | 163479 | `761fe6177f275baa95d7db272e6dfac0d506db5097dd38e26b1e2f99ffff4ed6` |
| `latest-exe.json` | 256 | `7d93b6e8c7f1addeed9e30292064c8e60fd4b68defe4bc186cc0e575fc451ed1` |
