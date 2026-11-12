---
type: Release
title: Acedia 1.8.2.12
status: published
last_updated: 2026-11-12
---

# Acedia 1.8.2.12

- 프로젝트 보드를 제공된 HTML 기준의 카드·상태 아이콘·확인 목록·툴바 구성으로 정리했다. 실제 프로젝트 폴더와 등록된 부모 관계를 배치에 반영하며, 세션이 많은 카드는 내부 스크롤과 정확한 세션 찾기를 제공한다.
- 계층선과 메시지 읽기 참조선이 중간 카드를 피하도록 경로를 계산한다. 역방향 참조는 서로 마주 보는 끝점을 사용하며, 접힌 카드·개요 모드·스크롤 상태도 반영한다. 이동·확대만으로 경로를 재계산하지 않는다.
- Remote의 두 세션 동기화 경로에서 빠졌던 부모 ID·프로젝트 ID·보관 및 비활성 자식 표시 설정을 전달한다. Active에서도 실행 중인 자식에 필요한 비활성 부모를 보존하며, 부모 변경·해제를 반영한다.
- Remote/Dashboard 세션 목록에 계층선·부모 이름·표시 중인 자식 수를 제공하고, 대화 상단의 상위 세션 경로에서 해당 대화로 이동할 수 있다. 깊은 트리의 모바일 들여쓰기를 제한하고 트리 모듈의 캐시 갱신을 보강했다.
- 기존 서명 APK 1.8.1.39를 포함한다. 이번 배포는 Standard EXE와 GitHub 채널이며 새 APK·Microsoft Store·Company 배포는 포함하지 않는다.

## English

- Align the project board with the supplied HTML design, with folder-aware project placement, readable session cards, a review inbox and bounded scrolling for large projects.
- Route hierarchy and observed message-read connections around cards, with facing endpoints, rounded corners and support for folded or scrolled views.
- Restore parent and visibility metadata in both Remote synchronization payloads. Show nested session families, parent labels, child counts and navigable ancestor paths in Remote/Dashboard.
- Refresh the session-tree module through the app-shell cache policy. Reuse the existing signed mobile APK; this release publishes only the Standard EXE channel.

## 검증

- 전체 **246개 파일·1,972개 테스트**를 확인했고 skip·todo는 0개다. 첫 실행의 Git PATH 누락으로 Store 시뮬레이션 6건이 실패했으며, 환경을 보완한 해당 파일 재검증을 합산한 결과다. 제품 코드나 테스트를 바꿔 통과시키지 않았다.
- SVG의 선분·둥근 모서리를 샘플링해 카드 침범을 확인하고, 역방향·중간 장애물·접기·스크롤·깊은 세션 트리를 검사했다.
- 실제 데스크톱 Remote 직렬화, 인증된 HTTP 상태, 운영 코드의 Node DOM 탐색·접기·상위 세션 이동과 서비스워커 갱신 검사를 통과했다.
- TypeScript/Vite 빌드와 패키지의 Electron Node 런타임·인증된 HTTP·native PTY 검증을 통과했다. Remote/Dashboard의 부모·손자 관계, 비활성 부모 보존, 탐색 코드 포함과 v111 캐시를 확인했다. 보드·큐·첫 지시·기존 세션 API 회귀 검사도 통과했다. GUI나 운영 세션 조작은 수행하지 않았다.
- ASAR 런타임·렌더러 **399개 파일**, Pixel Office 자산·라이선스 **20개**와 정본 라이선스·제3자 고지가 고정 소스와 일치한다.
- 첫 패키징은 압축 해제용 PowerShell 모듈 충돌로 실패했고 게시하지 않았다. 빌드 자식 프로세스의 모듈 경로를 Windows 기본 경로로 한정한 뒤 같은 소스·버전을 다시 빌드했다.
- 로컬·공개 EXE의 NSIS CRC **`eb23b94e`**, 압축 데이터 전체와 설치 전 검증 모드 시작을 통과했다. Authenticode는 기존 EXE 채널과 같은 **`NotSigned`**다. 실제 설치나 사용 중인 앱 종료는 수행하지 않았다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.12](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.12).
- 게시: **2026-11-12 10:56:51 KST**. 공개 전체 다운로드 검증: **2026-11-12 10:58:34 KST**.
- 제품 소스 커밋: `1448d8841f49dfa5a9c0f609c43c78ab1d6083d2`.
- 실제 업데이터에서 **1.8.2.11 / 1.8.2.10 / 1.8.2.09 → 1.8.2.12** 감지를 확인했다. 공개 태그·manifest·EXE·blockmap의 버전·크기·SHA-256이 빌드 원본과 일치한다.
- 앱 업데이트·재시작 후 Remote 화면을 새로고침하면 적용한다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포는 수행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.12-x64.exe` | 156319790 | `56d90e3b01cf02344eab9561fd84cc836dff2680e0ac5d491843bb1029b4b318` |
| `Acedia-Setup-1.8.2.12-x64.exe.blockmap` | 163497 | `8bf33c3108f25c763188f276fd56f534763e826b9890e2144ac8b19d0d8d7c31` |
| `latest-exe.json` | 256 | `a397979c5d76b983f3f8841a0b2853f450dcba85fdc70ad328c6c287693d7257` |
