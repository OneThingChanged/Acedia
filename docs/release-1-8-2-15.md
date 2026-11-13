---
type: Release
title: Acedia 1.8.2.15
status: published
last_updated: 2026-11-13
---

# Acedia 1.8.2.15

- 프로젝트 보드의 연결점을 부모 아래·자식 위로 고정하지 않고, 카드 배치에 따라 상하좌우에서 마주 보는 면을 선택한다.
- 옆에 놓인 카드나 긴 부모 카드의 중간 높이에 있는 자식은 좌우로 직접 연결할 수 있다. 카드와 겹치지 않는 경로의 길이와 꺾임을 비교하며, 연결면이 막히면 다른 방향도 검사한다.
- 접기·개요 보기·드래그 후 표시된 카드 크기로 연결점을 다시 계산한다. 프로젝트 배치와 실제 부모·자식 관계는 그대로 유지한다.
- 짧은 직선 경로가 확인되면 불필요한 방향 탐색을 생략한다. 기존 메시지 읽기 참조선과 프로젝트 내부 세션 트리는 유지한다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 포함한다. 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Choose facing project-card ports from all four directions instead of forcing every parent connection from bottom to top.
- Connect side-by-side cards directly, including children placed beside the middle of a tall parent. Compare obstacle-free routes by distance and bends and try another direction when an exit is blocked.
- Recompute visible ports after dragging, folding or entering overview without modifying saved positions or parent relationships. Stop searching when remaining candidates cannot improve the route.
- Preserve observed message-read connections and internal session trees. Reuse the existing signed mobile APK for the Standard EXE channel.

## 검증

- 방향 선택·장애물 회피·접기·이동·기존 보드 회귀 테스트 54개와 TypeScript/Vite 빌드가 통과했다.
- 전체 Vitest 249개 파일·2024개 테스트가 실패·대기 없이 통과했다. 패키지 API·native PTY, 설치 파일 CRC·압축 데이터·설치 전 검증 모드 및 공개 다운로드도 통과했다.
- GUI 자동화나 운영 세션의 메시지 전송은 수행하지 않았다.


## 패키지 검증

- 제품 소스 `6c3ecf6a15041f3cf370734d08a6a73d52f273bc`를 별도 작업 폴더에 고정하고 독립 복사한 의존성으로 빌드했다. ASAR 런타임·렌더러 404개 파일과 Pixel Office 자산·라이선스 20개, 정본 라이선스·제3자 고지를 원본과 대조했다.
- 독립 프로필의 Electron Node 런타임에서 Remote·Dashboard 인증 HTTP, 새 UX 자산·표의 파일 링크·검토 상태, 한글 첨부, 부모·자식 세션, 대화 큐, 보드 종료·재열기 어댑터와 native PTY 검증이 통과했다.
- 실행용 의존성 감사는 취약점 0건이다. 이전에 기록한 build-only minimatch는 최종 ASAR에 포함되지 않는다.
- 로컬·공개 EXE의 NSIS CRC `efeaf83b`, 내부 압축 데이터 전체, 설치 전 검증 모드 시작이 통과했다. Authenticode는 기존 EXE 채널과 같은 `NotSigned`다. 실제 설치나 사용 중인 앱 종료는 수행하지 않았다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.15](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.15).
- 게시: **2026-11-13 12:43:05 KST**. 공개 전체 다운로드 검증: **2026-11-13 12:44:02 KST**.
- **`1.8.2.14` / `1.8.2.13` / `1.8.2.12` → 1.8.2.15** 감지를 실제 업데이터로 확인했다. 태그·manifest·EXE·blockmap 버전·크기·SHA-256이 빌드 원본과 일치한다.
- 앱 업데이트 후 프로젝트 보드를 다시 열면 저장된 배치를 유지하면서 연결면이 자동 선택된다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포는 수행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.15-x64.exe` | 156337389 | `3acff079bf5d63431e609a3b600068fc8513b1bf3507a1e91af46908521bc20a` |
| `Acedia-Setup-1.8.2.15-x64.exe.blockmap` | 163376 | `6f36f1198790b69edccb926b5966d64e036bac51cfff2fc149803f99bdaa527c` |
| `latest-exe.json` | 256 | `b613170d4067a6b4f29deef153c9a162df2b5e0439b8b59008b53e007256e9b9` |
