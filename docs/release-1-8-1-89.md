---
type: Release
title: Acedia 1.8.1.89
description: "기존 세션 백그라운드 시작, 현재 부모 기준 사이드바 트리와 hook 없는 재개 세션의 작업 전달 보완."
status: validating
last_updated: 2026-10-22
---

# Acedia 1.8.1.89

## 변경 내용

- **`acedia_session_start` MCP**와 인증된 **`POST /integration/v1/workspace/start` API**로 기존 로컬 Codex·Claude·Qwen·Antigravity 세션을 백그라운드에서 시작한다. 창 표시·복원·포커스·탭 선택·입력 초안을 유지하며, 이미 실행 중인 CLI는 그대로 둔다. 새 세션 생성과 작업 입력은 별도다.
- 기존 **`POST /integration/v1/sessions/:agentId/activate`**도 같은 백그라운드 경로를 사용한다. Codex·Claude 대상과 성공 상태 `202`를 유지하되 실제 PTY 생성 확인 후 응답한다. 다른 창 소유·SSH·지원하지 않는 도구와 설정 변경으로 잠긴 대상은 오류를 반환한다. Remote/Dashboard의 명시적 Restart와 데스크톱의 보이는 창 열기는 각각 기존 동작을 유지한다.
- 사이드바의 프로젝트 목록과 최근 대화를 **현재 `parentId` 기준 트리**로 묶는다. AIHub에서 생성한 세션을 RnDHub 아래로 옮겼을 때도 RnDHub 아래에 표시하고, 행의 관계 설명도 현재 상위 세션을 따른다. 생성 기록은 보존한다.
- 새 트리는 펼쳐 표시하며 접기 상태를 저장한다. 프로젝트 목록과 최근 대화에서 상태를 공유하고, 검색이나 다른 탭에서 자식을 선택하면 조상 경로를 펼친다. 접힌 자식도 검색으로 찾을 수 있고, 상태 필터에서 필요한 부모는 문맥으로 표시하되 활성 수에 포함하지 않는다. 트리 접기만으로 CLI를 시작·종료하거나 선택을 바꾸지 않는다.
- **`WAIT/ready`인데 작업 전달이 거절되던 재개 세션**을 보완했다. hook이나 Chat 조회가 로그 경로를 등록하기 전에도 선택한 계정의 정확한 대화 ID로 transcript를 찾는다. 캐시와 15초 실패 조회 제한을 사용하며 기존 256KB tail·시작 이후 갱신·대화 ID·질문·작업 중·초안·동시 입력 검사를 유지한다.
- 전달 거절 오류에 로그 없음·질문 대기·실행 중·입력 준비 미완료·대화/세션/입력 변경의 판정 코드를 포함한다. 전송·수신·새 턴 시작 증거와 요청 키의 중복 전송 방지를 유지한다. `active`나 목록의 `ready`만으로 작업 접수를 성공으로 처리하지 않는다.

업데이트 후 호출 CLI를 **Restart**하면 새 시작 MCP 도구가 나타난다. 기존의 `nothing sent` 거절로 전달되지 않은 작업은 상태를 다시 확인하고 **같은 본문·요청 키**로 재시도한다. 이미 전송되었거나 불확실한 요청은 먼저 기존 delivery receipt를 확인한다. [Workspace MCP](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.89/docs/workspace-mcp.md), [세션 조직도](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.89/docs/session-organization.md)를 참고한다.

Standard EXE 업데이트다. 기존 서명 APK **1.8.1.39/code 21**을 재사용한다.

## English

- Add **`acedia_session_start` MCP** and authenticated **`POST /integration/v1/workspace/start`** to start existing local Codex, Claude, Qwen and Antigravity sessions in the background. Preserve window visibility, restoration, focus, pane selection and drafts. Leave an already-running CLI running; do not create sessions or submit prompts.
- Route the existing **`POST /integration/v1/sessions/:agentId/activate`** through the same background launcher. Retain its Codex/Claude scope and `202` success status, acknowledging an actual PTY. Reject detached, SSH, unsupported or locked targets. Keep explicit Remote/Dashboard Restart and user-requested visible navigation separate.
- Group sidebar conversations by their **current `parentId`**, even when the creator differs. Preserve creation provenance, show the current parent in metadata, remember folding across both lists, and reveal ancestors when selecting a child. Keep collapsed children searchable and include filtered parent context without inflating active counts. Folding alone never changes CLI lifecycle or selection.
- Fix delivery rejection for resumed sessions listed as **`WAIT/ready`** before a hook or Chat lookup registers the transcript path. Resolve the exact conversation within the selected account, retaining bounded tail reads, freshness, identity, question, busy, draft and concurrent-input checks. Cache successful lookups and throttle missing transcripts.
- Include a specific rejection code and preserve exact-message receipt, new-turn confirmation and request-key deduplication. A live terminal or catalog `ready` state does not itself confirm task acceptance.

Restart the calling CLI after updating to load the new tool. Retry requests rejected with `nothing sent` using the original message and request key after refreshing state. Inspect the original receipt before retrying an uncertain delivery. This Standard EXE release reuses the signed Android **1.8.1.39/code 21** artifact.

## 검증

- 배포 버전을 확정한 전체 **202개 파일·1,534개 검사** 통과: `output/exe-89-tests.log`. 실제 main reader 회귀 검사를 포함하며 hook 경로가 없는 계정 binding에서 정확한 대화 조회·캐시·타 계정 거부를 확인했다.
- 버전·APK 검증·runtime variant **3개 파일·15개 검사**와 네이티브 PTY 검사 통과: `output/exe-89-version-tests.log`, `output/exe-89-pty-smoke.log`.
- 실제 Electron 임시 프로필·모의 CLI에서 두 시작 HTTP API의 OFFLINE 시작, PTY 확인과 활성 CLI 재시작 부재를 확인했다. 창의 show/showInactive/focus/restore 호출 0회, 기존 화면·선택·초안·등록 ID와 다른 CLI 보존을 확인했다. `output/session-start-family-delivery-electron.log`.
- 실제 전체 앱 fixture에서 다른 생성자의 Shader 세션을 RnDHub 아래에 한 번씩 표시하고, 접기·복원·양 목록 일치·검색·선택 후 조상 펼침과 가로 넘침 부재를 확인했다. `output/sidebar-session-family-electron.log`.
- 설치된 네이티브 Codex를 격리된 가짜 계정·로컬 응답 서버에서 실행했다. 첫 대화 완료 후 재개하고 hook/Chat 경로 없이 실제 stdio MCP의 수신·새 턴 시작·한글·기존 문맥·중복 전송 방지를 확인했다. `output/session-delivery-resume-cli-after.log`. 실제 사용자 세션에는 테스트 작업을 보내지 않았다.

## 배포 기록

버전 검증·EXE 빌드·패키지 검사·공개 게시·다운로드 검증 결과는 완료 후 기록한다.
