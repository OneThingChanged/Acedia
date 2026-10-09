---
type: Release
title: Acedia 1.8.1.72
description: "스크린별 색상·Codex/Claude 로고와 작업 중 질문 표시 개선."
status: draft
last_updated: 2026-10-09
---

# Acedia 1.8.1.72

## 변경 내용

- **스크린별 색상**으로 분할 화면을 구별한다. 분할 화면의 아이콘·S 번호·선택 표시와 소속 세션의 왼쪽 표시·S 배지가 같은 색을 사용한다. 최근 대화, 프로젝트를 펼친 세션 목록, 검색 결과에 동일하게 적용하며 라이트 테마에서는 작은 번호의 대비를 높인다. 상태 점과 S 번호도 유지한다.
- 사이드바에서 **Codex·Claude 전용 로고**로 제공자를 표시한다. 대화 제목 앞에 로고를 두고 프로젝트·상태 정보에서 반복되던 제공자 글자를 제거했다. 프로젝트 세션, 검색 결과, 보관 대화와 세션 선택 목록에서도 로고를 표시하며 이름은 툴팁과 접근성 레이블로 확인할 수 있다. SVG를 앱에 포함하여 별도 네트워크 요청 없이 표시한다.
- Codex의 **작업 중 질문이 Chat·Remote에 보이지 않던 문제**를 수정했다. 현재 `Shift+Tab`과 이전 `Shift+↑`·`Shift+Up` 안내를 인식한다. 입력창 위 질문 폼에서 선택하거나 직접 입력하면 현재 단축키로 네이티브 폼을 열고 질문·선택 상태를 확인한 뒤 답변을 전달한다. 일부 답변 후에는 남은 질문만 표시한다.
- 질문이 사라졌거나 다른 질문으로 바뀌면 답변을 중단한다. 일반 예약 메시지에는 답변 키를 보내지 않으며 기존 중복 제출·변경된 폼 보호와 단일 Working 상태 표시를 유지한다.

사용 방법: [워크스페이스 동작](workspace-interactions.md).
기존 서명 APK **1.8.1.39/code 21**을 포함하는 EXE 업데이트다.
1.8.1.71은 로컬 빌드까지 완료한 뒤 새 사이드바 요청을 추가하여 이 버전으로 통합했다. 1.8.1.71은 공개하지 않았다.

## English

- Distinguish split screens by color. Match each screen's icon, S number and selection with the color rail and badge on its conversations, including expanded projects and search results. Improve small-label contrast in the light theme.
- Show dedicated Codex and Claude logos beside conversation titles instead of repeated provider names. Bundle SVG paths locally and preserve accessible names and tooltips across recent, nested, search, archive and session-picker lists.
- Fix missing Codex questions during work in Chat and Remote. Recognize current Shift+Tab and older Shift+Up hints, open the native form with its advertised shortcut, verify the question, and deliver choices or free text. Keep unanswered questions after partial responses and preserve stale-form protection.

## 검증

- 사이드바 격리 Electron 검사에서 두 스크린의 색 구별, 소속 세션과 배지의 색 일치, Codex·Claude 로고·접근성 이름, 펼친 프로젝트의 34px 이하 행을 다크·라이트 테마에서 확인했다. 기존 검색·프로젝트 접기·보관·알림·스크린 이름 변경/해제·리사이즈·800/1280px 검사도 통과했다.
- 앞선 질문 파싱·실제 호스트 `currentQuestion` 화면 판별·답변 전송 관련 **56개 검사**와 Desktop·Remote 질문 검사를 통과했다. 긴 한글 질문의 **800·420px** 화면에서 질문·전송 버튼, 일부 답변 후 남은 질문과 단일 Working 표시를 검증했다.
- 실제 격리 Codex CLI의 동기 질문에서 선택·직접 입력·두 질문·작업 재개 회귀 검사를 통과했다. 로컬 mock transport에 비동기 도구가 노출되지 않아 실제 CLI의 비동기 입력은 이 실행으로 검증하지 못했다. 새 단축키의 비동기 경로는 실제 호스트 함수와 답변 서비스 검사로 검증했다.
- 1.8.1.71 전체 검사 첫 실행에서는 원격 Markdown 미리보기 1개가 HTTP 500으로 실패했다. 단독 재실행과 전체 **180개 파일·1,242개 검사** 재실행은 통과하여 원인을 재현하지 못했다. 이후 실패 시 응답 본문을 출력하도록 해당 assertion의 진단 정보를 추가했고 최초·재실행 증빙을 모두 보존한다.
- 최종 1.8.1.72 소스의 전체 **180개 파일·1,242개 검사**, 모바일 **24개 검사**를 모두 통과했다. 최종 실행은 실패·건너뛴 검사가 없다.
- 제품 버전·Android 소스 versionName은 **1.8.1.72**, npm은 **1.8.1**이다. 새 APK를 생성하지 않아 기존 서명 APK **1.8.1.39/code 21**을 재사용한다. 앞선 실행에서 패키지·아키텍처·서명 인증서·SHA-256을 검증했다.
- TypeScript·Vite 프로덕션 빌드를 통과했다. 기존 큰 번들 경고는 유지된다.
- 고정 소스 EXE 빌드·패키지 실행·공개 다운로드 검증은 배포 과정에서 기록한다.

로컬 증빙: `output/sidebar-screen-provider-smoke-1.8.1.72.log`,
`output/sidebar-workspace-app/sidebar-screen-identity-dark.png`,
`output/sidebar-workspace-app/sidebar-screen-identity-light.png`,
`output/codex-async-question-tests.log`, `output/codex-async-question-chat-smoke.log`,
`output/codex-question-cli-regression.log`, `output/full-suite-exe-1.8.1.71-rerun.json`,
`output/full-suite-exe-1.8.1.72.json`, `output/full-suite-exe-1.8.1.72.log`,
`output/mobile-tests-exe-1.8.1.72.log`.

로고 출처: Codex는 [LobeHub lobe-icons의 Codex SVG](https://github.com/lobehub/lobe-icons/blob/master/packages/static-svg/icons/codex.svg) (MIT), Claude는 [공식 favicon SVG](https://claude.ai/favicon.svg)의 원본 경로를 사용한다. Codex SVG 배포처는 커뮤니티 아이콘 프로젝트다. 원본 MIT 고지는 `app/public/lobe-icons-LICENSE.txt`로 패키지에 포함한다.

## 배포 상태

EXE 빌드·배포 진행 중. 기존 서명 APK를 재사용한다.
