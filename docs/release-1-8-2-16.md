---
type: Release
title: Acedia 1.8.2.16
status: published
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
- 전체 Vitest 252개 파일·2037개 테스트가 실패·대기 없이 통과했다. 패키지 API·native PTY, 설치 파일 CRC·압축 데이터·설치 전 검증 모드 및 공개 다운로드도 통과했다.
- GUI 자동화나 운영 세션의 메시지 전송은 수행하지 않았다.


## 패키지 검증

- 제품 소스 `e16ea0f84be212697b4636858b9343e589f5a058`를 별도 작업 폴더에 고정하고 독립 복사한 의존성으로 빌드했다. ASAR 런타임·렌더러 407개 파일과 Pixel Office 자산·라이선스 20개, 정본 라이선스·제3자 고지를 원본과 대조했다.
- 독립 Electron Node 런타임에서 실제 Codex·Claude 전달 봉투를 만들고, 20,000자를 넘는 한글 Markdown 원문을 인증된 Remote·Dashboard 채팅 HTTP로 조회했다. 표시 전후 수신함 파일·AI 읽음 상태·전송 횟수·페이지 커서가 같음을 확인했다. 운영 세션에 입력하지 않았다.
- Remote·Dashboard 인증·공통 UX, 첨부 원본, 부모·자식 세션, 대화 큐, 보드 종료·재열기 어댑터와 native PTY 검증이 통과했다.
- 실행용 의존성 감사는 취약점 0건이며 build-only minimatch는 최종 ASAR에 포함되지 않는다.
- 로컬·공개 EXE의 NSIS CRC `add09618`, 내부 압축 데이터 전체, 설치 전 검증 모드 시작이 통과했다. Authenticode 상태는 `NotSigned`다. 실제 설치나 사용 중인 앱 종료는 수행하지 않았다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.16](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.16).
- 게시: **2026-11-13 14:50:57 KST**. 공개 전체 다운로드 검증: **2026-11-13 14:51:50 KST**.
- **`1.8.2.15` / `1.8.2.14` / `1.8.2.12` → 1.8.2.16** 감지를 실제 업데이터로 확인했다. 태그·manifest·EXE·blockmap 버전·크기·SHA-256이 빌드 원본과 일치한다.
- 호스트 앱을 업데이트한 뒤 채팅을 다시 열고, Remote·Dashboard 웹페이지를 새로고침하면 적용된다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포는 수행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.16-x64.exe` | 156341019 | `b2fcbd356405654d19acb91c4a61de830d86ad58a06853cbe1aac5342783a431` |
| `Acedia-Setup-1.8.2.16-x64.exe.blockmap` | 163398 | `b9d9641d7d182e4faea7ddb75b6c4d94d2ddb95cb16866134b1b3194769a0d44` |
| `latest-exe.json` | 256 | `80357a88164ed6056120b4cf5b84de045e3b1e8be724abb78993c56ee408e7a8` |
