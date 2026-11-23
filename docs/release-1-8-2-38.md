---
type: Release
title: Acedia 1.8.2.38
status: draft
last_updated: 2026-11-23
---

# Acedia 1.8.2.38

- LAN 로그인 안내에서 호스트의 **주소만으로 접속 허용** 설정을 안내합니다. **접속 다시 확인**으로 설정을 다시 읽고, 브라우저에 로그인 쿠키가 적용된 것을 확인한 뒤 대시보드를 엽니다.
- 자동 배정 Codex 세션을 일반 재시작할 때 기존 분산 계정의 한도를 소진했다면, 사용 가능한 다른 계정에서 기존 대화를 재개합니다. 재시작할 수 없으면 현재 CLI를 유지하고 원인을 표시합니다.
- 인증이 복구된 분산 계정 카드에서 이전 로그인 오류를 숨깁니다.

## English

- The LAN sign-in page explains the host's **Allow access by address** setting. **Check connection again** reads the current setting and verifies the sign-in cookie before opening the dashboard.
- Restarting an automatically assigned Codex session after its routed account runs out of quota can resume the conversation using another available account. If the restart cannot proceed, Acedia keeps the existing CLI running and shows why.
- Account cards clear earlier sign-in errors after authentication recovers.
