---
type: Release
title: Acedia 1.8.1.37 EXE release
description: Separate blue Sleeping sessions from Active sessions with persistent sidebar filters and counts.
status: stable
last_updated: 2026-09-30
sources:
  - resource: workspace-interactions.md
  - resource: idle-sessions.md
  - resource: session-lifecycle-and-resume.md
  - resource: exe-release-workflow.md
  - resource: ../app/src/components/Sidebar.tsx
  - resource: ../app/src/components/Sidebar.test.tsx
  - resource: ../app/src/lib/sessionStandby.ts
---

# Acedia 1.8.1.37

- 파란 복원·시작 대기 세션을 **Sleeping**으로 표시하고 상태 안내를 제공한다. 실행 중인 세션과 분류를 분리한다.
- 왼쪽 검색창 아래에 **전체 / Active / Sleeping** 버튼과 각 분류의 전체 세션 수를 표시한다. Active에는 실행·시작·복구 중 세션과 작업·질문·권한 대기 상태를 포함한다.
- 검색은 선택한 상태 안에서 적용한다. 일치하는 세션이 없는 프로젝트·프로젝트 폴더·머신은 숨기고, 결과가 없으면 검색과 필터를 초기화할 수 있다.
- 선택한 필터를 저장하며 기존 활성만 보기 설정을 Active로 이전한다. 세션 재개 시 상태와 개수가 바뀐다. 비활성·미실행 세션은 전체에서 확인한다.
- 좁은 사이드바에서는 버튼을 줄바꿈하고, 키보드 포커스와 선택 상태를 제공한다. 한국어·영어 및 지원 언어의 라벨·안내를 반영한다.
- [워크스페이스 사용법](workspace-interactions.md), [세션 복원](session-lifecycle-and-resume.md), [유휴 자동 중지](idle-sessions.md) 및 한국어·영어 README를 갱신했다.
- Standard EXE와 같은 빌드의 `latest-exe.json`, blockmap을 제공한다. 서명 검증된 Android APK **1.8.1.28**을 재사용하며 Android 소스 versionName은 1.8.1.37로 맞춘다. APK를 재빌드하지 않아 versionCode는 유지한다.

검증: **139개 파일·870개 테스트**를 확인했다. Windows 사용량 서버 설치 테스트 **2개**는 단독 실행에서 통과했고, 나머지 **138개 파일·868개 테스트**는 `--testTimeout 15000`으로 통과했다. 전체 병렬 실행에서 Windows 모의 검증의 5초 제한, 사용량 서버 설치의 30초 제한 및 worker 종료가 발생했기 때문에 실행을 분리했으며 제품 코드나 테스트는 변경하지 않았다.

실제 Electron에서 전체·Active·Sleeping 전환, 프로젝트/폴더/경로 검색과 필터의 교집합, 빈 결과 초기화, 시작 시 상태·개수 갱신, 키보드 조작, 재로드 후 저장 복원을 확인했다. 사이드바 170·220·300px, 한국어·영어·일본어·스페인어, Soft·Light·Warm 테마에서 버튼 라벨 가림과 가로 넘침이 없다.

문서 OKF 검증은 **오류 0·기존 날짜 경고 1**로 통과했다. 경고는 `known-limitations.md`의 기존 `stale_after` 날짜다. 프로덕션 타입 검사와 빌드가 통과했다.

패키지 bridge/Dashboard 및 lifecycle smoke가 통과했다. 최초 병렬 실행의 bridge 검증에서 창 종료 오류가 발생해 단독으로 다시 실행했으며 모든 검증 마커와 종료 코드 0을 확인했다. lifecycle 검증은 앱 종료·트레이·보안 경로를 통과했다. 패키지의 JavaScript·CSS는 빌드 산출물과 바이트가 일치하고 Sleeping 필터가 포함되어 있다.

- 설치 파일: `Acedia-Setup-1.8.1.37-x64.exe`
- 패키지 제품 버전·설치 파일 FileVersion: **1.8.1.37**
- 크기: **120421733 bytes**
- SHA-256: `eb432fe0cbcc8507d24cdf90939f44325c513a556cb62fa91ce9f0770ee69722`
- 설치 파일과 동일 빌드의 `latest-exe.json` 크기·SHA-256 일치, blockmap 생성 확인.
- Authenticode: **NotSigned**. 파일 무결성 검증은 코드 서명을 대신하지 않는다.

[공개 EXE 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.37)의 게시·공개 업데이트 감지·다운로드 해시는 배포 단계에서 확인한다. 게시 완료와 사용 중인 PC의 설치 완료는 별도 상태다.
