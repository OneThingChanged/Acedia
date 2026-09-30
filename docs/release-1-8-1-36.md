---
type: Release
title: Acedia 1.8.1.36 EXE release
description: Widen the desktop new-session dialog with two columns and persistent header and action buttons.
status: stable
last_updated: 2026-09-30
sources:
  - resource: session-creation.md
  - resource: exe-release-workflow.md
  - resource: ../app/src/components/NewAgentModal.tsx
  - resource: ../app/src/components/NewAgentModal.css
  - resource: ../app/src/components/SessionWorkerFields.tsx
  - resource: ../app/scripts/electron-new-session-smoke.mjs
---

# Acedia 1.8.1.36

- 데스크톱 **새 세션** 창을 최대 **1,016px**의 두 열로 넓혔다. 왼쪽은 세션 별칭·AI 도구·로그인/분산 계정·실행 옵션, 오른쪽은 문서·HTML 작업자 설정이다.
- 계정 설명은 선택창 아래 전체 너비로 표시하고, 작업자별 도구·모델·추론 강도를 한 행에 배치한다. 모델 직접 입력과 개별 작업자 비활성화도 유지한다.
- 헤더와 **취소·만들기** 버튼을 고정하고 본문만 스크롤한다. 820px 이하에서는 한 열로 전환하며, 작은 화면에서도 버튼을 유지한다. 고급 실행 설정은 아래 전체 너비에서 펼친다.
- Tab·Shift+Tab 포커스를 창 안에 유지하고, 설정 어디에서든 Esc로 취소한 뒤 이전 컨트롤에 포커스를 돌려준다. 바깥 클릭으로 창을 닫지 않는다.
- 기존 계정 선택, 도구별 실행 기본값, Dangerous·Alt-screen, SSH 제한과 생성 payload를 유지한다. 프로젝트 생성·세션 속성의 기존 작업자 배치에는 영향을 주지 않는다.
- [새 세션 사용법](session-creation.md), 한국어·영어 README와 개발 검증 안내를 정리하고 승인한 초안을 보존했다.
- Standard EXE와 같은 빌드의 `latest-exe.json`, blockmap을 제공한다. 서명 검증된 Android APK **1.8.1.28**을 재사용하며 Android 소스 versionName은 1.8.1.36으로 맞춘다. APK를 재빌드하지 않아 versionCode는 유지한다.

검증: 전체 소스 **139개 파일·865개 테스트**, 타입 검사, 새 세션 UI smoke와 기존 작업자 설정·고급 실행 회귀 smoke가 통과했다. 실제 생성 payload와 키보드 동작을 확인했으며 1366×768, 1920×1080, 1024×768, 390×844, 375×667, 844×375의 기본·고급 상태를 검증했다. 한국어·영어 및 Soft·Light·Warm 테마에서 가로 넘침과 하단 버튼 가림이 없다.

프로덕션 빌드, packaged bridge/Dashboard smoke와 packaged lifecycle smoke가 통과했다. 패키지의 JavaScript·CSS는 빌드 산출물과 바이트가 일치하며 두 열 UI가 포함되어 있다. 패키지 버전과 설치 파일 FileVersion은 **1.8.1.36**이다. 버전·APK 검증 관련 추가 **7개 테스트**도 통과했다.

- 설치 파일: `Acedia-Setup-1.8.1.36-x64.exe`
- 크기: **120420731 bytes**
- SHA-256: `ee91f909c1330ccc41d320ce4fd8eb98e3dd148e7e761d055a3dffd577f18a0f`
- 설치 파일·동일 빌드의 `latest-exe.json` 크기와 SHA-256 일치, blockmap 생성 확인.
- Authenticode: **NotSigned**. 파일 무결성 검증은 코드 서명을 대신하지 않는다.

[공개 EXE 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.36)의 게시·다운로드는 배포 단계에서 확인한다. 게시 완료와 사용 중인 PC의 설치 완료는 별도 상태다.
