---
type: Release
title: Acedia 1.8.1.67
description: "상단 중앙 Quick Search와 사이드바 프로젝트·세션 통합 입력 검색."
status: draft
last_updated: 2026-10-08
---

# Acedia 1.8.1.67

## 변경 내용

- 상단 메뉴 중앙에 **Quick Search**를 배치했다. 기존 통합 검색으로 프로젝트·세션·분할 화면·문서·명령을 열고, 설정한 단축키를 그대로 사용한다. 좁은 창에서도 오른쪽 도구와 네이티브 창 버튼을 가리지 않는다.
- 사이드바 검색 아이콘을 없애고 새 대화 아래에 **세션과 프로젝트 검색** 입력창을 제공한다. 프로젝트·세션 결과를 함께 표시하며 이름, 로컬·원격 경로, 프로젝트 폴더 이름과 세션 공급자를 찾는다. 선택한 프로젝트나 활성·휴면 필터와 독립적으로 검색한다.
- 검색 결과에서 프로젝트를 선택하면 프로젝트 영역과 해당 로컬·SSH 폴더를 펼쳐 하위 세션을 표시한다. 다른 프로젝트의 접힘 상태를 유지하고, 대화가 없는 프로젝트도 검색해서 새 대화를 시작할 수 있다. 세션 결과는 기존 세션 열기 동작에 연결한다.
- 방향키·Enter로 결과를 선택하고 Esc·지우기 버튼으로 탐색 목록에 돌아간다. 검색 취소 시 필터·스크롤 위치와 작성 중인 메시지를 유지하며, 한글 조합 중 Enter로 결과를 열지 않는다. 다른 창에서 사용 중인 세션은 사용 중으로 표시하고 선택에서 건너뛴다.
- 사이드바를 접으면 상단 Quick Search와 기존 단축키로 통합 검색을 사용할 수 있다. 다크·라이트 테마를 지원한다.

사용 방법: [워크스페이스 동작](workspace-interactions.md).
기존 서명 APK **1.8.1.39/code 21**을 포함하는 EXE 업데이트다.

## English

- Center **Quick Search** in the titlebar, using the existing global palette and configured shortcut for projects, sessions, split views, documents and commands. Keep titlebar tools and native window controls accessible in narrow windows.
- Replace the sidebar search icon with **Search sessions and projects** below New conversation. Show grouped project and session results across the catalog, independently of the selected project and activity filter. Search names, local/remote paths, virtual folder names and session providers.
- Open the selected project's machine, folder and conversation list while preserving other projects' fold states. Include empty projects and open sessions through the existing selection path.
- Support arrow keys, Enter, Esc and clearing. Preserve browse filters, scroll position and composer drafts when canceling search; ignore selection keys during IME composition and skip sessions owned by another window.
- Keep global Quick Search available when the sidebar is collapsed, with dark/light theme support. Reuse signed mobile APK **1.8.1.39**.

## 검증

- 전체 **177개 파일·1,196개 검사**와 버전 갱신 후 모바일 메타데이터·연결 검사 **24개**를 통과했다. npm 버전은 **1.8.1**, 제품 버전·Android 소스 versionName은 **1.8.1.67**이며 Android versionCode **21**의 기존 서명 APK를 재사용한다.
- 검색·사이드바·세션 검색·명령의 집중 검사 **6개 파일·43개 검사**를 통과했다.
- 별도 프로필의 실제 App 렌더러를 띄운 Electron 검사에서 통합 결과, 범위·필터와의 독립성, 한글 조합, 키보드·포인터 선택, 사용 중인 세션 보호, 빈 결과, 로컬·SSH·미분류 폴더 펼침, 목록 갱신, 초안·스크롤 유지와 접힘 상태 재실행 복원을 통과했다. 다크·라이트 및 800·1280·1440px 화면을 확인했다.
- TypeScript 검사와 프로덕션 빌드를 통과했다. 기존 큰 번들 크기 경고는 남아 있다.

전체 검사, 고정 소스의 EXE 빌드·패키지 검증과 공개 다운로드·업데이트 결과는 배포 완료 후 기록한다. IPC는 검사용이며 실제 사용자 세션·계정·클립보드를 조작하지 않는다.
