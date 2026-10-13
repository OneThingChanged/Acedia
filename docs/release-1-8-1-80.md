---
type: Release
title: Acedia 1.8.1.80
description: "앱 시작 시 EXE 업데이트 안내, 줄바꿈된 영상 링크 수정과 내장 Git 설정 검사 보강."
status: stable
last_updated: 2026-10-13
---

# Acedia 1.8.1.80

## 변경 내용

- 앱을 새로 켜면 공개 EXE 업데이트를 백그라운드로 확인하고, 새 버전이 있으면 **지금 업데이트 / 나중에**를 표시한다. 여러 작업창에서도 한 번만 묻고, 나중에를 선택하면 다음 앱 실행 때 다시 확인한다.
- 업데이트 버튼을 누른 뒤 다운로드 진행률과 실패 시 재시도를 제공한다. 설치 파일 크기·SHA-256 검증 후 열린 세션을 저장하고 앱을 다시 시작한다. 조회 실패·오프라인은 시작을 막지 않는다. 기존 설정의 Check → Update도 지원한다.
- 터미널에서 두 줄에 걸친 영상·파일 경로를 클릭하면 전체 경로를 전달한다. Codex가 줄 끝에 여백을 남기거나 다음 줄의 글자색을 바꿔도 파일 경로를 폴더로 잘못 인식하지 않는다.
- 내장 Git 빌드 검사에서 버전뿐 아니라 설정 파일을 실제로 읽는다. 손상된 설정을 `GIT_CONFIG_NOSYSTEM`으로 숨긴 환경에서도 실패로 처리한다.

Standard EXE 업데이트다. 기존 서명 APK **1.8.1.39/code 21**을 포함하며 새 APK와 Microsoft Store 제출은 만들지 않는다. 이전 설치본에서 이번 버전을 적용할 때는 설정의 **Check → Update**를 사용한다. 시작 안내는 이번 버전 설치 후 다음 업데이트부터 사용할 수 있다.

## English

- Check for a newer public EXE in the background at startup. Offer **Update now / Later** once per app launch across workspace windows; ask again on the next launch after Later.
- Show download progress and retry failures. Verify installer size and SHA-256, save open sessions through the existing shutdown coordinator, and restart for installation. Offline checks leave startup usable; manual updates remain available.
- Preserve complete terminal file/video paths across hard-wrapped rows, including Codex right-edge gutters and foreground-color changes.
- Parse the bundled Git system configuration during build verification, even when inherited environment settings disable normal system-config reads.

## 검증

- 전체 **187개 파일·1,360개 검사**와 TypeScript·Vite 빌드를 통과했다. 시작 안내 IPC의 preload 허용 목록 누락을 수정한 뒤 전체 검사를 다시 통과했다.
- 실제 Electron 창에서 한국어·영어 안내, 1280px·390px 크기, native 클릭, Later 이후 재마운트 시 재안내 방지, 최신 버전·오프라인·비활성 채널의 무안내, 다운로드 진행률·실패 재시도·종료 준비 실패를 검증했다. 실제 설치 파일은 실행하지 않는 격리 검사다.
- 줄바꿈된 영상 링크는 실제 포인터 클릭과 관련 **16개 검사**, Git 설정 검사는 NUL 파일에서 버전 조회가 성공하더라도 강화된 검사가 실패하는 회귀 시나리오와 관련 **15개 검사**로 검증했다.
- 제품·Android 소스 버전은 **1.8.1.80**, npm 호환 버전은 **1.8.1**이다. 기존 APK **1.8.1.39/code 21**을 재사용한다. Vite의 기존 큰 chunk 경고는 남아 있다.

- 고정 소스 `bc02ae80830bcc88937532ca5e99764102ddfa52`를 푸시하고 별도 `exe-1.8.1.80` 출력 폴더에서 빌드했다. 패키지의 런타임·렌더러 **299개 파일**이 빌드 원본과 일치한다.
- 실제 packaged Git query·모델 기본값 IPC·bridge·Dashboard·브라우저 재사용 검사와 종료·트레이·보안 lifecycle 검사를 통과했다. 첫 병렬 packaged 검사에서는 휴면 fixture의 중단 결과가 `null`로 반환되어 실패했으며, **같은 산출물**을 단독 검사해 해당 중단·정확한 대화 복구와 전체 bridge를 통과했다. 기존 `node-pty`의 `AttachConsole failed` 진단도 출력되었지만 단독 검사와 lifecycle은 필수 성공 marker 및 종료 코드 0을 확인했다.
- EXE 내부의 Git 설정 557바이트를 직접 추출해 공식 MinGit 원본 SHA-256 `4b27ceb03e73554574a61d336a1d1af680be285d9ca0ad51814b89dd464c1413`과 일치하고 NUL 바이트가 없는 것을 확인했다. 강화한 설정 읽기 검사도 통과했다.
- 설치 파일 FileVersion **1.8.1.80**, npm 호환 ProductVersion **1.8.1**, manifest·세 자산의 크기·SHA-256을 확인했다. Authenticode는 기존 EXE 채널과 같은 `NotSigned`다.

Git 설치본 진단은 [Workspace interactions](workspace-interactions.md)에 기록했다. 손상 파일 16개를 백업·복구했고, 원본 ZIP·EXE 내부 파일과 격리 NSIS 압축 해제·복사 검사에서는 손상이 재현되지 않았다. 손상의 최초 원인은 미확정이며 이 릴리스는 Git 설정 검사를 보강한다.

검증 증빙: `output/full-suite-exe-1.8.1.80-fixed.log`,
`output/startup-update-exe-1.8.1.80.log`, `output/startup-update-smoke/`,
`output/build-frontend-1.8.1.80.log`, `output/build-exe-1.8.1.80-isolated.log`,
`output/packaged-smoke-1.8.1.80.log`, `output/packaged-smoke-1.8.1.80-sequential.log`,
`output/packaged-lifecycle-1.8.1.80.log`, `output/exe-release-1.8.1.80/`,
`output/publish-exe-1.8.1.80.log`, `output/public-update-verification-1.8.1.80.log`.

## 공개 배포

- [GitHub 안정 릴리스 v1.8.1.80](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.80)를 2026-10-13 **09:56:54 KST**에 게시했다. 태그와 빌드 소스는 `bc02ae80830bcc88937532ca5e99764102ddfa52`다.
- **09:59:57 KST**에 **1.8.1.78·1.8.1.79 → 1.8.1.80** 감지와 공개 설치 파일 전체 다운로드, 세 자산의 크기·SHA-256 검증을 통과했다.
- EXE는 **151,362,490바이트**, SHA-256은 `baa064433b0b72fabe4bcb734e6fbfcb78a2b776cc92ab83c4286e96ff3d320a`다. 같은 빌드의 blockmap과 `latest-exe.json`을 함께 게시했다.
- 사용 중인 앱·프로필을 변경하거나 설치 파일을 실행하지 않았다. 이번 버전은 기존 앱 설정의 **Check → Update**로 적용하고, 이후 새 버전부터 시작 시 업데이트 안내를 사용한다.
