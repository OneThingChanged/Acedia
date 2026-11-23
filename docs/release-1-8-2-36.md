---
type: Release
title: Acedia 1.8.2.36
status: draft
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
