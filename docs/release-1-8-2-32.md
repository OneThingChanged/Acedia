---
type: Release
title: Acedia 1.8.2.32
status: published
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

## 배포 및 검증

- 2026-11-21 22:19:07 KST에 `9e716dd4d086790c6acf328aa0d4b919d8a81277`에서 빌드한 Windows Standard EXE를 게시했습니다. [GitHub 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.32)
- 데스크톱 테스트 2,329개와 제품 빌드를 통과했습니다. 패키지에서 취소 후 입력 준비, 오프라인 대상이 있는 전송 대기열, Fable 모델 상속, Codex·Claude 착수 기록, Dashboard와 앱 수명주기를 검증했습니다.
- 1.8.2.30과 1.8.2.31에서 업데이트를 감지했습니다. 22:20:11 KST에 공개 자산을 내려받아 SHA-256과 NSIS CRC `64ce25a4`, 압축 데이터와 설치 전 시작을 검증했습니다. 설치 파일의 Authenticode 상태는 `NotSigned`입니다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.32-x64.exe` | 156422924 | `24c4b1e1d3538a4afe1a5b4fcdd596f68dea753c401b77b4ef3e10660fb827ca` |
| `Acedia-Setup-1.8.2.32-x64.exe.blockmap` | 163852 | `6c842150dbcd71433bf7fff79d1801ec78e6caa25cca1ac92394d346fecb2802` |
| `latest-exe.json` | 256 | `dd24a5ad37486e18d0430cabde216c23be7482f3a2c66941154ad048c8be7b5e` |
