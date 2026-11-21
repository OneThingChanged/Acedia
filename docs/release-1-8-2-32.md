---
type: Release
title: Acedia 1.8.2.32
status: draft
last_updated: 2026-11-21
---

# Acedia 1.8.2.32

- 취소 후 입력 가능한 Codex 세션과 복원된 세션에 새 지시를 전달합니다. 읽은 메시지는 대기열에서 정리하고 오프라인 대상의 반복 재시도가 다른 대상의 전송을 지연시키는 문제를 해결했습니다.
- 원문을 읽은 메시지는 화면에 읽음 상태를 표시합니다. 예전 전송 기록을 다시 확인할 때 같은 경고가 반복되는 문제를 줄였습니다.
- 터미널 출력에서 상태가 바뀔 때만 세션 목록을 갱신하고, 전달 상태 조회는 대상 세션만 검사합니다.
- Claude 자식 세션에서 Fable 정식 모델 ID와 effort를 유지합니다. 생성 전 검증 실패와 실제 착수 확인을 더 정확히 표시합니다.
- Acedia 호스트가 재시작된 뒤 MCP가 현재 연결 정보를 다시 확인합니다. Codex 시작 중에는 Acedia가 설치한 훅과 Codex의 실제 검토 목록이 일치하는지 확인합니다.
- Windows Standard EXE에는 기존에 서명한 Android APK 1.8.1.39를 포함합니다.

## English

- Deliver new instructions to Codex sessions with a ready composer after cancellation or restoration. Clear already-read messages from the queue and let ready targets advance while offline targets retry.
- Show the durable read receipt and prevent repeated delivery warnings during reconciliation of older records.
- Refresh the session list when terminal output changes a session's status, and inspect only the target session when checking delivery readiness.
- Preserve versioned Claude Fable model IDs and effort for child sessions. Report pre-creation validation failures and delivery-start evidence accurately.
- Refresh the Acedia MCP connection after a host restart. Verify Acedia-managed hooks against the native Codex review list at startup.
- The Standard EXE bundles the existing signed Android APK 1.8.1.39.
