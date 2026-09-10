---
type: Playbook
title: EXE와 Store 배포 채널
description: "독립 EXE의 GitHub 업데이트, Store와의 병행 설치, 릴리스 생성 및 검증 절차."
status: stable
last_updated: 2026-09-10
sources:
  - resource: ../app/electron/runtime-variant.cjs
    title: 채널별 설치·업데이트 분리
  - resource: ../app/electron/services/github-exe-update.mjs
    title: 네 자리 버전 GitHub EXE 업데이트
  - resource: ../app/scripts/build-electron-standard.mjs
    title: 설치 파일과 업데이트 manifest 생성
  - resource: ../app/electron/main.mjs
    title: 다운로드 및 세션 저장 후 설치
---

# EXE와 Store 배포 채널

2026-09-10 사용자 요청으로 Standard를 공개 EXE 채널로 전환했다.
이전의 Standard 로컬 개발자 업데이트 및 Store 단독 공개 배포 정책은 이 문서로 대체한다.

| 구분 | EXE (내부 variant: standard) | Microsoft Store |
| --- | --- | --- |
| 받는 곳 | GitHub Release의 Acedia-Setup 설치 파일 | Microsoft Store 제품 페이지 |
| 업데이트 | 설정의 Check → Update, GitHub에서 다운로드 | Microsoft Store가 관리 |
| 버전 | 네 자리 X.Y.Z.R 전체 비교 | Store 규칙에 맞는 X.Y.Z.0 |
| 설치 방식 | 사용자별 NSIS 설치 | MSIX |
| 데이터 | 공통 사용자 프로필 | 같은 공통 사용자 프로필 |
| 병행 사용 | 함께 설치하되 한 번에 한 채널 실행 | EXE를 덮어쓰지 않음 |

소스 1.8.0.4부터 두 채널은 [공통 사용자 데이터](shared-user-data.md)를 사용한다.
기존 데이터 이전·충돌 보존·동시 실행 제한은 해당 문서를 따른다.
이미 배포된 구버전에는 적용되지 않는다. 기존 Company variant는 별도 채널로 유지한다.

## 처음 전환할 때

이전 로컬 폴더 업데이트 방식의 Standard 설치본은 새 EXE를 한 번 직접 설치한다.
새 설치본은 설정의 Update 영역에 `EXE · GitHub`를 표시한다.
이후 Check로 새 버전을 확인하고 Update를 누르면 다운로드·검증 후 세션을 저장하고
설치 프로그램을 실행한다. Store 설치본의 Update 영역은 Store 열기를 제공한다.

## GitHub 배포

소스 버전·설치 파일명·Android 소스 versionName은 기존 네 자리 버전 규칙을 따른다.
npm 호환 버전은 세 자리로 유지한다. EXE 업데이트에는 별도 `latest-exe.json`을 사용해
네 번째 자리만 증가한 릴리스도 감지한다. Company의 `latest-company.yml`과 분리된다.

1. 버전을 갱신하고 테스트를 실행한다.
2. `app/`에서 `npm run release:build:github -- --desktop-only`를 실행한다.
   이 옵션은 기존 서명 검증된 APK를 재사용한다. APK 서명·패키지·아키텍처 검증은
   유지하고 데스크톱과 APK 버전 일치만 요구하지 않는다. 실제 포함된 APK 버전은
   `latest-exe.json`의 `bundledMobileVersion`에 기록한다. 새 APK는 생성하지 않는다.
   데스크톱과 모바일을 함께 갱신할 때는 새 APK를 준비하고 옵션 없이 빌드한다.
3. packaged smoke와 lifecycle smoke, 설치 파일 버전 및 해시를 확인한다.
4. 변경을 커밋·푸시하고 그 커밋에 대응하는 `vX.Y.Z.R` GitHub Release를 초안으로 만든다.
5. `Acedia-Setup-X.Y.Z.R-x64.exe`, 해당 `.blockmap`, `latest-exe.json`을 업로드하고
   검증 후 안정 릴리스로 게시한다. 원본 인증값·개인 경로·빌드 로그는 첨부하지 않는다.
6. 실제 GitHub에서 이전 버전 기준 감지 및 다운로드·해시 검증을 확인한다.

설치 파일과 manifest는 같은 빌드의 쌍이어야 한다. EXE 파일명·버전·크기·SHA-256,
공식 저장소의 해당 태그 URL이 일치하지 않으면 설치를 차단한다. draft/prerelease와
EXE manifest가 없는 Store/Company 릴리스는 업데이트 대상으로 선택하지 않는다.
현재 조회 범위는 GitHub의 최신 릴리스 100개다. 네트워크·API 제한 오류는 설정에 표시된다.

업데이트 버튼은 다운로드 후 설치를 시작하므로 사용자의 클릭이 필요하다.
게시 완료는 사용 중인 PC에 업데이트가 설치됐다는 뜻이 아니다.
기존 설치본의 최초 전환 및 실제 사용자 데이터 보존은 별도 설치 확인 항목이다.

EXE Authenticode 서명은 빌드 메시지로 판단하지 않고 `Get-AuthenticodeSignature`로
확인한다. 서명이 없는 배포본은 Windows의 실행 확인이 나타날 수 있다.
SHA-256 검증은 파일 무결성 확인이며 코드 서명을 대체하지 않는다.

Store 배포는 [별도 Store 워크프로세스](store-release-workflow.md)를 따른다.
