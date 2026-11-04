---
type: Release
title: Acedia 1.8.2.03
status: preparing
last_updated: 2026-11-04
---

# Acedia 1.8.2.03

- Remote와 Dashboard에서 Markdown(`.md`, `.markdown`) 및 HTML(`.html`, `.htm`) 파일을 첨부할 수 있다. 파일 선택·드롭·클립보드 파일에 같은 판정을 적용한다.
- 문서는 8MiB, ZIP은 기존과 같이 32MiB까지 지원하며 한 번에 최대 4개를 첨부한다. 브라우저가 문서 MIME을 비우거나 `text/plain`·일반 바이너리로 제공해도 지원 확장자로 판정한다.
- 한글 UTF-8 및 BOM이 있는 UTF-16 문서의 원본 바이트를 보존하고, 빈 문서도 허용한다. MD·HTML·ZIP은 이미지와 구분해 파일 경로로 세션에 전달한다. 업로드 중 HTML을 실행하거나 ZIP을 풀지 않는다.
- 첨부 목록에 MD·HTML·ZIP 배지를 표시하고 PWA 캐시를 v106으로 갱신한다. 기존 이미지 첨부, 로그인·동일 출처 검사, 크기 제한을 유지한다.
- 기존 서명 APK 1.8.1.39를 재사용한다. 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Attach Markdown and HTML documents from Remote and Dashboard, including common browser MIME variants and empty documents.
- Preserve original document bytes and send document/archive paths separately from images. Documents support up to 8 MiB; ZIP archives retain the 32 MiB limit and drafts allow four files.
- Add document badges and update the PWA cache to v106 while retaining authentication, origin checks and content validation.

## 검증

- 관련 API·공유 모듈 40개 테스트와 TypeScript/Vite 빌드 통과.
- Remote/Dashboard의 인증된 API로 한글 MD·HTML·실제 9MiB ZIP의 혼합 업로드, 저장 바이트 일치 및 세션 전달을 확인했다. 중복 요청이 재전달되지 않으며, 잘못된 문서 인코딩·형식·크기 초과·인증 없는 요청·다른 출처의 요청은 거부했다.
- 전체 221개 파일·1,773개 테스트와 TypeScript/Vite 빌드를 통과했다.
- 실제 패키지의 Electron Node 런타임에서 ASAR 모듈을 불러와 Remote/Dashboard의 이미지·MD·HTML·ZIP 업로드 및 중복 없는 전달, 출처 차단, 서비스 종료·재시작, 번들 Git 및 native PTY를 확인했다. GUI 자동화와 운영 중인 세션 입력은 사용하지 않았다. 데스크톱 창의 UI 회귀 검사는 이번 검증 범위에 포함하지 않는다.
- EXE의 NSIS CRC `ba182072`, 압축 파일 전체 검사 및 설치 전 검증 모드의 실제 시작을 확인했다. 검증 모드는 기존 앱·설치 위치·사용자 데이터를 변경하지 않는다.
- 공개 다운로드 검증 결과는 배포 후 기록한다.
