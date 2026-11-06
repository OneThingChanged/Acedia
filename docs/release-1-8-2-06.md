---
type: Release
title: Acedia 1.8.2.06
status: preparing
last_updated: 2026-11-06
---

# Acedia 1.8.2.06

- 프로젝트 보드를 전용 새 창으로 연다. 프로젝트별 부모·자식 노드, Sleeping·종료 세션, 진행·응답 필요·검토·완료·중단 상태와 사용자 확인 목록을 표시한다. 노드 더블클릭은 담당 작업창을 재사용하며 꺼진 세션을 자동 실행하지 않는다.
- 보드 창 위치·크기·최대화·확대율·이동·접기 상태와 확인 완료 기록을 저장한다. 새 결과·새 작업 시도는 다시 미확인으로 표시하고, 일반 답변 완료와 작업 분담의 검증 완료를 구분한다. 추가 지시는 해당 Chat 화면에서 작성한다.
- 보드 상단에 프로젝트·세션별 컴퓨터 사용 신호를 표시한다. 데스크톱 조작과 내장 브라우저 작업을 구분하며, 외부 도구는 식별 가능한 hook 신호가 있어야 표시한다. 상태 갱신으로 작업창 포커스를 이동하지 않는다.
- Remote·Dashboard에서 여러 메시지를 예약하면 첫 메시지 이후 입력 준비 거절로 큐가 멈추던 경로를 수정했다. 서버가 이전 전송의 턴과 비어 있는 입력란을 확인한 뒤 다음 메시지를 전송한다. 전송되지 않은 입력 준비 거절은 자동으로 재확인하며 대화 변경·종료·전송 결과 불명확 상태의 중복 전송 방지는 유지한다.
- 계정 기록 저장 실패가 계정 목록·한도·배정 조회까지 계속 막던 문제를 수정했다. 한도 100%인 계정도 표시하고, 공간 부족과 파일 접근 오류를 구분하며 저장 다시 시도로 앱 재시작 없이 복구할 수 있다.
- 기존 서명 APK 1.8.1.39를 재사용한다. 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Open Project Board in its own window, with project/session trees, work states and a persistent human review inbox. Double-click a node to reuse its Acedia workspace without automatically starting an offline session.
- Remember window placement, zoom and collapsed nodes. Display session-bound desktop/browser activity signals without stealing focus; external tools require compatible hook signals.
- Fix Remote and Dashboard queues stopping after their first message. Check the previous accepted turn and the actual empty composer before advancing; preserve unknown-outcome replay protection and existing terminal drafts.
- Keep routing accounts, exhausted quotas and assignments readable after a recoverable write failure. Distinguish storage error types and retry saving without restarting the app.

## 검증

- 전체 229개 파일의 1,843개 테스트와 TypeScript/Vite 빌드를 통과했다. 큐·전송·인증 HTTP 관련 5개 파일의 76개 검사를 포함한다.
- 같은 지연 상태에서 기존 큐 소스는 3개 중 1개 전송 후 2개가 입력 준비 오류로 남았고, 수정 소스는 3개를 순서대로 모두 전송했다. 실제 큐 함수를 Node VM에서 검증했으며 운영 세션에 메시지를 보내지 않았다.
- 보드 창·이동 어댑터, 노드 레이아웃, 서버 렌더링, 확인 상태 저장과 도구 신호를 검증했다. 창 조작·브라우저 UI 자동화는 수행하지 않았다.
- 패키지 API, 소스 일치, NSIS CRC·압축 내용·설치 전 시작 검사 및 공개 다운로드 검증은 배포 절차에서 확인하고 아래에 기록한다.

## 공개 배포 기록

배포 검증 후 기록한다.
