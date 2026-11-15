---
type: Release
title: Acedia 1.8.2.21
status: candidate
last_updated: 2026-11-16
---

# Acedia 1.8.2.21

- 세션 메시지가 1,000건 쌓이면 새 보고를 저장하지 못하던 문제를 개선한다. 읽음·전달 완료가 확인된 오래된 메시지를 색인이 있는 별도 보관소로 옮겨 활성 저장 공간을 확보한다.
- 보관 후에도 메시지 ID로 원문을 읽고, 과거 수신함·발신함을 조회하거나 원래 메시지에 답장할 수 있다. 과거 Chat 카드도 원문을 표시하며 같은 요청 키의 중복 실행을 방지한다.
- 미확인·전달 대기·결과 불명 메시지는 보존한다. 관리자가 작업 중이면 새 보고를 먼저 저장하고 기존 대기열에서 입력 준비 후 알림을 전달한다. 보관소 누락·손상이나 저장 실패 시에는 전송을 차단한다.
- 업데이트 적용 후 자동 보관을 사용할 수 있다. 이전에 저장 한도로 거부된 보고는 발신자가 기존 요청 키와 같은 본문으로 다시 보내야 한다. 저장되지 않은 보고를 자동 생성하거나 재전송하지 않는다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 재사용한다.

## English

- Automatically archive older durably read terminal messages when the active mailbox reaches its 1,000-record or 16-MiB limit, allowing new reports to be saved.
- Preserve original-text lookup, inbox/outbox history, replies, past Chat cards and per-request deduplication across archival and restarts.
- Retain unread, pending and uncertain messages. Save a new report while its recipient is busy and use the existing readiness queue for its notification. Block delivery if persistence or archive integrity cannot be verified.
- Apply the desktop update to enable archival. Reports rejected before they were saved require an explicit retry with the original request key and unchanged content; they are not reconstructed or resent automatically.
- Standard EXE release reusing the signed Android APK 1.8.1.39.

## 검증

- 관련 검사와 TypeScript/Vite 빌드가 통과했다. 버전 고정 후 전체 검사·패키지·공개 다운로드 검증 결과를 추가한다.
- 운영과 같은 1,000건·읽음 820건 조건에서 새 보고 저장·작업 중 대기·준비 후 한 번의 알림을 확인했다. 보관 전후 페이지 경계·원문·해시·답장·권한·동일 키 거부, 용량 한도, 저장 중 종료 복구와 보관소 누락·손상도 검사했다.
- 운영 메시지의 삭제·수동 보관·재전송, 사용자 세션의 중단·재시작·실제 설치와 GUI 자동화는 수행하지 않는다.
