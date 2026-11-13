---
type: Release
title: Acedia 1.8.2.16
status: ready
last_updated: 2026-11-13
---

# Acedia 1.8.2.16

- 데스크톱·Remote·Dashboard의 채팅에서 세션 간 전달 메시지를 읽기 쉬운 카드로 표시한다. 보낸 세션 → 받는 세션과 보관된 한글 원문을 바로 보여준다.
- 표·목록·문서 링크를 포함한 Markdown 표시와 본문 복사를 지원한다. 내부 메시지 ID와 터미널 알림은 전달 정보에 접어서 보관한다.
- 원문은 해당 수신 세션·대화·전달 기록의 정확한 연결을 확인한 뒤 표시한다. 오래된 전달 기록도 수신함의 연결 정보로 복원하며, 원문이 없으면 찾을 수 없다고 명시한다.
- 채팅 표시만 바꾸므로 터미널 전달 방식과 대화 기록은 유지한다. 사람이 열거나 복사해도 AI의 읽음·작업 시작 상태는 변경하지 않는다. 일반 대화와 빈 변경 페이지는 수신함 조회를 생략한다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 포함한다. 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Show inter-session handoffs as readable message cards in desktop, Remote and Dashboard Chat, including the sender, recipient and original UTF-8 body.
- Render Markdown tables, lists and document links; copy the original body directly. Keep internal transport IDs and terminal instructions in collapsed delivery details.
- Verify the exact target, conversation and inbox/delivery binding before resolving content. Recover older messages from retained inbox bindings and explicitly label unavailable originals.
- Preserve native terminal delivery, transcript text and paging cursors. Viewing or copying a card does not mark the AI inbox read or imply task start. Ordinary chats and empty delta pages skip mailbox lookup.
- Reuse the existing signed APK for the Standard EXE channel.

## 검증

- Codex·Claude의 실제 전달 봉투와 격리 수신함, 64 KiB 원문, 재시작·이력 회전·대화 범위, 채팅 렌더러와 페이지 회귀를 포함한 관련 테스트 129개 및 TypeScript/Vite 빌드가 통과했다.
- 전체 Vitest 252개 파일·2037개 테스트가 실패·대기 없이 통과했다. 패키지 API·native PTY, 설치 파일 CRC·압축 데이터·설치 전 검증 모드 및 공개 다운로드는 배포 과정에서 추가 확인한다.
- GUI 자동화나 운영 세션의 메시지 전송은 수행하지 않는다.
