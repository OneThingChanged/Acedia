---
type: Release
title: Acedia 1.8.2.25
status: published
last_updated: 2026-11-17
---

# Acedia 1.8.2.25

- 보드에서 작업 중인 자식의 하위 트리를 같은 부모 아래 상단에 임시 배치하고, 작업 종료 후 저장한 순서로 복원한다. 새로 작업하는 세션이 카드의 스크롤 밖에 있으면 한 번 보여준다.
- 계층선을 조금 굵게 하고 관측된 읽기 참조에는 보라색 흐름, 미회수 하달 업무에는 밝기 애니메이션을 표시한다. Motion 끄기와 시스템 동작 줄이기를 따른다.
- 보드와 세션 조직도의 우클릭 메뉴에서 세션을 시작·중지할 수 있다. 오래된 상태의 실행 요청과 다른 대화로 바뀐 복구 요청은 거부한다.
- 하달 중간 응답과 자식의 결과 보고를 최종 업무 완료 알림으로 보내지 않는다. 하위 업무와 결과 회수가 끝난 뒤 리더의 최종 응답에서 알림을 보낸다. 대화·결과·질문 알림은 유지한다.
- 일반 로컬 Claude 세션도 등록된 폴더의 신뢰 확인을 자동 처리한다. 실제 선택 항목의 변경을 재확인한 뒤 한 번만 Enter를 보내며 로그인·별도 권한 요청은 자동 승인하지 않는다.
- 완전 종료 전에 실행 상태를 저장하고, 다음 실행 때 이전 세션 복구 여부를 묻는다. 예를 선택하면 이전에 실행 중이던 로컬 Codex·Claude 세션을 기존 대화로 복원하고 작업 중이던 세션에만 한 번 이어가기를 지시한다. 아니오를 선택하면 목록·배치를 유지하고 자동 실행하지 않는다.
- 대화 ID가 아직 없는 미사용 초기화 세션은 입력·실행 이력이 없는 경우에만 새로 열 수 있다. 기존 대화·계정·설정이 불확실하거나 질문·입력이 남은 세션에는 중복 명령을 보내지 않는다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 포함한다.

## English

- Temporarily promote working child branches within their parent on the board, reveal newly working sessions outside a project card's scroll area, and restore saved ordering after work finishes.
- Improve hierarchy-line visibility, add purple observed-read flow and pulse outstanding delegation lines, respecting Motion and reduced-motion settings. Start or stop sessions from board and organization context menus.
- Suppress intermediate handoff and assigned-worker completion alerts. Notify after the leader finishes and outstanding delegated work/results have been collected, retaining conversation/results and question alerts.
- Automatically confirm the registered folder for ordinary local Claude startup. Observe the repainted native selection before confirming once; login and unrelated approvals remain manual.
- Save active session state before full exit and ask whether to restore it on the next launch. Yes restores local Codex/Claude conversations and requests continuation once only for previously working sessions. No preserves the catalog/layout without automatic execution.
- Safely reopen unused first-start sessions without conversation IDs; preserve existing input and require attention for uncertain conversation, account, settings or submission outcomes.
- Standard EXE release bundling the existing signed Android APK 1.8.1.39.

## 검증

- 소스의 전체 Vitest 277개 파일·2,258개 테스트와 TypeScript/Vite 빌드가 통과했다. 배포 버전 메타데이터에서도 같은 전체 검사가 통과했고 모바일 검사 26개와 타입 검사가 통과했다.
- Claude의 실제 TrackedTerminalFilter/xterm 버퍼에서 이미지 형태의 신뢰 화면과 선택 변경을 재현했다. 종료 전 저장 순서, 복구의 예/아니오, 기존 대화·계정·프로세스 일치, 입력 보존, 불확실한 제출의 재전송 금지와 비활성 리더의 새 작업 생성 방지를 확인했다.
- 검사는 격리된 임시 프로필과 Node/API·렌더러 이벤트 핸들러를 사용한다. 운영 세션 변경·GUI 자동화·실제 모델 호출·사용자 PC 설치는 수행하지 않는다.

## 패키지 검증

- 제품 소스 `096147354d0a20f646ba5dfcbc50470f6194e8db`를 별도 작업 폴더와 복사한 의존성으로 고정해 빌드했다. ASAR 런타임·렌더러 445개 파일과 Pixel Office 자산·라이선스 20개, 정본 고지 파일을 대조했다.
- 패키지의 Electron Node·인증된 HTTP·native PTY 검사 30개, 실제 ASAR의 신규 기능 계약 검사 7개, 같은 고정 소스의 관련 회귀 검사 17개 파일·286개 테스트와 경로 검사 69개가 통과했다. GUI 자동화·실제 모델 호출은 수행하지 않았다.
- 로컬·공개 EXE의 NSIS CRC `6195de31`, 내부 압축 데이터 전체와 설치 전 검증 모드가 통과했다. Authenticode 상태는 `NotSigned`다. 검증은 설치·레지스트리 변경·기존 앱 종료 전에 끝난다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.25](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.25).
- 게시: **2026-11-17 09:47:17 KST**. 공개 전체 다운로드 검증: **2026-11-17 09:48:39 KST**.
- **1.8.2.24 / 1.8.2.23 → 1.8.2.25** 감지를 실제 업데이터로 확인했다. 태그·manifest·EXE·blockmap의 소스·버전·크기·SHA-256이 빌드 원본과 일치한다.
- 앱 업데이트를 적용해야 새 기능이 반영된다. 종료 후 복구 체크포인트는 이 버전에서 상태를 저장하고 완전히 종료할 때 생성된다. 새 APK·Store·Company 배포와 사용자 PC 설치는 수행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.25-x64.exe` | 156403413 | `5ed9c6099a938bd4ae49f8cbc5f8846d3689eb90fbe7575431ffa59433986ce3` |
| `Acedia-Setup-1.8.2.25-x64.exe.blockmap` | 163365 | `7f070b5fe9a7fd9b1cc698e5e946c48f6c882ac1f4f2a8639feca288c7f4ccd1` |
| `latest-exe.json` | 256 | `55c8b2a0aa4109cc0a4b0c9670e9eebab409785722618c848b3937455eb4b28e` |
