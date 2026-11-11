---
type: Release
title: Acedia 1.8.2.11
status: preparing
last_updated: 2026-11-12
---

# Acedia 1.8.2.11

- Codex·Claude의 네 가지 부모/자식 조합에 계정·모델·effort·Fast 확정, 백그라운드 실행, 범위가 정해진 native Trust와 첫 작업 전달을 연결했다. 탭 선택이나 창 활성화가 필요하지 않다.
- `acedia_session_run`과 `acedia_session_run_status`를 추가했다. 첫 transcript 전에도 안정적인 세션 ID를 반환하고, 한글 원문은 UTF-8 수신함에 보존한다. 생성 응답 유실·재호출·앱 재시작 후 같은 작업을 자동 복제하거나 재전송하지 않는다.
- `acedia_task_plan.tasks[].aiToolId`에서 Codex 또는 Claude를 선택할 수 있다. 제공자별 모델 정책, 실제 턴·모델 확인, 질문·결과 제출·부모 검토 계약을 유지한다. 로그인·실제 승인·질문은 사용자 결정을 기다린다.
- 최신 Codex의 Agent Command Center Trust 화면과 Claude의 하단 커서 위치를 반영했다. 초안·작업 중 입력·백그라운드 대기에는 새 작업을 넣지 않는다.
- 테스트 품질을 점검하고, 모바일 Chat 분기를 고장 내도 통과하던 문자열 검사 3개를 실제 상태·이벤트 처리 검사로 교체했다. 테스트 수를 늘리지 않고 같은 결함을 탐지하도록 보강했다. [검증 범위와 남은 한계](https://github.com/OneThingChanged/Acedia/blob/main/docs/test-quality-audit-2026-11-12.md)를 기록했다.
- MCP 검사 다섯 개가 실행 폴더에 의존하던 경로를 수정해 저장소 루트와 `app/` 실행을 모두 지원한다.
- 기존 서명 APK 1.8.1.39를 포함한다. 새 APK·Microsoft Store·Company 배포는 포함하지 않는다.

## English

- Support all four Codex/Claude parent and child combinations with resolved provider accounts and models, background startup, scoped native folder trust and first-task delivery without activating a window.
- Add durable session run/status APIs, stable pre-transcript session IDs, UTF-8 inbox handoff and exact native receipt/start evidence. Never recreate or replay an uncertain request automatically.
- Extend task orchestration to both providers while preserving original questions, approvals, dependency and review contracts.
- Audit test quality and replace three mobile routing source-string checks with executable state and event tests that detect a demonstrated regression.

## 검증

- 전체 241개 파일·1,953개 테스트, TypeScript/Vite 빌드, 설치된 Codex·Claude의 격리 native CLI 검사를 확인한다.
- 네 부모/자식 조합의 첫 대화 준비·착수·결과 제출·검토, 계정/모델 오류, Trust 범위, PTY 교체, UTF-8 원문과 중복 방지 검사를 포함한다.
- 핵심 보호 로직 3개의 의도적인 고장은 관련 테스트가 탐지했다. 모바일 분기 고장은 보강 전 검사 3개가 놓쳤고, 보강 후에는 모두 탐지했다. 전체 mutation coverage나 실제 GUI 검증으로 해석하지 않는다.
- 패키지 파일·라이선스·EXE 버전·NSIS CRC·압축 파일·설치 전 검증 모드·공개 다운로드 검증은 게시 기록에 추가한다.
