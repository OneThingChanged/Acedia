---
type: Release
title: Acedia 1.8.1.86
description: "채팅과 터미널 이미지 복사 메뉴, Ctrl 클릭 파일 위치 열기와 한 줄의 여러 링크 인식 수정."
status: stable
last_updated: 2026-10-21
---

# Acedia 1.8.1.86

## 변경 내용

- 채팅 이미지 썸네일, 이미지 파일 카드, 이미지 뷰어와 터미널 이미지 링크에 우클릭 메뉴를 제공한다. **이미지 복사**로 원본 해상도의 PNG 비트맵을 복사하고 뷰어 또는 파일 위치를 연다.
- 로컬 이미지는 클릭하면 뷰어로, **Ctrl+클릭**하면 해당 파일이 선택된 탐색기로 열린다. 터미널의 일반 경로, `file://` 주소와 이름만 표시된 OSC 8 링크에도 적용한다. 원본 파일 경로가 없는 메모리 이미지는 미리보기와 복사를 제공한다.
- 메뉴를 화면 안에 배치하고 뷰어보다 위에 표시한다. Esc는 메뉴를 먼저 닫고 이후 뷰어를 닫는다. 이미지 우클릭이 CLI 붙여넣기나 링크 열기로 처리되지 않으며 일반 영역의 우클릭 붙여넣기 설정은 유지한다.
- 한 줄에 여러 절대경로가 있을 때 첫 링크가 뒤의 링크까지 흡수하던 문제를 수정한다. 두 번째·세 번째 링크를 각각 인식하며 공백, 따옴표, 파일명의 괄호와 UNC 경로도 지원한다.

Standard EXE 업데이트다. 기존 서명 APK **1.8.1.39/code 21**을 재사용한다.

## English

- Add image context menus to Chat thumbnails, image file cards, the image viewer and terminal image links. Copy original-resolution PNG pixels or open the viewer and file location.
- Click local images to preview them; Ctrl/Cmd-click reveals and selects the file in Explorer. Apply the same action to paths, file URLs and labeled OSC 8 links. Memory-only images retain preview and copy.
- Keep menus within the viewport and above the viewer, close menus before the viewer with Escape, and preserve ordinary terminal right-click paste outside image links.
- Fix multiple absolute file links on one terminal line, including the second and third targets, while retaining spaces, quoted paths, balanced filename parentheses and UNC paths.

This Standard EXE release reuses the signed Android **1.8.1.39/code 21** artifact.

## 검증

- 실제 Electron 1280px·640px에서 채팅·터미널 클릭, Ctrl+클릭과 우클릭 메뉴, 1600×1000 원본 PNG 복사, 복사 실패 안내, 메모리 이미지와 Esc 순서를 확인했다. 클립보드 및 탐색기 endpoint는 임시 fixture다.
- 같은 줄의 한국어 설명과 세 절대경로를 ANSI 색상 유무별로 실제 클릭했다. 기존 긴 영상 경로·줄바꿈·OSC 8·색상 경계 검사도 통과했다.
- 채팅 파일 카드·150개 파일 팝업·검색·페이지 조회·이미지 유지 회귀 검사와 TypeScript·Vite 빌드를 통과했다.
- 전체 검사에서 설치된 Claude가 모의 CLI보다 먼저 발견되는 기존 테스트의 환경 의존성을 확인했다. 해당 검사의 초기 PATH를 격리하며 실제 실행 파일 선택 제품 코드는 변경하지 않는다.
- 전체 **198개 파일·1,478개 검사**와 네이티브 PTY 검사를 통과했다. `output/exe-86-tests.log`, `output/exe-86-pty-smoke.log`.
- TypeScript·Vite production build 후 기존 출력의 `app.asar` 잠금으로 패키징이 중단되어, 같은 소스를 별도 `app/electron-dist/exe-1.8.1.86`에 빌드했다. 실행 중인 사용자 앱을 종료하지 않았다. `output/exe-86-build-locked.log`, `output/exe-86-build.log`.
- 생성된 패키지의 실행·내장 Git·브라우저 bridge·Dashboard와 종료·트레이·보안 검사를 통과했다. `output/exe-86-packaged-smoke.log`, `output/exe-86-packaged-lifecycle-smoke.log`.
- 설치 파일 FileVersion **1.8.1.86**, ProductVersion **1.8.1**, 크기와 SHA-256이 같은 빌드의 manifest와 일치한다. Authenticode는 **NotSigned**다. 기존 node-pty 종료 보조 프로세스의 `AttachConsole failed` 진단 뒤에도 필수 성공 marker와 종료 코드 0을 확인했다. Vite의 500KB 이상 번들 경고는 남아 있다.
- 패키지의 런타임·렌더러 **320개 파일**이 고정 빌드 소스와 일치하며 기존 서명 APK **1.8.1.39/code 21**의 패키지·아키텍처·인증서·해시를 재검증했다. `output/exe-release-1.8.1.86/local-verification.json`.
- 공개 GitHub에서 **1.8.1.85·1.8.1.84 → 1.8.1.86** 감지를 확인했다. 실제 업데이터로 EXE 전체를 다운로드하고 공개 자산 세 개의 크기·SHA-256·URL·태그와 소스 커밋을 확인했다. `output/exe-86-public-verify.log`, `.build-tools/public-verified-1.8.1.86.json`.

## 배포 기록

- 공개 게시: **2026-10-21 14:24:54 KST**. [GitHub Release v1.8.1.86](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.86).
- 고정 소스·태그: `0b6f75a7c5e9a7b0ef65668c603bce61fc343aee`.
- 공개 다운로드 검증 완료: **2026-10-21 14:25:31 KST**.
- 소스 제품 버전·Android 소스 versionName: **1.8.1.86**. npm 호환 버전: **1.8.1**.
- 기존 서명 APK **1.8.1.39/code 21** 재사용. 새 APK·Company·Microsoft Store 배포는 실행하지 않았다.

| 공개 자산 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Acedia-Setup-1.8.1.86-x64.exe | 151426509 | `e2a8fc8da590995e2192d8535698d227958db966eeb609824e022f74e37f55d0` |
| Acedia-Setup-1.8.1.86-x64.exe.blockmap | 159577 | `4af3e81391b5055c5ffe98971fd31b9fa34b4c4a3a2bde25f00b79b3e63d6a3d` |
| latest-exe.json | 256 | `57a40e45060471dc7aff72e6753def4b5d4e45f1e00da3119dbd4eb68249979c` |

설정의 **Check → Update** 또는 다음 앱 실행의 업데이트 안내로 적용한다. 이 배포에서 설치 프로그램과 실제 사용자 세션에 대한 시험 요청은 실행하지 않았다. 공개 게시·다운로드 검증 완료와 사용자 PC의 설치 완료는 별개다.
