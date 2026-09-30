---
type: Release
title: Acedia 1.8.1.33 EXE release
description: Configure automatic or manual Codex session account selection, with automatic distribution as the default.
status: stable
sources:
  - resource: account-pool.md
  - resource: ../app/src/lib/agentDefaults.ts
  - resource: ../app/src/lib/sessionLaunchAccount.ts
  - resource: ../app/src/components/AgentsSettings.tsx
---

# Acedia 1.8.1.33

- **설정 → 에이전트 → Codex → 세션 시작 계정 선택**에서 자동·수동을 선택한다. 기본값은 **자동 + 자동 배정**이며 이미 저장한 선택은 유지한다.
- 자동은 계정 선택 창 없이 시작하고, 자동 배정 또는 특정 분산 계정을 기본값으로 사용할 수 있다. 세션에 지정한 계정이 우선이며 지정하지 않은 세션에는 기본값을 적용한다. 사용 불가·제거된 특정 계정은 시작을 막고 설정과 Usage 확인을 안내한다.
- 수동은 데스크톱 세션 시작·재시작 시 계정을 묻는다. 새 프로젝트와 새 로컬 세션에도 자동 기본값을 복사하고 생성 화면의 직접 선택을 우선한다. Remote에서 생성한 로컬 세션도 지정한 계정이 없으면 자동 기본값을 사용한다.
- 설정은 자동 저장되고 새 창에서 복원된다. 설정 검색에서 계정 선택 방식과 자동 시작 기본 계정으로 이동할 수 있다.
- Standard EXE를 배포하며 기존에 서명·검증한 Android APK **1.8.1.28**을 재사용한다. Android 소스 versionName은 1.8.1.33으로 맞추며 APK를 재빌드하지 않아 versionCode는 유지한다.

검증: 전체 테스트 **809개**가 Windows 프로세스 시작 시간을 고려한 `--testTimeout 30000`으로 통과했다. 프로덕션 빌드, 터미널 실행, 계정 시작 설정 전용 UI·레이아웃·새 창 복원, packaged smoke와 lifecycle smoke가 통과했다. 전체 설정 검색 smoke는 기존 `browser.profiles` 검증에서 중단되어 이번 UI 검증 결과에는 포함하지 않았다.

설치 파일 FileVersion은 **1.8.1.33**, NSIS의 호환 ProductVersion은 **1.8.1**이다. 설치 파일 크기와 SHA-256은 같은 빌드의 `latest-exe.json`과 일치하며 blockmap을 함께 게시한다. EXE의 Authenticode 상태는 기존 배포와 같은 **NotSigned**다. 릴리스 게시는 사용 중인 PC에 업데이트가 설치됐다는 뜻이 아니며, 실제 사용자 프로필의 설치·업데이트는 별도로 확인한다.
