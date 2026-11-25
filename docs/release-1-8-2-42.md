---
type: Release
title: Acedia 1.8.2.42
status: prepared
last_updated: 2026-11-25
---

# Acedia 1.8.2.42

- Claude를 같은 대화로 재시작할 때 이전 실행의 미완료 기록으로 인해 세션 간 전달이 `turn-working`에 멈추는 문제를 수정했습니다. 입력 준비가 확인되면 대기 중인 메시지를 기존 ID로 전달합니다.
- 현재 실행의 완료 훅과 빈 입력창이 확인되면 대화 기록 갱신을 기다리는 동안에도 전달을 재개합니다. 작업 중인 세션, 백그라운드 작업, 질문, 승인, 입력 초안은 계속 보호합니다.
- Windows Standard EXE에는 기존 서명 검증을 거친 Android APK 1.8.1.39가 포함됩니다.

## English

- Fixed a handoff stall where an unfinished turn from a previous Claude process could keep a resumed conversation in `turn-working`. Pending handoffs keep their original message IDs and resume when the conversation can accept input.
- Delivery can resume when a current completion hook and an empty composer confirm readiness while the transcript catches up. Active work, background work, questions, approvals, and drafts still block automatic delivery.
- The Windows Standard installer includes the existing, signature-verified Android APK 1.8.1.39.
