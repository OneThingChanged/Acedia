---
okf_version: "0.2"
---

# 세션별 개인 메모

세션마다 사람이 짧게 적어 두는 자유 텍스트 메모다. 작업 지시나 AI 메모리로
취급하지 않는다. [HTML 초안](mockups/session-notes.html)을 바탕으로 구현했다.

## 사용 방법

- 데스크톱 세션 상단의 메모 아이콘으로 편집 패널을 열고 닫는다. 저장된 메모가
  있으면 아이콘에 작은 점을 표시한다. 채팅과 터미널은 같은 메모를 사용한다.
- 사이드바의 세션 우클릭 → **세션 메모**로 실행하지 않은 세션도 편집한다.
  현재 패널에 그 세션의 메모만 열며, 현재 대화를 선택하거나 CLI를 시작하지 않는다.
  표시할 패널이 없는 화면에서는 별도 편집 창을 사용한다.
- 분할 화면마다 메모를 열 수 있다. 넓은 패널에서는 오른쪽, 좁은 패널에서는
  대화 아래에 표시한다. 대화 스크롤과 메모 편집 영역은 독립적이다.
- Remote와 로컬 Dashboard에도 메모 버튼과 세션 메뉴를 제공한다. 휴대폰에서는
  편집 영역을 대화 위에 배치한다. 메모 복사, Escape로 닫기, Ctrl/Cmd+S 즉시 저장을 지원한다.

## 저장과 수명

메모는 Acedia의 등록 세션 ID를 키로 공통 사용자 프로필의
`session-notes.sqlite`에 저장한다. 네이티브 Codex/Claude/Qwen 대화 ID, 계정,
모델, 프로젝트 경로와 독립적이다. 이름 변경, 세션 종료/재시작, 프로젝트 이동으로
메모가 바뀌지 않는다. 새 ID로 만든 세션과 하위 세션에는 자동 복사하지 않는다.

입력을 멈춘 뒤 500 ms에 자동 저장하고, 편집 영역을 떠나거나 닫을 때도 저장한다.
데스크톱의 정상 종료 절차는 진행 중인 메모 저장을 기다린다. IME 조합 중에는 저장을
미루며, 조합이 끝난 뒤 현재 입력을 저장한다. 원문 공백·줄바꿈을 보존하고 저장 한도는
UTF-8 기준 64 KiB다. 한도를 넘으면 입력을 지우지 않고 줄일 수 있게 안내한다.

미저장 초안은 해당 기기의 `acedia.session-note-draft.v1.<id>` 브라우저 저장소에도
임시 보관한다. 서버 저장을 확인하면 임시 초안을 제거한다. 네트워크 오류나 앱 재시작
후에는 초안을 복구한다. 임시 보관이 불가능하면 편집기에 안내한다.

세션 등록을 삭제해도 메모를 자동 삭제하지 않는다. 등록되지 않은 ID는 UI/API에서
조회할 수 없으며, 같은 등록 ID를 복원하면 기존 메모를 다시 사용할 수 있다.

## 여러 창과 Remote의 동시 편집

SQLite 트랜잭션과 메모별 revision으로 변경을 검사한다. 오래된 revision의 저장은
현재 저장된 메모와 함께 거절한다. 편집기의 내 입력은 보존하며 **저장된 내용 보기**,
**저장된 내용 사용**, **내 메모로 저장**을 제공한다. 내 초안을 선택해도 서버가 다시
변경되었다면 덮어쓰지 않고 충돌을 다시 표시한다.

저장 중 추가로 입력한 내용도 이전 응답으로 되돌리지 않는다. 저장 응답이 유실된 경우
같은 내용의 재시도는 revision을 늘리지 않고 확인한다. 데스크톱은 메모 변경 이벤트를
사용하고 열린 편집기는 10초 간격·창 복귀 시 다시 확인한다. Remote는 편집기를 열었을
때만 10초 간격으로 확인하며, revision이 같으면 본문을 다시 전송하지 않는다.

## AI와 데이터 경계

메모 본문은 대화 기록, 생성된 프롬프트, 작업 전달, 작업 분담 요청, 공유 작업 공간
스냅샷과 MCP 세션 목록에 포함하지 않는다. 프로젝트 폴더나 AGENTS.md에도 기록하지 않는다.
사람이 복사해서 대화에 붙여 넣으면 그 내용은 일반 사용자 메시지가 된다.

- 데스크톱 IPC: `session_notes_get`, `session_notes_save`.
- 인증된 Remote/Dashboard: `GET/POST /api/session/notes`.
- POST에는 같은 출처, JSON 형식, 등록된 세션 ID, 본문 한도와 revision 검사를 적용한다.
- 자동 상태 폴링에는 본문을 포함하지 않으며 AI용 메모 도구를 추가하지 않는다.

## 구현 위치와 검증

- [저장소](../app/electron/services/session-notes.mjs): SQLite 원자 저장·등록 ID별 독립 데이터.
- [공통 편집 상태](../app/electron/shared/session-notes-client.mjs): 자동 저장·초안 복원·충돌·IME 처리.
- [데스크톱 패널](../app/src/components/SessionNotes.tsx),
  [패널 연결](../app/src/components/PaneSlot.tsx),
  [Remote 편집기](../app/electron/remote-pwa/session-notes.js).
- 단위/API 검사: `session-notes.test.mjs`, `session-notes-client.test.mjs`,
  `session-notes-api.test.mjs`, `ipc-contract.test.mjs`.
- 실제 Electron 검증: `node scripts/electron-session-notes-smoke.mjs` (`app/`).
  별도 프로필·가상 터미널과 실제 메모 저장소를 사용한다. 데스크톱의 분할 편집·복사·충돌,
  꺼진 세션 메모의 선택/실행 불변과 채팅↔터미널 전환, Remote/Dashboard 공유 저장·새로고침·1280/390/320 px를 검사한다.
  결과와 화면은 `output/session-notes-validation/`에 남긴다.

2026-10-22 검증 결과: 전체 205개 파일·1,551개 검사 통과,
TypeScript 검사와 Vite 프로덕션 빌드 통과. 별도 Electron 프로필에서 데스크톱·Remote·Dashboard
화면 검증도 통과했다. 전체 결과는 `output/session-notes-full-tests-fixed.log`,
빌드 결과는 `output/session-notes-build.log`, 화면 검증 결과는
`output/session-notes-validation/passed.json`에 기록했다.

현재 소스 구현이며 설치 파일 게시와 실행 중인 사용자 앱의 업데이트는 별도 배포 단계다.
