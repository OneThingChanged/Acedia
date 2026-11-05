---
type: Release
title: Acedia 1.8.2.04
status: published
last_updated: 2026-11-05
---

# Acedia 1.8.2.04

- API로 새 세션을 만든 직후 메시지를 보낼 때, 첫 입력창이 준비되기 전에 `transcript-unavailable`로 거절되던 경로를 보완했다. 기존 폴더 Trust 자동 확인이 진행되는 동안 `waitMs` 예산 안에서 기다린 뒤 알림을 한 번 전달한다.
- `acedia_session_status`와 인증된 `/integration/v1/workspace/session-status`를 추가했다. Codex 대화 ID가 없어도 Acedia 등록 세션 ID로 시작·Trust·훅 검토·질문·작업·입력 준비 상태를 구분해 조회한다. 상태 조회는 입력·시작·승인을 수행하지 않는다.
- `acedia_session_start`에 선택적인 `waitMs`와 `startup` 결과를 추가했다. 백그라운드 PTY 실행과 CLI 입력 준비를 구분하며 기존 실행 중인 세션은 유지한다.
- 준비를 기다리는 중 세션이나 대화가 바뀌면 전송하지 않는다. 기존 대화 재개, 초안·질문·진행 중인 작업과 중복·불확실한 알림 처리 규칙을 유지한다. 자동 Trust 범위는 등록된 프로젝트·전용 폴더로 유지한다.
- 앱 업데이트 후 호출 CLI의 MCP 연결을 갱신하면 새 상태 도구를 사용할 수 있다. 실제 작업 수신·착수는 기존 메시지·전달 기록으로 확인한다.
- 기존 서명 APK 1.8.1.39를 재사용한다. 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Wait for a pristine Codex launch to finish startup before notifying it of its first message, within the request's wait budget.
- Add `acedia_session_status` and an authenticated readiness endpoint that accept Acedia session IDs before any CLI conversation exists. Return startup readiness separately from background PTY activation.
- Preserve exact-conversation checks, user questions, input drafts, deduplication and scoped automatic folder trust. Never resend uncertain notifications automatically.

## 검증

- 완료한 전체 222개 파일·1,782개 테스트와 최종 관련 3개 파일·36개 검사, 준비 판정 6개 검사를 재사용했다. TypeScript/Vite 빌드와 설치 Codex 0.166.0의 격리 CLI·MCP 검증도 통과했다.
- 임시 프로필·가짜 인증·loopback 응답 서버에서 Trust 대기 중 첫 알림 요청 → 폴더 Trust 1회 확인 → 입력창 준비 → 정확한 첫 대화·턴 연결 → 한글 수신·답장·중복 방지를 확인했다. 다른 대화·실행으로 바뀌는 경우는 거절했다.
- 새 빌드의 TypeScript/Vite 및 버전 검사 3개를 통과했다. 실제 ASAR 모듈을 Electron Node 런타임에서 실행해 준비 상태 API의 인증·첫 대화 없는 조회·준비 대기 후 알림 1회 전달과 start의 상태 분리를 확인했다. 기존 Remote/Dashboard 첨부 API·서비스 재시작·번들 Git·native PTY도 통과했다.
- EXE의 NSIS CRC `c4648e65`, 압축 파일 전체 및 설치 전 검증 모드의 실제 시작을 확인했다. 기존 EXE 채널과 같은 미서명(`NotSigned`) 상태다.
- GUI 자동화·창 활성화·운영 중인 세션 입력은 사용하지 않았다. 데스크톱 창의 UI 회귀 검사는 이번 자동 검증에 포함하지 않는다.
- 공개 전체 다운로드에서도 SHA-256·NSIS CRC·압축 파일 전체·설치 전 검증 모드 시작을 확인했다. 기존 설치를 덮어쓰는 작업은 실행하지 않았다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.04](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.04).
- 게시: **2026-11-05 10:46:51 KST**. 공개 다운로드 및 설치 프로그램 시작 검증: **10:48:03 KST**.
- 제품 소스 커밋: `95dad30753618a75b76e2d247c852eda696b309b`.
- 실제 업데이터로 **1.8.2.03 / 1.8.2.02 / 1.8.1.96 → 1.8.2.04** 감지를 확인했다. 공개 세 자산의 크기·SHA-256·태그·manifest가 빌드와 일치한다.
- ASAR 내 소스·렌더러 파일 375개와 Pixel Office 자산·라이선스가 고정 소스와 일치한다. 빌드용 minimatch는 런타임 패키지에 없다. 기존 서명 APK 1.8.1.39를 포함한다.
- 새 준비 상태 도구는 앱 업데이트·재시작과 호출 CLI의 MCP 도구 목록 갱신 후 사용할 수 있다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.04-x64.exe` | 156243925 | `90604a26f525d809332fdf616cf122e53cec93ad91312795077c7c36c80556d4` |
| `Acedia-Setup-1.8.2.04-x64.exe.blockmap` | 163463 | `62d5ed47259bef8f6860defa2824e05f1835df70c28bd77d8503cd32e1780a40` |
| `latest-exe.json` | 256 | `414ca5d1654fd6f602367baf81d9553e8284a4379af2295edc57dbf480f74083` |
