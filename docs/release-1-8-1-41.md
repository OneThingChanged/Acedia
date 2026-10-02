---
type: Release
title: Acedia 1.8.1.41 compact creation dialogs
description: Shorten project and Codex session creation, preserve settings and batch the large timeline test fixture.
status: stable
last_updated: 2026-10-02
sources:
  - resource: ../app/src/components/NewProjectModal.tsx
  - resource: ../app/src/components/NewAgentModal.tsx
  - resource: ../app/src/components/NewAgentModal.css
  - resource: ../app/src/components/SessionWorkerDisclosure.tsx
  - resource: ../app/src/hooks/useCreationDialog.ts
  - resource: ../app/scripts/electron-new-session-smoke.mjs
  - resource: ../app/electron/usage-collector/collector.test.mjs
  - resource: ../app/scripts/publish-github-exe.ps1
  - resource: ../.github/workflows/release-exe.yml
---

# Acedia 1.8.1.41

## 구현

- 새 프로젝트 창은 최대 920px의 두 열로 프로젝트와 첫 세션 설정을 배치한다. 1366×768 화면에서 기본 높이는 약 629px이다.
- 새 세션 창은 최대 720px로 줄였다. 문서·HTML 작업자와 고급 실행 설정은 필요할 때 펼치고, 작업자의 현재 모델·추론 강도나 사용 안 함 상태를 접힌 영역에 표시한다.
- 두 창의 제목과 취소·만들기 버튼은 항상 보인다. 작은 화면이나 펼친 설정은 본문에서 스크롤하고, 좁은 화면은 한 열로 전환한다.
- 계정·작업자 기본값과 수정값, 실행 플래그, 고급 경로, 로컬·SSH 폴더와 사이드바 폴더 선택을 유지한다. Tab·Shift+Tab은 창 안에서 순환하고 Esc는 취소하며 닫힌 뒤 기존 포커스를 복원한다.
- EXE만 갱신하며 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다.

## 검증

1.8.1.40 후보의 UI와 동일한 소스다. 관련 검사 17개와 실제 Electron의 두 창·22개 화면 조합이 통과했다. 한국어·영어, Soft·Light·Warm 테마, 기본·작업자·고급 상태, 모바일·가로 화면에서 가로 넘침 없이 하단 버튼을 노출했다.

[이전 후보](release-1-8-1-40.md)의 두 러너 실행에서 발견한 기존 대용량 집계 fixture를 수정했다. 502개 이벤트를 한 SQLite transaction으로 준비해 개별 fsync 때문에 loopback 연결이 유휴 제한을 넘기는 상황을 피한다. 이벤트 개수·합계·권한·날짜·모델·비용 검증은 그대로 유지한다. 원격 전체 검사는 60초 제한·동시 worker 2개로 실행한다.

수정 후 로컬 전체 **141개 파일·899개 테스트**가 60초 제한·동시 worker 2개로 통과했다. TypeScript/Vite·NSIS 프로덕션 EXE 빌드, packaged bridge/Dashboard·lifecycle 검증이 종료 코드 0으로 통과했다. 종료·트레이·보안 성공 마커를 확인했다. 빠른 PTY 종료의 `AttachConsole failed`, 트레이 fixture의 `Object has been destroyed`와 종료 시 GPU 로그도 관찰했으므로 전체 로그가 무오류였다고 해석하지 않는다.

로컬 후보 설치 파일·앱 FileVersion은 **1.8.1.41**, 설치 파일 크기는 **120,394,980 bytes**, SHA-256은 `3cab8ff6df522dc655895bcb762761f356e5cf0c565c8a0c01f9d836a2d5a82b`이다. 같은 빌드의 manifest·blockmap을 확인했으며 Authenticode는 **NotSigned**다. APK는 기존 공개 SHA-256 `f04502319e96f1cf3e2fb1a949ec6ae81dcefad4443877f31ca36c8c15190957`과 일치하며 릴리스 서명·패키지·ARM64·non-debuggable 상태를 검증해 재사용한다.

## 공개 배포

2026-10-02 **14:25:31 KST**, [v1.8.1.41](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.41)을 최신 안정 릴리스로 게시했다. 태그와 릴리스 대상은 고정 제품 소스 `9de668062d12217c40f28fe10be02bd38f95dcb4`이며, APK·Store·Company 자산은 새로 게시하지 않았다.

[최종 빌드](https://github.com/OneThingChanged/Acedia/actions/runs/36968128359)에서 전체 **141개 파일·899개 테스트**, 생성 창 상호작용·**22개 화면 조합**, native PTY, TypeScript/Vite·NSIS 빌드와 packaged bridge/Dashboard·lifecycle 검증이 통과했다. Windows 설치·watcher와 PowerShell의 자체 대기 제한 때문에 전체 검사를 139개 파일·878개 테스트, 단독 2개 테스트, 단독 19개 테스트로 나눴다. 검증 조건은 유지하고 빌드 단계의 자동 게시는 차단했다.

이 빌드의 초안에 올린 파일은 모두 검증됐으나 GitHub 태그별 조회가 초안을 반환하지 않아 게시 단계가 실패했다. [게시 실행](https://github.com/OneThingChanged/Acedia/actions/runs/36968846100)은 앞선 필수 검사 성공과 소스 로그를 확인하고, 기존 초안의 세 파일을 내려받아 버전·manifest·크기·GitHub SHA-256·태그를 재검증한 뒤 같은 자산을 릴리스 ID로 게시했다. 배포 스크립트도 초안 목록과 릴리스 ID를 사용하도록 수정했다. CI와 배포 도구의 변경은 EXE 포함 대상 밖이며 제품 소스는 유지했다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.41-x64.exe` | 120,878,592 | `d4cbfac4b14b70bd63a6060f7b8b641c654f166713893912850bd60dd73b8de0` |
| `Acedia-Setup-1.8.1.41-x64.exe.blockmap` | 126,686 | `edb16ee401f3d082a4481eb9093f01f498165101d9f5ea80ebcc62f7af6e09a4` |
| `latest-exe.json` | 256 | `893dbeed4e1dd9773d843e3387aec7125d91ccfe47b4e4aebabe10178410e84e` |

공개 설치 파일의 FileVersion은 **1.8.1.41**, Authenticode는 **NotSigned**다. 로컬 후보와 러너 산출물의 해시는 서로 다르며, 위 표와 공개 manifest는 같은 러너 빌드의 쌍이다.

14:26:25 KST에 프로덕션 업데이터로 **1.8.1.39 → 1.8.1.41 감지·실제 다운로드·설치 전 해시 검증**을 완료했다. 공개 세 자산의 크기·SHA-256, 최신 안정 릴리스, 제품 태그와 재사용 APK 버전도 확인했다. 사용자 PC의 설치 프로그램은 실행하지 않았으며 업데이트 설치·재시작은 사용자 앱의 설정에서 진행한다.
