---
type: Guide
title: 부모·자식 세션 조직도
description: 프로젝트 안의 세션을 폴더처럼 묶고 작업 폴더·추가 지침·모델 기본값을 상속한다.
status: implemented
last_updated: 2026-10-04
sources:
  - resource: ../app/src/components/SessionOrganization.tsx
  - resource: ../app/src/lib/sessionHierarchy.ts
  - resource: ../app/src/lib/spawn.ts
  - resource: ../app/electron/services/workspace-management.mjs
  - resource: ../app/scripts/electron-session-organization-smoke.mjs
---

# 부모·자식 세션 조직도

왼쪽 Browser hub 아래의 **조직도**에서 실제 저장된 세션 관계를 확인한다.
기존 세션은 프로젝트 직속으로 표시된다. HTML 초안의 예시 세션은 앱에 추가하지 않는다.
프로젝트를 선택하면 연결선이 있는 트리가 나타나고, 전체 프로젝트에서는 프로젝트별 관계를 모아 본다.
기본 필터는 활성 세션이다. 활성 자식의 잠든 부모는 구조를 이해할 수 있도록 함께 표시한다.
전체 세션 필터는 잠든 세션과 비활성 세션도 포함한다.

세션 카드를 선택하면 오른쪽에서 부모, 상속 설정, 생성 주체를 확인한다.
자식 세션 버튼은 기존 생성 창에 부모와 상속 선택을 추가하고 실제 독립 세션을 생성한다.
새 자식은 별도의 Acedia ID와 대화 기록을 사용하며 조직도에서 생성해도 백그라운드로 시작한다.
대화 열기는 기존 계정 선택·작업창 소유권 흐름을 사용한다.

## 조직과 실행의 구분

`sessionHierarchy.parentId`는 사용자가 변경할 수 있는 조직상의 부모다.
`createdById`는 생성 주체이며 부모를 옮길 때 바뀌지 않는다.
사용자가 창에서 자식을 생성하면 생성 주체는 사용자다. Acedia MCP로 생성하면 호출한 세션을 기록한다.
MCP 호출자가 같은 프로젝트에서 세션을 생성할 때만 조직상의 자식으로 연결한다.
다른 프로젝트에 생성한 세션은 해당 프로젝트 직속이며 호출한 세션의 생성 기록만 유지한다.

같은 프로젝트 안에서만 부모를 선택할 수 있다. 자신이나 자손 아래로 이동하는 순환 관계는 금지한다.
저장 데이터의 잘못된 부모·순환 관계는 복원할 때 프로젝트 직속으로 정리한다.
조직도는 탭, 분할 화면, 다른 작업창의 세션 소유권을 대신하지 않는다.
부모와 자식은 각각 시작·대기·종료하며 관계 이동 때문에 실행을 중단하거나 대화를 분기하지 않는다.
이 기능은 Acedia 세션의 구조를 관리한다. CLI가 생성한 내부 작업자는 기존 작업자 모니터가 계속 담당한다.
생성 기록을 추가했다고 AI 작업의 자동 위임·결과 회수가 새로 활성화되는 것은 아니다.

## 상속 규칙

| 항목 | 동작 |
| --- | --- |
| 작업 폴더 | 부모의 유효 작업 폴더를 이어받는다. 상속을 끄면 절대 경로를 직접 지정한다. 가상 조직 관계가 실제 디스크 폴더를 생성하지는 않는다. |
| 추가 지침 | 상위 세션부터 자신의 지침까지 순서대로 합친다. 상속을 끄면 자신의 지침만 추가한다. 폴더의 AGENTS.md·CLAUDE.md는 CLI의 기존 탐색 규칙을 따른다. |
| 모델·effort | 같은 제공자의 로컬 Codex·Claude 세션에서 명시적으로 켤 수 있다. 자식의 개별 값은 보존한다. 기존 모델 선택 화면에서 모델을 직접 바꾸면 상속을 해제한다. |
| 계정·권한·실행 옵션 | 부모의 계정이나 권한 확인 생략을 복사하지 않는다. 기존 새 세션 기본 설정과 사용자의 생성 창 선택을 사용한다. |
| 대화 | 각 세션의 ID와 복원 대상이 유지된다. 부모 대화를 자동으로 복사하거나 fork하지 않는다. |

변경 저장 후 다음 실행에서 상위 설정을 다시 계산한다. 실행 중인 PTY를 자동 재시작하지 않는다.
이미 실행 중인 세션의 작업 폴더 기록은 실제 새 프로세스가 시작된 뒤에만 갱신한다.
기존 프로세스에 다시 연결할 때는 기록을 변경하지 않는다.
기존 대화는 원래 폴더에서 계정별 복원 검증을 수행하고, 실제 실행에는 새 상속 폴더를 사용한다.
대화 ID별 `sessionHierarchy.resumeContext`를 저장해 이후 재실행에서도 원래 복원 경로를 유지한다.
Codex는 폴더가 달라질 때 `tui.resume_cwd="current"`로 현재 실행 폴더를 사용한다. [Codex 공식 명령 문서](https://learn.chatgpt.com/docs/developer-commands#codex-resume)
다른 폴더에서 Claude 대화 ID를 직접 복원하는 기능은 Claude Code 2.1.223 이상이 필요하다. [Claude 공식 세션 문서](https://code.claude.com/docs/en/sessions#resume-a-session)
부모 삭제 시 직접 자식은 한 단계 위로 이동하고, 삭제 직전의 유효 폴더·지침·모델을 개별 설정으로 보존한다.
자식의 대화 ID와 생성 주체도 유지한다.

Codex의 추가 지침은 기존 보조 작업자 지침과 합쳐서 한 번의 `developer_instructions` 설정으로 전달한다.
로컬 Claude의 추가 지침은 사용자 고급 실행 인수와 별도로 검증한 뒤 `--append-system-prompt`로 전달한다.
복원한 대화에서도 변경된 지침을 읽도록 `--system-prompt-snapshot off`를 함께 사용하며,
이 옵션은 Claude Code 2.1.257 이상이 필요하다. [Claude 공식 CLI 문서](https://code.claude.com/docs/en/cli-reference#system-prompt-flags-in-resumed-conversations)
상속을 포함한 추가 지침은 20,000자 이내로 제한한다. 운영체제·CLI의 인수 길이 제한도 적용된다.
SSH Claude 및 다른 제공자의 추가 지침, SSH 모델 상속은 현재 지원 범위에 포함되지 않는다.

## 저장과 검증

관계와 상속 정보는 기존 `multiagent.agents.v1`의 선택적 `sessionHierarchy` 필드에 저장한다.
새 저장소나 파괴적 마이그레이션을 만들지 않으며 기존 공유 워크스페이스 동기화를 그대로 사용한다.
세션의 개별 모델은 기존 `modelSettings`, 실제 사용한 로컬 작업 폴더는 기존 `folder`에 남는다.
SSH의 폴더 재정의는 원격 경로에 적용하고 로컬 프로젝트 참조와 구분한다.

`npm run electron:organization-smoke`는 별도 임시 프로필과 IPC fixture를 사용해 실제 App을 검증한다.
사용자 프로필과 실행 중인 CLI에는 접근하지 않는다. 자식 생성, 관계 저장, 폴더·모델·지침 전달,
직접 모델 변경, 순환 방지, 재시작 복원, 동료 창의 저장 이벤트, 기존 브라우저 이동 및 화면 배치를 확인한다.
상속 폴더가 바뀐 세션의 기존 대화 복원과 후속 실행의 원래 조회 경로 유지도 검증한다.
부모 삭제와 잘못된 관계 복원은 `sessionHierarchy.test.ts`에서 검증한다.
