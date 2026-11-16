---
type: Release
title: Acedia 1.8.2.22
status: published
last_updated: 2026-11-16
---

# Acedia 1.8.2.22

- Remote와 Dashboard에 자식 세션의 Idle·Stopped·Sleeping 표시를 각각 켜고 끄는 토글을 추가한다. 브라우저별 선택을 저장하고, 표시 중인 자식의 부모 경로와 검색을 유지한다.
- Remote의 PPTX·DOCX·XLSX·PDF 등 문서 다운로드를 지원한다. 채팅 링크·관련 파일·결과 폴더에서 원본 다운로드로 연결하며 한글 파일명과 하위 서비스 경로를 보존한다.
- 새 직접 전달에 요청 요약을 저장하고, 요약이 없는 과거 기록은 발신자·시각·전달 번호로 구분한다. 전달 상세에 정확한 기록 번호와 요약·원문 보관 여부를 표시한다.
- 세션 메시지의 선택적 `startIfOffline:true`로 원문 저장 후 기존 로컬 Codex·Claude 세션을 시작하고, 입력 준비를 확인해 지시를 전달한다. 기존 실행 세션을 유지하며 같은 요청의 중복 시작·전달을 방지한다.
- Remote를 하위 경로에 설치했을 때 도메인 루트가 해당 경로로 자동 이동하지 않도록 수정한다. 설정한 하위 경로의 끝 슬래시 보정은 유지한다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 재사용한다. 새 APK나 Microsoft Store 제출은 포함하지 않는다.

## English

- Add independent Idle, Stopped and Sleeping child-session visibility toggles to Remote and Dashboard, with browser-local preferences, ancestor paths and searchable hidden sessions.
- Download original PPTX, DOCX, XLSX, PDF and other supported document files from chat links, related files and result folders, preserving UTF-8 filenames and service subpaths.
- Save summaries for new direct handoffs and distinguish older records by sender, timestamp and handoff ID. Show the exact selected record and separate summaries from retained originals.
- Support opt-in `startIfOffline:true` message delivery: save the original, start the existing local Codex or Claude session, wait for input readiness and notify without duplicate starts or sends.
- Stop redirecting the domain root into a mounted Remote service while retaining trailing-slash normalization for its configured mount.
- Standard EXE release reusing the signed Android APK 1.8.1.39; no new APK or Microsoft Store submission.

## 검증

- 고정 소스의 전체 Vitest 267개 파일·2,171개 테스트와 TypeScript/Vite 빌드, 모바일 26개 테스트·타입 검사가 통과했다.
- 비활성 세션의 저장 후 시작·동일 키 중복 방지·시작 중 종료 복원·입력 준비와 전달 순서, 직접 전달 요약·과거 기록 식별을 격리 환경에서 확인했다.
- Remote·Dashboard·하위 경로의 원본 문서 GET/HEAD·한글 파일명·2MiB 초과 PPTX·인증·경로 제한과 실제 클라이언트 함수의 다운로드 분기를 검사했다.
- Node에서 실제 탐색 렌더러와 토글 클릭을 실행해 상태별 숨김·설정 저장·검색·부모 경로·개수 갱신·기존 선택 유지를 확인했다. GUI 자동화와 운영 세션 조작은 수행하지 않았다.

## 패키지 검증

- 제품 소스 `428486990075f270c458afbdbb7665fc420283c4`를 별도 작업 폴더에 고정하고 독립 복사한 의존성으로 빌드했다. ASAR 런타임·렌더러 436개 파일, Pixel Office 자산·라이선스 20개와 정본 라이선스·제3자 고지를 원본과 대조했다.
- 패키지의 Electron Node 런타임·인증된 HTTP·native PTY 검사 30개와 이번 변경의 추가 검사 8개가 통과했다. 루트·`/acedia`·`/dddd`·중첩 경로의 원본 문서 다운로드, UTF-8 파일명, 소유자/일반 사용자 경계, 루트 리디렉션 제거, 자식 토글·상위 관계 유지, Codex/Claude 각각의 저장 후 시작·준비 후 한 번의 알림, 직접 전달 요약·재시작 중복 방지를 확인했다.
- 로컬·공개 EXE의 NSIS CRC `054f009b`, 내부 압축 데이터 전체와 설치 전 검증 모드가 통과했다. Authenticode 상태는 `NotSigned`다. 검증 모드는 설치·레지스트리 변경·기존 앱 종료 전에 종료한다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.22](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.22).
- 게시: **2026-11-16 10:54:10 KST**. 공개 전체 다운로드 검증: **2026-11-16 10:54:47 KST**.
- **1.8.2.21 / 1.8.2.20 → 1.8.2.22** 감지를 실제 업데이터로 확인했다. 태그·manifest·EXE·blockmap의 소스·버전·크기·SHA-256이 빌드 원본과 일치한다.
- 기존 설치본에는 앱 업데이트 적용이 필요하고 Remote/PWA는 새로고침해야 한다. 새 MCP 입력 옵션 검색은 업데이트 후 CLI 재연결이 필요할 수 있다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포와 사용자 PC 설치는 수행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.22-x64.exe` | 156383544 | `0c6e805204b79508b97729b607a9ddd2f91bd38c69ecbe1a4a97d54380a212ce` |
| `Acedia-Setup-1.8.2.22-x64.exe.blockmap` | 163595 | `7c99dedbdd1b52346ac3c03da004141aa61eed24763963e889c3ef5b0a10d9f9` |
| `latest-exe.json` | 256 | `4fdbe6f8167373e4474fc60fde5cd6fdc8215b7bc1ccc392d79aa8c9c4eaf102` |
