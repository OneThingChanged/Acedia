---
type: Release
title: Acedia 1.8.1.67
description: "상단 중앙 Quick Search와 사이드바 프로젝트·세션 통합 입력 검색."
status: stable
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
- 고정 소스의 Standard EXE 빌드와 패키지 bridge·Dashboard·Git·네이티브 PTY·종료·트레이·보안 검사를 통과했다. 패키지 renderer·runtime **275개 파일**이 빌드 원본과 일치한다. 콘솔 목록 보조 프로세스의 `AttachConsole failed` 진단 8회와 종료 시 GPU 진단 2회는 직전 버전 로그와 같으며 필수 검증은 모두 통과했다.
- 설치 파일 FileVersion **1.8.1.67**, 크기·SHA-256과 같은 빌드의 `latest-exe.json` 일치를 확인했다. EXE Authenticode 상태는 기존 채널과 같은 `NotSigned`이다. 포함된 APK **1.8.1.39/code 21**의 인증서·패키지·아키텍처·해시를 검증했다.
- 공개 업데이터의 **1.8.1.65·1.8.1.66 → 1.8.1.67** 감지와 공개 설치 파일 다운로드를 통과했다. EXE·blockmap·manifest의 크기·해시, 최신 안정 릴리스와 소스 태그가 일치한다.

실제 사용자 앱의 설치·재시작과 Android 기기 동작은 별도 검증이다. UI 검사의 IPC는 검사용이며 실제 사용자 세션·계정·클립보드를 조작하지 않는다.

## 공개 배포

- [GitHub 안정 릴리스 v1.8.1.67](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.67)를 2026-10-08 **16:35:50 KST**에 게시했다.
- 소스·태그는 `09e02efb52618e07026d8f6080aacc5b09938265`이며 `origin/main`에 푸시한 같은 소스를 빌드했다. Microsoft Store 제출과 신규 APK 빌드는 실행하지 않았다.
- **16:37:31 KST**에 공개 다운로드·업데이트 검증을 완료했다. 사용 중인 앱·세션을 재시작하거나 설치 프로그램을 실행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.67-x64.exe` | 151310726 | `fd563f57ccb2482e3ae6220c2333a5f65b16e52b38cb67c9548409b896f0db0f` |
| `Acedia-Setup-1.8.1.67-x64.exe.blockmap` | 159479 | `2f78795f31f7ee8f3cdf98fd68d629619e0c05886917e518507318e0723c1436` |
| `latest-exe.json` | 256 | `136dd3e5b16ebf0410a3a540403d5609e5163b6b35999e73679ce9614b6d440c` |

로컬 증빙: `output/full-suite-exe-1.8.1.67-summary.json`, `output/full-suite-exe-1.8.1.67.json`, `output/mobile-tests-exe-1.8.1.67.log`, `output/sidebar-workspace-app/`, `output/build-exe-1.8.1.67.log`, `output/packaged-smoke-1.8.1.67.log`, `output/packaged-lifecycle-1.8.1.67.log`, `output/public-update-verification-1.8.1.67.log`, `output/exe-release-1.8.1.67/local-verification.json`, `output/exe-release-1.8.1.67/public-verification.json`.
