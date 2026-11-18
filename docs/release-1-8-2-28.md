---
type: Release
title: Acedia 1.8.2.28
status: published
last_updated: 2026-11-19
---

# Acedia 1.8.2.28

- [Pixel Office](pixel-office.md#세션-현황의-표시-옵션)는 보드의 **Active만**, **Sleeping**, **대기·정지**, **모션** 스위치를 공유한다. 드래그와 휠 입력은 프레임마다 모아 처리하고 이동과 확대 중 캔버스 버퍼를 재사용한다.
- 왼쪽 세션 목록의 툴팁에서 직접 사용하는 Codex 계정이나 자동 라우팅으로 배정된 계정을 확인할 수 있다.
- Dashboard와 Remote는 최신 웹 파일을 우선 사용한다. 초기화에 실패하면 연결 상태와 새로고침 안내를 표시한다.

## 배포 및 검증

- [공개 Standard EXE 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.28)는 2026-11-19 01:32:50 KST에 게시했다. 빌드 소스는 `824c753ea38ba5f5146434e623da4e38f825ce20`이다.
- 데스크톱 279개 파일·2,273개 테스트, Android 소스 26개 테스트, TypeScript·Vite 빌드가 통과했다.
- 격리 검사에서 세션 105개와 연속 포인터 이벤트 50개를 한 프레임으로 처리하고 이동 중 캔버스 초기화가 없음을 확인했다. 계정 툴팁의 직접 사용·자동 배정·다음 시작 표시와 지연 응답 차단도 검증했다.
- 패키지에서 Dashboard 시작 파일과 Remote 하위 경로, 인증된 HTTP, native PTY와 소스 대비 446개 패키지 파일을 검증했다. 설치 파일의 Authenticode 상태는 `NotSigned`다. EXE에는 기존 서명 APK 1.8.1.39가 포함된다.
- 1.8.2.27과 1.8.2.26에서 업데이트를 감지했다. 01:33:44 KST에 공개 자산의 크기·SHA-256, 설치 파일의 NSIS CRC `e80e6937`, 압축 데이터와 설치 전 시작을 검증했다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.28-x64.exe` | 156409236 | `71e37e62ee3bb1850b70216f168600960c0ef8c7a6f593af194ebbc6dc80064e` |
| `Acedia-Setup-1.8.2.28-x64.exe.blockmap` | 163295 | `b1d8c060cad5287a97fcca6809f13a5f5e3c4915bd1cd8ef08dcedb371366aec` |
| `latest-exe.json` | 256 | `7c15f6158752132d5ef28c817a81e5b647d5f186092f03976da4273734b0542d` |
