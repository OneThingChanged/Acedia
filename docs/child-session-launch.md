# Codex·Claude 하위 세션 자동 준비

적용 버전: Standard EXE 1.8.2.11. 기존 실행 중인 이전 EXE에는 업데이트·재시작 후 적용한다.

부모가 하위 세션을 생성하고 첫 작업을 전달할 때 탭 열기, 창 show/focus,
전역 키보드·마우스 입력을 사용하지 않는다. Codex → Codex, Codex → Claude,
Claude → Codex, Claude → Claude를 지원한다.

## 한 번에 생성하고 지시하기

기존 Workspace MCP와 동일한 인증을 사용하는 `acedia_session_run`을 호출한다.
`projectId`는 부모가 등록된 로컬 프로젝트 ID이며, `folder`는 선택 사항인 기존
전용 작업 폴더의 절대 경로다. 등록된 프로젝트와 작업 폴더는 구분한다.

```json
{
  "projectId": "<parent-project-id>",
  "name": "독립 검증",
  "aiToolId": "claude",
  "requestKey": "validation_001",
  "message": "지정한 파일을 검토하고 검증 결과를 보고하세요.",
  "waitMs": 10000
}
```

`message` 또는 UTF-8 `messageBase64` 중 하나를 지정한다. 본문은 최대 64 KiB이며
`expectedSha256`으로 인코딩을 확인할 수 있다. 터미널에는 ASCII 수신함 참조만 전달한다.
자식은 `acedia_session_message_receive`로 원문을 읽는다.

반환된 `sessionId`는 첫 대화·transcript 이전에도 사용할 수 있는 Acedia ID다.
`acedia_session_run_status({"requestKey":"validation_001","waitMs":10000})`로 조회한다.
조회는 새 세션을 생성하거나 메시지를 전송하지 않는다. 원래 실행 요청의 준비는
호스트의 주기적 처리에서 계속된다. `conversationId`는 실제 CLI 대화가 확인된 뒤 연결된다.

HTTP 계약은 `POST /integration/v1/workspace/run`과 `.../run-status`다.
기존 loopback Workspace 토큰·호출 세션 인증을 그대로 사용한다.
임의 웹 Origin과 실행 중이지 않은 호출자를 허용하지 않는다.

## 실행 전 확정하는 값

- 같은 제공자: 부모의 실제 계정, 알려진 현재 모델·effort·Fast를 복사한다.
  이후 부모 설정이 바뀌어도 생성된 자식은 동적으로 모델을 상속하지 않는다.
- 다른 제공자: 해당 제공자의 계정·모델 기본값을 사용한다. Codex 모델이나 Fast를
  Claude로 복사하지 않는다.
- `accountId`, `modelSettings`, `dangerous`는 이번 새 자식에만 적용하는 명시적 선택이다.
  지원되지 않는 모델·effort·Fast나 삭제·미로그인 계정은 대체하지 않고 오류로 보고한다.
- Dangerous 기본값은 생성 UI와 동일하게 ON/OFF/최근 선택 기억을 따른다.
  부모 권한을 그대로 복사하지 않는다.
- Codex 라우팅은 부모의 확인된 분산 계정 또는 제공자 기본 선택을 사용한다.
  자동 선택은 계정 ID를 생략하며, 문자열 `auto`를 실제 계정 ID로 전달하지 않는다.
- 직접 세션을 만들거나 재시작할 때 사용하는 수동 계정 선택창 동작은 유지한다.
  API 하위 실행 경로는 실행 전에 선택을 확정한다.

Claude 모델 목록은 설치된 CLI 도움말의 지원 형식이며 계정의 실제 이용권 보증이 아니다.
실제 로그인 만료·이용권 오류는 원래 CLI/계정 설정에서 해결해야 한다.

## Trust와 준비 상태

API로 생성했다는 출처가 있는 로컬 자식만 현재 등록된 프로젝트 범위의 native Trust를
자동 확인한다. 전용 폴더가 프로젝트 밖이면 그 폴더만 허용한다. 실제 cwd, 표시된
폴더, 신뢰 범위, PTY 세대, 선택과 입력이 바뀌면 확인하지 않는다.

Codex의 `Trust and continue`와 최신 `Back to Agent Command Center` 화면을 구분한다.
Claude의 `Accessing workspace` 화면은 기본 `No, exit`에서 한 번 이동한 뒤, 같은
화면에서 `Yes, I trust this folder`가 선택된 것을 다시 읽고 Enter를 보낸다.
실행 훅 신뢰, API 키 선택, 로그인, 사용자 질문, 명령 승인은 자동 결정하지 않는다.

`phase`는 `creating`, `registered`, `starting`, `folder-trust`, `hook-review`,
`question`, `working`, `blocked`, `sending`, `sent`, `started`, `reconcile-required`를 구분한다.
원래 질문은 부모의 상태 조회 또는 task 결과에 포함한다. 생성 확인이나 PTY 존재만으로
입력 준비·작업 수락·완료를 판정하지 않는다.

Claude의 Ink 커서는 대기 중에도 하단 상태줄에 놓일 수 있으므로 현재 native 입력 프레임,
빈 입력/회색 placeholder, 상태줄과 질문·작업 표시를 함께 확인한다. 기존 초안이나
백그라운드 대기에는 메시지를 넣지 않는다.

## 수신·착수·재개

`started`는 작업 완료가 아니다. Codex는 정확한 handoff 본문 해시와 새 `task_started`를,
Claude는 실제 user UUID와 그 attachment/assistant 부모 연결을 따라 확인된 모델 응답을
요구한다. 따옴표로 인용된 도구 출력·assistant 본문·sidechain은 수신 증거가 아니다.
Claude의 user 기록만 추가된 경우에는 착수로 판정하지 않는다.

요청 키는 부모별 영속 기록이다. 같은 내용으로 다시 호출하면 같은 자식 ID를 반환하고,
내용이 바뀌면 거절한다. 생성 확인을 잃거나 전송 결과가 불확실해도 재생성·재전송하지
않는다. 앱 재시작 후 진행 중이던 요청은 `reconcile-required`로 전환해 기존 자식을 확인한다.
`run-status`의 영속 기록과 수신함/전달 조회를 대조하고, 새 키로 같은 작업을 복제하지 않는다.

준비 중인 실행은 최대 4개, 보관 기록은 최대 100개다. 최초 입력 준비는 최대 120초,
개별 API 대기는 최대 10초다. 부모나 자식 PTY가 교체되면 준비를 중단한다.
이 한도는 작업 실행 완료 시간을 제한하지 않는다.

## 계획 기반 작업 분담

`acedia_task_plan.tasks[].aiToolId`에 `codex` 또는 `claude`를 지정한다. 생략하면
부모 제공자를 사용한다. 제공자별 모델 정책과 계정 해석을 적용하며, Claude의 자동
정책은 설치된 CLI가 지원하는 경우 light에 Haiku, advanced에 Opus를 선택한다.
일반 작업은 Claude 기본 모델을 사용한다. 명시적 모델은 다른 모델로 대체하지 않는다.

작업 범위 잠금, 선행 관계, 실제 턴/모델·effort·Fast 확인, 질문, 결과 제출, 부모 검토,
필수 작업 통과 후 finish 계약은 유지한다. API 생성·준비·전달 서비스는 일반 하위 실행과
공유한다. 자식은 추가 위임하지 않는다.

## 검증

- 전체 회귀 검사 241개 파일·1,953개 테스트와 TypeScript/Vite 제품 빌드를 통과했다.
  `output/child-session-launch-tests-final.log`, `output/child-session-launch-build.log`에 결과를 기록한다.
- 네 가지 부모/자식 조합의 실제 서비스 통합: 계정·모델 확정, 첫 transcript 없는 실행,
  UTF-8 수신함, 정확한 착수, 결과 제출·검토, 요청 재호출·저장소 재로드.
- 삭제 계정, 미지원 모델/effort/Fast, 고급 실행 충돌, 초안, 질문·로그인,
  Trust 범위와 선택 변경, PTY 교체, 생성 응답 유실과 중복 방지 회귀 검사.
- 설치된 Claude CLI + 격리된 프로필 + loopback 가짜 모델로 native Trust 이동/확인,
  첫 지시의 실제 transcript 부모 연결, 원문 보존과 1회 알림을 검사했다.
- 설치된 Codex CLI + 격리된 계정 분산/모델 fixture로 native Trust, 준비 대기,
  첫 대화 ID 연결, 수신함 읽기·회신·재전송 방지를 검사했다.

실제 사용자 세션에 작업을 보내거나 창을 활성화하지 않는다.
재현: `ACEDIA_CLAUDE_HANDOFF_FIXTURE=1`로 `app/scripts/claude-question-cli-smoke.mjs`,
`ACEDIA_SESSION_MESSAGE_API=1`, `ACEDIA_DELIVERY_FIRST_MESSAGE=1`,
`ACEDIA_DELIVERY_IMMEDIATE=1`로 `app/scripts/codex-session-delivery-smoke.mjs`를 실행한다.
각 fixture는 설치된 실행 파일 경로 환경 변수와 현재 node-pty에 맞는 Electron 런타임이 필요하다.
