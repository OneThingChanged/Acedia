---
type: Release
title: Acedia 1.8.1.86
description: "채팅과 터미널 이미지 복사 메뉴, Ctrl 클릭 파일 위치 열기와 한 줄의 여러 링크 인식 수정."
status: validating
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
- 패키지 실행·종료·Git·브라우저·Dashboard, 설치 파일 메타데이터와 공개 다운로드 검증은 배포 실행 결과를 기록한다.

## 배포 기록

배포 검증 진행 중이다. 제품 버전과 Android 소스 versionName은 **1.8.1.86**, npm 호환 버전은 **1.8.1**이다. 새 APK와 Microsoft Store 및 Company 배포는 이 EXE 배포 범위에 포함하지 않는다.
