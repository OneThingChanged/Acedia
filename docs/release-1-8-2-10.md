---
type: Release
title: Acedia 1.8.2.10
status: prepared
last_updated: 2026-11-12
---

# Acedia 1.8.2.10

- 프로젝트 보드를 프로젝트별 카드·부모/자식 세션 행과 우측 **내 확인** 목록으로 개선했다. 현재 작업과 누적 미확인 결과를 분리하고 질문·오류·결과별 탐색, 결과 한 개씩 확인, 앱 재실행 후 복원과 안정적인 필터·접기·찾기를 제공한다.
- 실제 Acedia 메시지 읽기 구간에서만 방향 있는 참조선이 흐른다. 대상 세션을 실행하지 않으며 참조 종료·실패 시 흐름이 멈춘다. 외부 도구 내부 참조를 추정하지 않는다. 모션 끄기와 시스템 모션 줄이기를 지원한다.
- Claude의 실제 **Waiting for N background agent(s) to finish** 표시를 감지해 사이드바·보드·Remote에 연보라색 대기 상태와 개수를 표시한다. 사이드바·보드 외곽선이 천천히 회전하고, 보드는 별도로 집계·필터링한다. 작업 재개·질문·취소·응답 종료와 구분하며 이전 미확인 결과는 유지한다.
- 백그라운드 대기 중 자동 휴면이나 예약 메시지 전송을 막고, 기존 터미널 파싱 결과를 재사용해 출력 묶음당 제한된 관측만 수행한다. 새 대화·세션 종료·교체 시 대기 표시와 타이머를 정리한다.
- **라이선스 변경:** Acedia 고유 부분에 개인의 비상업적 무료 사용을 허용하고 기업·기관·단체 및 개인의 사업·상업적 이용에는 사전 서면 허가를 요구한다. 재배포·소스 재사용·기능 수정도 별도 허가가 필요하다. 정본·설치 화면·포함 고지를 일치시키며, 이전 MIT 배포와 제3자 권한은 소급 변경하지 않는다. [사용 조건](https://github.com/OneThingChanged/Acedia/blob/main/docs/licensing.md)을 확인한다.
- 기존 서명 APK 1.8.1.39를 포함한다. 새 APK·Store·Company 배포는 포함하지 않는다. Remote 셸 캐시는 새 버전으로 갱신한다.

## English

- Redesign Project Board with grouped project/session rows and a question/error/result inbox. Keep current work separate from persistent unreviewed results; review individual results and preserve counts and positions across filters and folds.
- Animate directional references only during observed Acedia inbox reads, without activating the source session. Respect reduced-motion preferences and the board motion switch.
- Show Claude's native background-agent waiting in light purple with a count and an orbiting outline in the desktop sidebar and board, with compatible Remote status and queue handling. Distinguish foreground resumption, questions, cancellation and completion.
- Apply the Acedia Personal Use and Organization Permission License 1.0 from this release. Personal non-commercial use is free; business/organization use, redistribution, source reuse and modifications require prior written permission. Earlier MIT grants and separately licensed components retain their rights. Include the canonical terms with the installer.

## 검증

- 전체 240개 파일의 1,936개 테스트와 TypeScript/Vite 프로덕션 빌드를 통과했다.
- 현재 실행과 누적 결과 분리, 정확한 결과 한 개 확인·저장·복원, 명시적인 대기·중단 상태와 참조 종료, 안정적인 필터·접기 위치를 검사했다.
- 실제 tracked terminal의 ANSI 재도색을 사용해 Claude 대기 개수, 부모 재개, 보류한 응답 종료, 질문·취소, 출력 묶음 관측과 PTY 교체를 검사했다. GUI 자동화나 운영 세션 입력은 사용하지 않았다.
- 설치 화면용 RTF의 정본 보존·이스케이프·내용별 캐시, 잘못된 정본 거부, 이전 MIT·Expo·Pixel Agents 고지와 private 패키지 메타데이터를 검사했다.
- 패키지 검증과 공개 다운로드 결과는 게시 후 추가한다. 게시 완료는 사용 중인 PC의 설치·재시작 완료를 뜻하지 않는다.
