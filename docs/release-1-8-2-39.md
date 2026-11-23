---
type: Release
title: Acedia 1.8.2.39
status: draft
last_updated: 2026-11-24
---

# Acedia 1.8.2.39

- 자동 배정 Codex 세션은 시작 시 사용 가능한 분산 계정을 다시 확인합니다. 기존 배정이나 기본 계정을 사용할 수 없으면 다른 후보를 선택합니다. 세션에 지정한 계정은 그대로 사용합니다.
- 계정 상태에 일시 제한, 한도 소진, 로그인 필요, 분산 제외를 구분해 표시합니다. 일시 제한에는 재시도 가능 시각을 표시하고 같은 세션의 반복 오류 알림을 줄였습니다.
- 일시 제한으로 입력을 기다리는 전달은 제한이 끝나면 기존 요청으로 이어집니다. 전송이 불확실한 요청은 중복 실행을 막기 위해 수신함에 남깁니다.
- LAN 접속 안내를 개선했습니다. 주소만으로 접속하도록 설정을 바꾼 뒤 **접속 다시 확인**으로 로그인과 대시보드 연결 상태를 확인할 수 있습니다.

## English

- Automatically assigned Codex sessions check routing accounts at launch and select an available account if the current assignment or default is unavailable. Session-specific account selections are preserved.
- Account status distinguishes temporary rate limits, exhausted quota, sign-in requirements, and excluded accounts. Temporary limits show the retry time. Repeated warnings for the same session are grouped.
- Pending handoffs resume using the original request after a temporary rate limit ends. Handoffs with uncertain delivery remain in the inbox to prevent duplicate execution.
- LAN sign-in explains how to enable access by address. **Check connection again** verifies sign-in and opens the dashboard.
