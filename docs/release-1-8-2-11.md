---
type: Release
title: Acedia 1.8.2.11
status: published
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

- 전체 241개 파일·1,953개 테스트가 통과했고 skip·todo는 0개다. TypeScript/Vite 빌드와 설치된 Codex·Claude의 격리 native CLI 검사를 통과했다.
- 네 부모/자식 조합의 첫 대화 준비·착수·결과 제출·검토, 계정/모델 오류, Trust 범위, PTY 교체, UTF-8 원문과 중복 방지 검사를 포함한다.
- 핵심 보호 로직 3개의 의도적인 고장은 관련 테스트가 탐지했다. 모바일 분기 고장은 보강 전 검사 3개가 놓쳤고, 보강 후에는 모두 탐지했다. 전체 mutation coverage나 실제 GUI 검증으로 해석하지 않는다.
- 패키지의 Electron Node 런타임·인증된 HTTP에서 네 가지 제공자 조합, Claude 첫 수신함, 영속 실행/상태 API, 중복 생성·전송 방지와 native PTY를 확인했다. 기존 보드·큐·Remote/Dashboard·수집 API 회귀 검사도 통과했다. GUI나 운영 세션 조작은 수행하지 않았다.
- ASAR 런타임·렌더러 파일 **396개**, Pixel Office 자산·라이선스 **20개**, 정본·이전 MIT·제3자 고지가 고정 소스와 일치했다. 별도 체크아웃의 node_modules junction으로 의존성이 빠진 첫 패키지는 실행 검사에서 거절했고 게시하지 않았다. 의존성을 실파일로 복사해 같은 소스·버전을 다시 빌드한 패키지만 게시했다.
- 로컬·공개 EXE의 NSIS CRC **`5f048623`**, 압축 데이터 전체와 설치 전 검증 모드 시작을 통과했다. Authenticode는 기존 EXE 채널과 같은 **`NotSigned`**다. 실제 설치나 사용 중인 앱 종료는 수행하지 않았다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.11](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.11).
- 게시: **2026-11-12 04:25:42 KST**. 공개 전체 다운로드 검증: **04:26:40 KST**.
- 제품 소스 커밋: `40af7d0de6a53dd1c36f577e8e1e5fccd97c9935`.
- 실제 업데이터에서 **1.8.2.10 / 1.8.2.09 / 1.8.2.08 → 1.8.2.11** 감지를 확인했다. 공개 태그·manifest·EXE·blockmap의 버전·크기·SHA-256이 빌드 원본과 일치한다.
- 앱 업데이트·재시작 후 적용한다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포는 수행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.11-x64.exe` | 156312612 | `67a845f6fc3d537330b3e1f324720b8716acb5e2f57f260218489df3dbc480b8` |
| `Acedia-Setup-1.8.2.11-x64.exe.blockmap` | 163569 | `206eb717a641a118219292b6ed73924a51ea89900c5fd0aacfb64eee0133654b` |
| `latest-exe.json` | 256 | `ca1646889edc4f2cf09f36889c6a58d5be5348d7d7c0d0028c152b60c5714a2b` |
