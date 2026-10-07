---
type: Release
title: Acedia 1.8.1.61
description: "대시보드의 추가 사내 네트워크 허용과 Remote·터널 시작 전 설정 검사."
status: stable
last_updated: 2026-10-07
---

# Acedia 1.8.1.61

## 변경 내용

- 대시보드 LAN 설정에 **추가 허용 네트워크 (IPv4 CIDR)**를 추가했다. 예를 들어 `172.28.37.0/24`를 저장하면 다른 사내 서브넷에서도 대시보드 주소에 직접 접속할 수 있다. 기존 8자리 연결 코드 인증은 유지한다.
- 사설 IPv4 대역만 최대 32개까지 허용하며 대역을 비우면 같은 서브넷만 허용한다. 저장 시 CIDR을 정규화하고, 대역 변경 시 연결 코드를 갱신하며 기존 인증 연결을 해제한다.
- Host·실제 수신 인터페이스·직접 연결 검사는 유지한다. loopback으로 전달하는 Windows portproxy 설정은 별도로 해제해야 한다. 네트워크 라우팅과 방화벽은 실제 서버 주소의 직접 접속을 허용해야 한다.
- Remote의 **Start**와 **Start tunnel**은 GitHub Client ID·Owner가 비어 있거나 아직 저장하지 않은 경우 실행을 막고 입력·저장 안내를 표시한다. 실제 시작 경로에서도 저장된 설정을 검사한다.
- 고정 터널 토큰을 입력하면 Public hostname과 고정 로컬 포트(1–65535)도 필요하다. Quick tunnel에서는 토큰·Client Secret·고정 hostname을 요구하지 않는다. 불완전한 설정으로 Remote 서버·cloudflared 다운로드·터널 프로세스를 시작하지 않는다.

사용 방법은 [대시보드 LAN 설정](local-dashboard.md#같은-공유기의-다른-pc에서-접속)과
[Remote 설정](remote-service.md#authentication-and-approval)을 참고한다.

## English

- Add explicit private IPv4 CIDR allowlists for routed internal networks while keeping Dashboard connection-code authentication.
- Normalize and persist network rules, reset pairing codes and disconnect clients when rules change.
- Require saved GitHub Client ID and owner settings before starting Remote or a tunnel; guide users to enter and save missing settings.
- Validate hostname and fixed port for named tunnels before starting services or downloading cloudflared. Quick tunnels retain optional token and secret settings.
- Reuse the signed mobile APK 1.8.1.39.

## 검증

- 대역 분류·설정 저장·접속 해제·Remote 설정·IPC 관련 **59개 검사** 및 TypeScript/Vite 빌드를 통과했다.
- 실제 Electron에서 잘못된 대역 거부, `172.28.37.188/24 → 172.28.37.0/24` 정규화·저장과 코드 인증을 검증했다. **1024/390px** 화면의 Chat 전송·문서 열기·로그아웃과 코드 갱신·LAN 비활성화도 통과했다.
- 실제 설정 화면에서 빈 OAuth 값의 Remote·터널 시작 차단, 저장하지 않은 설정 차단과 저장 후 Quick tunnel 시작을 fixture로 확인했다. 실제 사내 라우팅·방화벽·portproxy 변경이나 공개 터널 연결은 수행하지 않았다.

- 전체 **167개 파일·1,133개 검사**, TypeScript 검사 및 native PTY 검증을 통과했다.

- Standard EXE 빌드와 packaged bridge·Dashboard·내장 Git·종료·트레이·보안 lifecycle 검증을 통과했다.
- `app.asar`의 runtime·renderer 파일 **8개**가 빌드 원본과 일치하고 패키지 버전이 **1.8.1.61**임을 확인했다.
- 기존 APK **1.8.1.39**의 패키지·아키텍처·서명 인증서를 검증하고 재사용했다. 설치 파일 FileVersion **1.8.1.61**, 파일명·크기·SHA-256·blockmap·manifest 검증을 통과했다. Authenticode는 기존 EXE 채널과 같은 **NotSigned**다.

## 공개 배포

2026-10-07 **13:43:53 KST**에 [v1.8.1.61](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.61)을 최신 안정 EXE 릴리스로 게시했다. 제품 태그와 릴리스 대상은 검증한 소스 `47a705ab2e8a02c20bd283219e45e53bea63a6ae`다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.61-x64.exe` | 151,281,733 | `bf03ee048ec0f1497a3fa74bef09d219896b36443cb00f0ea0effb49f0c30f76` |
| `Acedia-Setup-1.8.1.61-x64.exe.blockmap` | 159,224 | `2d108eba4bbe511ff658993bf838c698a5d7f2cc816d1c5d3115095f1d129616` |
| `latest-exe.json` | 256 | `816bf5fda5761e1b0ea6884174b907c7c9f902d450f914a2ad8059bb2d4721d5` |

**13:44:28 KST**에 프로덕션 업데이터의 **1.8.1.59·1.8.1.60 → 1.8.1.61 감지**와 공개 EXE 다운로드·설치 전 해시 검증을 완료했다. 세 공개 자산의 크기·SHA-256, 소스 태그와 최신 안정 릴리스, 번들 APK 버전 **1.8.1.39**가 일치했다.

실행 중인 사용자 앱의 설치·종료·재시작은 수행하지 않았다. Microsoft Store와 새 APK 배포는 수행하지 않았다.
