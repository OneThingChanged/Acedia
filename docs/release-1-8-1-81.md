---
type: Release
title: Acedia 1.8.1.81
description: "Remote 터미널 마지막 줄 잘림과 오래된 Luna 모델 표시 수정."
status: internal
last_updated: 2026-10-13
---

# Acedia 1.8.1.81

## 변경 내용

- Remote·Dashboard 터미널의 마지막 줄이 잘리는 문제를 수정했다. 안쪽 여백을 제외한 실제 표시 영역에 맞춰 확대 비율을 계산한다. 입력창 높이나 분할 화면 크기가 바뀌면 바로 다시 맞춘다.
- 실제로 **Sol · xhigh · Fast**를 사용하는데 모델 선택창에는 이전 **Luna · max**가 남을 수 있는 문제를 수정했다. native 설정 알림 이후 화면 갱신을 기다리는 시간을 2초로 제한하고, 현재 터미널 상태줄과 다시 맞춘다. 같은 설정 알림은 대기 시간을 연장하지 않는다.
- 모델 선택창 등으로 상태줄이 가려지면 확인된 native 설정을 유지한다. 사용자가 저장한 다음 시작용 모델 설정과 Fast 값도 보존한다. 데스크톱·Remote·Dashboard는 공통 호스트 서비스를 통해 같은 결과를 조회한다.
- Remote 웹 캐시는 **v95**다.

구현 규칙과 상세 검증은 [Remote service](remote-service.md),
[세션별 마지막 실행 설정](agent-launch-options.md#세션별-마지막-실행-설정)에 기록했다.

## English

- Fit Remote and Dashboard terminals to the content area excluding padding so the final row remains visible. Refit when the composer or split pane resizes.
- Reconcile stale routed model snapshots with the visible native footer after a bounded two-second repaint wait. Repeated identical notifications do not extend that wait.
- Retain confirmed settings while the footer is hidden, preserve explicit next-start choices, and share the corrected model lookup across desktop, Remote and Dashboard.

## 검증

- 실제 Remote·Dashboard SSE fixture에서 PC·모바일·분할 화면과 입력창 높이 변경을 검증했다. 마지막 줄과 영역 경계에 대한 **22개 검사**를 통과했다. 수정 전의 16px 잘림도 재현했다. 실제 사용 중인 세션에는 입력을 보내지 않았다.
- 터치·모바일 레이아웃 관련 **11개 검사**를 통과했다.
- 이전 Luna snapshot과 이미 표시된 Sol 상태줄이 충돌하는 회귀 검사는 수정 전 실패했고 수정 후 통과했다. 모델 기억·모델 서비스·터미널 실행·분산 대화 관련 **111개 검사**를 통과했다.
- 네 자리 버전 관련 **3개 검사**와 데스크톱·Android 소스 버전, 설치 파일명, 문서 참조 **81개**의 일치·존재 검사를 통과했다. Git diff의 공백 검사도 통과했다.
- 터미널 검증 증빙: `output/remote-terminal-bottom-baseline.log`, `output/remote-terminal-bottom-fixed.log`, `output/remote-terminal-smoke/`.
- 이 작업에서는 전체 검사와 설치 파일 검증을 새로 실행하지 않았다. 앞선 1.8.1.80의 빌드·전체 검사 결과를 이번 버전의 검증으로 간주하지 않는다.

## 현재 상태

소스 버전은 **1.8.1.81**, npm 호환 버전은 **1.8.1**이다. Android 소스 versionName도
1.8.1.81로 맞췄으며 이번 작업에서 새 APK를 만들지 않아 versionCode는 21을 유지했다.

이번 요청 범위는 문서 정리와 Git 커밋·푸시다. 설치 파일 빌드, GitHub Release 게시,
Microsoft Store 제출과 사용 중인 앱 업데이트는 실행하지 않았다. 현재 공개 EXE는
[1.8.1.80](release-1-8-1-80.md)이며 위 수정은 다음 설치본 배포 시 포함된다.
