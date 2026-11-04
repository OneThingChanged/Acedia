---
type: Release
title: Acedia 1.8.2.03
status: published
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
- 공개 다운로드에서도 해시·NSIS CRC·압축 파일 전체·실제 설치 전 검증 모드가 통과했다. 기존 설치를 덮어쓰는 작업은 수행하지 않았다. 설치 파일은 기존 EXE 채널과 같은 미서명(`NotSigned`) 상태다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.03](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.03).
- 게시: **2026-11-04 18:31:58 KST**. 공개 다운로드·설치 프로그램 시작 검증: **18:33:06 KST**.
- 제품 소스 커밋: `9fa635cb8ae1fff3fb9a55f11046413a4a163d3d`.
- **1.8.2.02 / 1.8.2.00 / 1.8.1.96 → 1.8.2.03** 업데이트 감지를 실제 업데이터로 확인했다. 공개 세 자산의 크기·SHA-256·태그와 manifest가 빌드 원본과 일치한다.
- ASAR 내 소스·렌더러 파일 373개와 Pixel Office 자산·라이선스가 일치한다. 빌드용 minimatch는 런타임 패키지에 없다. 기존 서명 APK 1.8.1.39를 포함한다.
- Acedia 업데이트·재시작 후 Remote 페이지를 새로고침하면 새 첨부 지원과 캐시 v106이 적용된다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.03-x64.exe` | 156241004 | `835c8e385fec556c853ebc4382dcf0131212d02be31091e67b24d7d46a48dbf3` |
| `Acedia-Setup-1.8.2.03-x64.exe.blockmap` | 163421 | `5ea07e96f69aea19d7d0491148751a119fba911f62b4568a6f053ebda4eba93b` |
| `latest-exe.json` | 256 | `4cc24657cb149a9cc4eb2e0ee6008a37bdc837c26fa3f599afe509d9f7663adf` |
