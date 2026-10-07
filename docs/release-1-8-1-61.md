---
type: Release
title: Acedia 1.8.1.61
description: "대시보드의 추가 사내 네트워크 허용과 Remote·터널 시작 전 설정 검사."
status: candidate
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

EXE 패키지·공개 배포 결과는 완료 후 기록한다. Microsoft Store와 새 APK는 이 배포에 포함하지 않는다.
