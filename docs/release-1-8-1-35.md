---
type: Release
title: Acedia 1.8.1.35 EXE release
description: Download original project documents, images and videos from Remote and Dashboard previews and document actions.
status: stable
last_updated: 2026-09-30
sources:
  - resource: remote-service.md
  - resource: local-dashboard.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/services/remote-documents.mjs
  - resource: ../app/electron/services/remote-document-download.test.mjs
  - resource: ../app/scripts/electron-document-download-smoke.mjs
---

# Acedia 1.8.1.35

- Remote·Dashboard의 채팅 파일 미리보기와 Documents 상단에 **다운로드** 버튼을 추가했다. 문서 목록 우클릭 메뉴와 모바일 **⋮ 문서 작업**에서도 원본 파일을 저장한다.
- Markdown·HTML·JSON·이미지·MP4/WebM 원본 바이트와 UTF-8 파일명을 보존한다. HTML은 원본 HTML 파일 한 개를 저장한다. 프로젝트·세션 상대 경로와 등록된 프로젝트/Unreal 작업공간의 전체 경로를 지원한다.
- 다운로드 준비 중 중복 요청을 막고, 접근 불가·파일 없음·네트워크 오류를 안내한 뒤 버튼을 복구한다. 파일 본문은 서버에서 스트리밍하고 실제 저장 진행은 브라우저가 관리한다. 2MB 미리보기 제한을 넘는 문서도 내려받을 수 있다.
- 기존 Remote 인증·승인과 프로젝트 경로 제한을 적용한다. 외부 경로·외부로 향하는 링크·SSH·지원하지 않는 파일 형식은 거부한다.
- 작은 화면은 파일명·닫기와 종류·다운로드를 두 줄로 배치하고 44px 버튼을 사용한다. Remote PWA cache는 **v80**다.
- Standard EXE와 같은 빌드의 `latest-exe.json`, blockmap을 제공한다. 기존 서명 검증된 Android APK **1.8.1.28**을 재사용하며 Android 소스 versionName은 1.8.1.35로 맞춘다. APK를 재빌드하지 않아 versionCode는 유지한다.

다운로드·웹 서비스 **22개 테스트**와 실제 브라우저 UI 검증은 원본 바이트, 한글 파일명, HEAD, 큰 문서, 빈 파일, 경로 제한, 인증과 오류 복구를 확인했다. UI 검증 화면은 1024×850, 390×850, 375×812와 844×375이며 미리보기·Documents 상단·메뉴에서 실제 파일 저장을 확인했다. 기존 Remote PWA 회귀 smoke도 통과했다.

전체 소스 검증: `npm test -- --maxWorkers=4`에서 **139개 파일·865개 테스트**가 통과했다.

패키지 검증: Standard EXE 프로덕션 빌드, packaged bridge/Dashboard smoke와 packaged lifecycle smoke가 통과했다. 다운로드 서비스와 Remote 클라이언트·HTML·CSS·번역·service worker는 패키지에 포함된 바이트가 작업 소스와 일치한다. 패키지 버전과 설치 파일 FileVersion은 **1.8.1.35**이며 설치 파일과 `latest-exe.json`의 크기·SHA-256도 일치한다.

- 설치 파일: `Acedia-Setup-1.8.1.35-x64.exe`
- 크기: **120419338 bytes**
- SHA-256: `6b107ad4fb8753d6b62c8b5d6f20b04c51ebc905eccf006bb19fb6c931ff3c85`
- Authenticode: **NotSigned**. 파일 무결성 검증은 코드 서명을 대신하지 않는다.

공개 릴리스 게시와 자동 업데이트 다운로드는 배포 단계에서 확인한다. 실제 Android WebView 저장과 사용 중인 PC의 설치 완료는 별도 검증이다.
