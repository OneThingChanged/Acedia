---
type: Release
title: Acedia 1.8.2.36
status: published
last_updated: 2026-11-23
---

# Acedia 1.8.2.36

- 호스트에서 **설정 → 대시보드 → 주소만으로 접속 허용**을 켜면 허용된 내부망에서 IP와 포트만으로 대시보드에 연결할 수 있습니다. 기본값은 꺼짐입니다.
- 주소 접속을 끄면 주소로 시작한 연결을 해제합니다. 접속 링크로 인증한 연결은 유지합니다.
- LAN 로그인 화면을 다시 열 때 유효한 로그인 쿠키가 있으면 대시보드로 이동합니다. 링크 인증 후 쿠키가 적용되지 않으면 안내를 표시합니다.

## English

- Turn on **Settings → Dashboard → Allow access by address** on the host to open the dashboard by IP and port from an allowed local network. This setting is off by default.
- Turning off address access ends connections established through this option. Access-link sessions remain connected.
- Reopening the LAN login page with a valid cookie opens the dashboard. If the browser does not apply its cookie after access-link authentication, the page explains how to retry.

## 배포 및 검증

- 2026-11-23 11:21:33 KST에 `374968cb162384dc7e49ca8554624ec7035bfef6`에서 빌드한 Windows Standard EXE를 게시했습니다. [GitHub 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.36)
- 소스 테스트 2,352개를 통과했습니다. 설치 패키지로 사설 인터페이스에서 주소 접속과 링크 접속, 주소 접속 해제, Dashboard 및 앱 수명주기를 검증했습니다.
- 1.8.2.34와 1.8.2.35에서 업데이트를 감지했습니다. 11:22:25 KST에 공개 다운로드의 SHA-256, NSIS CRC `b7eb8a4d`, 압축 데이터와 설치 프로그램 시작을 확인했습니다. 설치 파일의 Authenticode 상태는 `NotSigned`입니다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.36-x64.exe` | 156432000 | `a63f97b0c07de2f50b8e9a7baad2f71134a7fad604acfdb22dfc87d181a7c28c` |
| `Acedia-Setup-1.8.2.36-x64.exe.blockmap` | 163377 | `1a79556949d0a56ed4d3f42d5814c9be21d7437da4d3ed56ba96b87d7e60e336` |
| `latest-exe.json` | 256 | `0a2809969360f7d319cae42a209ea84460d1538cdf4188176240d682a5a539a0` |
