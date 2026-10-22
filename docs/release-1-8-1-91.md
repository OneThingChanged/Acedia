---
type: Release
title: Acedia 1.8.1.91
status: preparing
last_updated: 2026-10-23
---

# Acedia 1.8.1.91

- **프로젝트별 Codex 폴더 신뢰 자동 확인**을 추가했다. **작업 흐름 → 모델 정책 → 프로젝트 시작 자동화**에서 켜고 저장한다. 기본은 꺼짐이며 데스크톱·Remote·Dashboard에서 같은 설정을 사용한다. 승인한 프로젝트와 그 하위 폴더의 새 세션·재시작에 적용한다.
- 실제 작업 폴더와 완전한 `Folder access` 화면, 신뢰가 적용될 Git 루트를 확인하고 Enter를 한 번 보낸다. 긴 경로의 줄바꿈과 전체 너비 TUI 표시를 처리한다. 프로젝트 경로 변경 시 다시 설정하며 범위를 벗어난 경로·불확실한 입력은 자동 확인하지 않는다. 창·포커스·Dangerous mode를 유지한다.
- 하위 작업의 **폴더 신뢰·시작 훅 승인 대기**를 표시하고, 대기 시간은 30초 시작 제한에서 제외한다. 확인이 끝나면 같은 세션의 모델·대화·입력 준비를 검사해 첫 작업을 한 번 전달한다. 대기 중 취소하면 전송하지 않는다. API도 `ready` 대신 `folder-trust`·`hook-review` 이유를 반환한다.
- 훅 실행·명령 승인·사용자 질문·로그인·Windows sandbox 초기 설정은 기존 확인 경로를 사용한다. 이미 취소된 작업이나 전달 여부가 불확실한 요청은 자동으로 재실행하지 않는다.

Standard EXE 업데이트다. 기존 서명 APK **1.8.1.39/code 21**을 재사용한다.

## English

- Add opt-in, project-scoped automatic Codex folder trust in **Task flow → Model policy → Project startup automation**. Desktop, Remote and Dashboard share the setting. Apply it to new and restarted local sessions inside the approved project directory.
- Validate the actual working directory, complete native folder dialog and repository trust scope before one confirmation. Handle wrapped paths and full-width TUI painting. Preserve window focus and Dangerous mode; changing the project directory requires a new setting.
- Keep workers waiting for folder trust or startup hook review without consuming the launch timeout. After confirmation, verify the same session's model, conversation and input readiness before a single initial delivery. Cancellation prevents delivery. Report `folder-trust` or `hook-review` instead of `ready`.
- Keep hook execution, command approvals, questions, sign-in and Windows sandbox setup on their existing confirmation paths. Never replay cancelled work or uncertain submissions automatically.

This Standard EXE release reuses the signed Android **1.8.1.39/code 21** artifact.

## 검증

- 기능 구현 단계의 전체 **206개 파일·1,564개 검사**와 TypeScript·Vite production build 통과: `output/startup-automation-full-tests-final.log`, `output/startup-automation-build.log`.
- 실제 main-process bridge, 설치 Codex의 폴더 신뢰 1회 확인·첫 턴·모델·결과·검토·복원과 데스크톱/390px 웹의 설정 저장·복원·해제 검사 통과: `output/startup-automation-main.log`, `output/startup-automation-native-final.log`, `output/startup-automation-electron.log`. 격리된 프로필과 loopback fixture를 사용했으며 실제 사용자 대화에는 시험 요청을 보내지 않았다.

- 배포 버전 확정 후에도 전체 **206개 파일·1,564개 검사**와 네이티브 PTY 검사 통과: `output/exe-91-tests.log`, `output/exe-91-pty-smoke.log`.

EXE 빌드·패키지 검증·공개 다운로드 결과는 완료 후 기록한다.

## 배포 기록

준비 중. 공개 게시와 사용자 PC의 업데이트 설치는 별개다.
