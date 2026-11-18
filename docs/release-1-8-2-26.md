---
type: Release
title: Acedia 1.8.2.26
status: published
last_updated: 2026-11-18
---

# Acedia 1.8.2.26

- 별도 세션 현황 창에서 **Pixel Office** 탭을 다시 연다. 마지막 보기와 보드 배치를 보존한다. [Pixel Office](pixel-office.md)
- `acedia_dashboard` MCP와 인증된 로컬 HTTP로 Dashboard 상태를 조회하고 시작·종료한다. MCP로 시작하면 loopback에서만 수신한다. [Dashboard 제어 계약](local-dashboard.md#세션-mcp에서-로컬-dashboard-제어)
- 라이선스 1.1은 개인 비상업적 사용과 본인용 수정을 허용한다. 원본·수정본 재배포와 조직·업무 사용은 사전 서면 허가가 필요하다. 기존 MIT와 제3자 권리를 보존한다. [사용 조건](licensing.md)

## 배포 및 검증

- [공개 Standard EXE 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.26)는 2026-11-18 14:29:25 KST에 게시했다. 빌드 소스는 `7f26074ab3eb18b6ad7f82cb1fbb3241d54da15b`다.
- 데스크톱 278개 파일·2,265개 테스트, 모바일 소스 26개 테스트와 타입 검사, TypeScript·Vite 빌드가 통과했다.
- 패키지의 실제 ASAR와 MCP에서 Office 보기 저장 및 Dashboard 조회·시작·종료를 검증했다. 로컬 인증 경계, loopback 수신, 라이선스 정본·MIT 고지, 고정 소스와 패키지의 445개 파일 일치를 확인했다. Terminal 링크 검증 69개와 인증된 HTTP·native PTY 검사도 통과했다.
- 1.8.2.25와 1.8.2.24에서 업데이트를 감지했으며 14:30:12 KST에 공개 다운로드의 크기·SHA-256과 NSIS CRC `e3003f5a`, 압축 데이터와 설치 전 실행을 확인했다. Authenticode 표시는 `NotSigned`다.
- 이 EXE는 기존 서명 APK 1.8.1.39를 포함한다. Android의 경로 유지 코드는 현재 소스에 있으며 기존 APK에는 포함되지 않는다. 사용자 PC 설치와 기기 로그인은 검증 범위 밖이다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.26-x64.exe` | 156406088 | `a3c7c52e2fa8a48c96bd757c0c39c066b433f6abe631ae56f48edcbfec462533` |
| `Acedia-Setup-1.8.2.26-x64.exe.blockmap` | 163268 | `e22663a40e9a2e495e85e7fbc0119207924e9c3d7c1393d55e187f5fcd66c661` |
| `latest-exe.json` | 256 | `079a5609483b9c8fca105018ab0e4edfa16a0199dbc57336a93bc575bf473afd` |
