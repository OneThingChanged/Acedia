---
type: Release
title: Acedia 1.8.2.18
status: prepared
last_updated: 2026-11-15
---

# Acedia 1.8.2.18

- 프로젝트 보드의 기본 화면을 프로젝트별 세션 표로 바꾸고, 업무 전달 표와 기존 보드를 전환할 수 있게 했다. 현재 상태와 최근 수신 지시를 구분하며, 조직상의 부모를 실제 발신자로 추정하지 않는다.
- 전달의 저장·알림 전달·수신·원문 읽음·응답 시작을 각각 실제 시각으로 표시한다. 선택한 전달은 새 기록이 도착해도 유지되며 원문 상세 열람은 받는 세션의 읽음 상태를 바꾸지 않는다.
- `acedia_board`와 인증된 로컬 HTTP API로 같은 현황과 선택한 전달 원문을 조회한다. CLI 내부 에이전트를 Acedia 자식 세션으로 표시하지 않는다.
- 세션 메시지의 한 줄 개행을 데스크톱·Remote·Dashboard 채팅에서 보존한다. 기존 Markdown 표·코드·링크와 일반 대화의 문단 규칙, 원문 저장·복사 내용은 유지한다.
- 내장 세션 스킬과 메시지 전송 도구에 읽기 쉬운 인계 작성 지침을 추가했다. 중간 보고와 최종 인계를 구분하고 결론·완료한 일·남은 일·문제·근거를 나누도록 안내한다. 기존 원문을 자동으로 다시 작성하지 않는다.
- Codex의 native `priority`와 Fast 해제의 `null`을 상속할 때 하위 세션 생성이 차단되던 검증을 수정했다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 재사용한다.

## English

- Add a default project-grouped session table, handoff history and a switch to the existing board. Keep current execution, historical incoming requests and organizational parents distinct.
- Show separately observed delivery stages and load exact original requests on demand without changing recipient read receipts. Preserve the selected request during updates.
- Expose the same overview through the read-only `acedia_board` MCP tool and authenticated local HTTP API.
- Preserve original handoff line breaks in desktop, Remote and Dashboard Chat while retaining Markdown tables, code, links and exact copied text.
- Guide future handoffs toward readable interim/final reports with conclusions, completed and remaining work, issues and evidence links.
- Accept native Codex `priority` and explicit Fast-off `null` settings during child-session launch.
- Reuse the existing signed 1.8.1.39 Android APK for this Standard EXE release.

## 검증

- 전체 Vitest 259개 파일·2,086개 테스트가 실패·대기 없이 통과했다. 내장 세션 스킬 검증도 통과했다.
- 고정 소스의 프로덕션 빌드·패키지·공개 다운로드 검증 결과는 아래 배포 기록에 추가한다.
- 운영 세션의 입력·중단·재시작과 GUI 자동화는 수행하지 않는다. 공개 게시와 사용자 PC의 설치·업데이트 확인은 구분한다.
