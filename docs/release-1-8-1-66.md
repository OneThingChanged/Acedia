---
type: Release
title: Acedia 1.8.1.66
description: "요청·답변 구분, 인용·요청 재사용·결과물 카드와 채팅 이미지 깜박임 수정."
status: stable
last_updated: 2026-10-08
---

# Acedia 1.8.1.66

## 변경 내용

- 사용자 요청은 오른쪽 말풍선, 에이전트 답변은 왼쪽 본문으로 구분한다. Acedia 아이콘·공급자·작성자를 표시하고 일반 UI 글꼴과 코드 고정폭 글꼴을 분리한다. 여러 첨부 이미지는 좁은 창에서도 말풍선 안에서 줄바꿈한다.
- 대화 갱신마다 이미지를 다시 생성해 로딩이 반복되는 문제를 수정했다. 마크다운 이미지 컴포넌트와 대화 항목의 식별자를 유지해 상태 갱신·답변 추가·이전 기록 로딩에서도 이미지를 유지한다. 이미 준비된 이미지 데이터는 바로 표시하며 이전 대화를 읽는 중에는 최신 위치로 끌어당기지 않는다.
- 답변 전체 또는 선택한 부분을 인용해 새 요청을 작성할 수 있다. 기존 요청을 입력창에 가져와 수정 후 새 메시지로 보낼 수 있고, 작성 중인 초안과 원래 대화 기록을 유지한다. 인용은 최대 2,000자이며 세션 전환 후에도 해당 초안과 함께 유지한다.
- 결과물은 파일명·종류·크기 카드로 표시하고 작업 공간의 문서·이미지 미리보기로 연다. 입력창 위의 현재 작업·경과 시간 표시와 `작업 내역` 버튼으로 최근 도구 로그를 확인한다.

사용 방법: [워크스페이스 동작](workspace-interactions.md).
별도 검색 배치 요청은 [HTML 초안](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.66/docs/mockups/chat-workspace-v2.html)에 반영했다. 상단 중앙 Quick Search와 사이드바 프로젝트·세션 통합 검색은 이 초안에서 검토하는 동작이며 앱 적용은 별도 구현 단계다.
기존 서명 APK 1.8.1.39/code 21을 포함하는 EXE 업데이트다.

## English

- Distinguish right-aligned user bubbles from left-aligned assistant responses, with author/provider labels and the Acedia icon. Use a proportional UI font for narrative, retain monospace code and wrap multiple attachment previews in narrow panes.
- Keep loaded images mounted across status refreshes, appended responses and older-history loading. Stabilize Markdown renderer component types and conversation keys, paint supplied image data directly and preserve the reader's position above the latest message.
- Quote a response or selected passage in a new request, up to 2,000 characters. Reuse and edit a previous request in the composer while preserving the draft and original history; send it as a new message. Keep references and drafts isolated per session.
- Open visible artifact cards through workspace previews and reveal recent tool logs using the pinned work indicator's details button.
- Include a separate HTML search-layout draft with centered Quick Search and inline sidebar results for projects and sessions. Reuse signed mobile APK 1.8.1.39.

## 검증

- 전체 **177개 파일·1,193개 검사**의 통과를 확인했다. 최초 실행에서 Git이 PATH에 없어 격리 소스 생성 검사 7개가 실패했고, 내장 Git 경로를 설정해 해당 파일 19개 검사를 재실행해 모두 통과했다. 다른 파일은 최초 검사에서 모두 통과했다.
- 버전 갱신 후 모바일 메타데이터·연결 검사 **24개**를 통과했다. npm 버전은 **1.8.1**, 제품 버전·Android 소스 versionName은 **1.8.1.66**이며 기존 APK를 재사용한다.
- 채팅·마크다운·파일 경로·대화 기록·작업 상태의 집중 검사 **18개**와 실제 Electron의 데스크톱·시작 질문·Remote 1024/390px 검사를 통과했다. 같은 이미지 DOM 유지와 파일·원본 첨부 재읽기 방지를 상태 갱신, 답변 추가, 이전 대화 로딩에서 확인했다.
- 요청·답변 정렬, 인용·요청 재사용, 초안 분리, 결과물 열기, 이미지 뷰어·복사, 큐·중지·로그인 가드와 다크·라이트 및 420/800/1280px 배치를 검증했다. IPC·클립보드·파일 선택은 격리된 fixture를 사용했다.
- 검색 HTML은 기존 동작을 포함한 **46개 검사**를 통과했다. 프로젝트·세션 통합 결과, 키보드 선택, 프로젝트 펼침, 빈 결과, 검색 취소와 초안 유지, 검색 창 간 포커스 분리 및 390px 배치를 확인했다. 실제 사용자 대화·클립보드를 조작하지 않았다.
- 고정 소스의 TypeScript·Vite와 Standard EXE 빌드, 패키지 bridge·Dashboard·Git·네이티브 PTY·종료·트레이·보안 검사를 통과했다. 패키지 renderer·runtime **275개 파일**이 빌드 원본과 일치한다. 콘솔 목록 보조 프로세스의 `AttachConsole failed` 진단 8회는 직전 버전과 같으며 네이티브 PTY와 계정 관리 검증은 통과했다.
- 설치 파일 FileVersion **1.8.1.66**, 크기·SHA-256과 같은 빌드의 `latest-exe.json` 일치를 확인했다. EXE Authenticode 상태는 기존 채널과 같은 `NotSigned`이다. 포함된 APK **1.8.1.39/code 21**의 인증서·패키지·아키텍처·해시를 검증했다.
- 공개 업데이터가 **1.8.1.64·1.8.1.65 → 1.8.1.66**을 감지한다. 공개 설치 파일을 실제로 내려받아 검증했고 EXE·blockmap·manifest의 크기·해시, 최신 안정 릴리스와 소스 태그가 일치한다.

실제 사용자 앱의 설치·재시작, OS 파일 선택·클립보드와 Android 기기 동작은 별도 검증이다.

## 공개 배포

- [GitHub 안정 릴리스 v1.8.1.66](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.66)를 2026-10-08 **14:56:21 KST**에 게시했다.
- 소스·태그는 `b4cf56a181a6dce194dd254c01ff16c1f7c0c49d`이며 `origin/main`에 푸시한 같은 소스를 빌드했다. Microsoft Store 제출과 신규 APK 빌드는 실행하지 않았다.
- **14:57:24 KST**에 공개 다운로드·업데이트 검증을 완료했다. 사용 중인 앱·세션을 재시작하거나 설치 프로그램을 실행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.66-x64.exe` | 151309176 | `7450b802a8fe08481cf415aada2fa8a8f379766f471d73649f8ff3522ef05c33` |
| `Acedia-Setup-1.8.1.66-x64.exe.blockmap` | 159476 | `3c1b4d1494aa7e6b8b81f2a2a04ebf4a9137c06b72f12d2697f69a995b02abbf` |
| `latest-exe.json` | 256 | `e0d9e77ebe175314ba668bc15eb502e245da5644447bb283ec0eb93c6aa8cd3f` |

로컬 증빙: `output/full-suite-exe-1.8.1.66-summary.json`, `output/full-suite-exe-1.8.1.66.json`, `output/full-suite-exe-1.8.1.66-git-recheck.json`, `output/mobile-tests-exe-1.8.1.66.log`, `output/chat-smoke-exe-1.8.1.66.log`, `output/build-exe-1.8.1.66.log`, `output/packaged-smoke-1.8.1.66.log`, `output/packaged-lifecycle-1.8.1.66.log`, `output/public-update-verification-1.8.1.66.log`, `output/exe-release-1.8.1.66/local-verification.json`, `output/exe-release-1.8.1.66/public-verification.json`, `output/chat-ux-research/verification.json`.
