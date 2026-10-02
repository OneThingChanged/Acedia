---
type: Release
title: Acedia 1.8.1.40 compact creation dialogs
description: Shorten the project and Codex session creation dialogs while preserving account, worker and launch settings.
status: stable
last_updated: 2026-10-02
sources:
  - resource: ../app/src/components/NewProjectModal.tsx
  - resource: ../app/src/components/NewAgentModal.tsx
  - resource: ../app/src/components/NewAgentModal.css
  - resource: ../app/src/components/SessionWorkerDisclosure.tsx
  - resource: ../app/src/hooks/useCreationDialog.ts
  - resource: ../app/scripts/electron-new-session-smoke.mjs
  - resource: ../app/scripts/publish-github-exe.ps1
  - resource: ../.github/workflows/release-exe.yml
---

# Acedia 1.8.1.40

## 구현

- 새 프로젝트 창을 최대 920px의 두 열로 배치해 프로젝트 이름·위치·폴더와 첫 세션 설정을 함께 확인한다. 기본 창 높이는 1366×768 화면에서 약 629px이다.
- 새 세션 창은 최대 720px로 줄였다. 문서·HTML 작업자와 고급 실행 설정은 필요할 때 펼치며, 접힌 작업자 영역에는 현재 모델·추론 강도나 사용 안 함 상태가 보인다.
- 두 창의 제목과 취소·만들기 버튼은 항상 보인다. 작은 화면이나 펼친 설정은 본문에서 스크롤하고, 좁은 화면은 한 열로 전환한다.
- 계정·작업자 기본값과 수정값, 실행 플래그, 고급 경로, 로컬·SSH 폴더와 사이드바 폴더 선택을 유지한다. Tab·Shift+Tab은 창 안에서 순환하고 Esc는 취소하며 닫힌 뒤 기존 포커스를 복원한다.
- EXE만 갱신한다. 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용하며 새 APK는 생성하지 않는다.

## 검증

관련 컴포넌트·작업자 검사 17개와 실제 Electron의 두 창·22개 화면 조합 검증이 통과했다. 한국어·영어, Soft·Light·Warm 테마, 기본·작업자·고급 설정과 모바일·가로 화면을 포함한다. 일반 데스크톱의 기본 설정은 스크롤 없이 표시하고 모든 조합에서 가로 넘침 없이 하단 버튼을 노출했다.

기존 APK는 이전 공개 자산과 SHA-256이 일치하며 apksigner와 aapt2로 릴리스 서명, 패키지, ARM64, versionName/code와 non-debuggable 상태를 확인했다. SHA-256은 `f04502319e96f1cf3e2fb1a949ec6ae81dcefad4443877f31ca36c8c15190957`이다.

전체 **141개 파일·899개 테스트**, TypeScript/Vite 프로덕션 빌드, 실제 native PTY, packaged bridge/Dashboard와 lifecycle 검증이 통과했다. 패키지의 renderer HTML·JS·CSS와 Electron 진입점은 로컬 빌드 바이트와 일치하고, 앱·설치 파일 버전은 1.8.1.40이다. APK 바이트도 위 공개 서명 APK와 일치한다. Bridge 검증의 빠른 PTY 종료 경로에는 이전 릴리스와 같은 `AttachConsole failed` 로그가 관찰됐으며 성공 마커와 종료 코드 0을 확인했다.

로컬 후보 EXE는 120,395,151 bytes이며 SHA-256은 `2ee88fcfbd5efca469190bd61d5467ad2e0f5050c353321116541baf494974c0`이다. 같은 빌드의 manifest·blockmap을 확인했으며 Authenticode는 **NotSigned**이다. GitHub 러너에서 다시 빌드한 게시 산출물의 해시는 배포 완료 후 별도로 기록한다.

GitHub의 `Publish Standard EXE` 워크플로우는 `release/exe/1.8.1.40` 브랜치 생성 또는 수동 실행으로 고정 소스를 다시 검사·빌드한다. 초안에 EXE·blockmap·같은 빌드의 `latest-exe.json`을 올리고 업로드 크기·SHA-256과 태그 커밋을 확인한 다음 안정 릴리스로 게시한다. 일반 main 변경만으로 배포를 실행하지 않는다.

## 공개 배포

게시와 실제 공개 업데이터 다운로드 검증은 배포 완료 후 기록한다. 실행 중인 사용자 앱과 세션의 설치·재시작은 별도다.
