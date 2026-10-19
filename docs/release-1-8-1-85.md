---
type: Release
title: Acedia 1.8.1.85
description: "독립 Codex 세션 작업 분담, 모델 자동 정책, 작업 흐름과 사이드바 계층 및 Nogari 시작 설정 수정."
status: stable
last_updated: 2026-10-20
---

# Acedia 1.8.1.85

## 변경 내용

- 로컬 Codex 대화의 **작업 분담**으로 A가 계획·배정·진행 관리·결과 검토를 맡고 독립 하위 세션이 작업한다. 작업 난도·문맥·위험에 따른 모델·effort 정책과 시작 전 지정, 제한된 재시도를 제공한다.
- 작업 흐름 화면과 Remote에서 선행 조건, 진행·질문·승인·결과 검토 상태를 확인한다. 생성·전달 의도와 대화·턴을 저장하고 재시작 후 불확실한 작업을 중복 실행하지 않는다. 같은 파일 범위의 동시 쓰기를 조정하고 전달 시작과 검증 완료를 구분한다.
- 프로젝트 목록과 최근 대화에서 메인 세션 아래에 하위 세션을 접어 표시한다. 세션 수·effort·작업 상태를 함께 보고 직접 클릭해 대화를 연다. 하위 세션 생성과 상태 갱신은 선택한 대화·화면·입력 포커스를 옮기지 않는다.
- 보존 중이던 Nogari 시작 설정 수정을 포함한다. 중복된 관리 MCP TOML 블록을 정리하고 잘못된 설정·CLI 버전 오류 안내를 개선한다. 사용자 대화와 기존 계정·모델 설정을 유지한다.

업데이트 후 Codex 세션을 다시 시작하면 새 작업 도구를 사용할 수 있다. 대화에서 **작업 분담**을 켜고 요청하거나 **작업 흐름**에서 실행 상태를 확인한다. 유휴 A를 자동으로 다시 호출하는 기능, 실행별 토큰 합계와 Claude·Qwen 작업 분담은 후속 범위다.

Standard EXE 업데이트다. 기존 서명 APK **1.8.1.39/code 21**을 재사용한다. 프로젝트 카드 안에 작업을 직접 펼치는 [확장형 디자인 초안](https://github.com/OneThingChanged/Acedia/blob/v1.8.1.85/docs/mockups/project-board-task-flow.html)도 포함하며, 현재 제품은 프로젝트 보드의 **작업 흐름** 진입점으로 제공한다.

## English

- Add task delegation for local Codex sessions. A plans, assigns and reviews work performed in independent child sessions, with configurable model/effort policies, explicit overrides and bounded retries.
- Show dependencies, questions, approvals and reviewed results on desktop and Remote. Persist creation/delivery intent and exact conversation/turn evidence, prevent automatic replay after restart and coordinate overlapping write scopes.
- Group child sessions below their main session in both project navigation and recent conversations. Show effort and task states, and open conversations only on explicit selection without automatic focus or pane changes.
- Include the preserved Nogari startup fixes for duplicate managed MCP TOML blocks and clearer invalid configuration/CLI version diagnostics.

Restart Codex sessions after updating to load the new task tools. Idle-A automatic wake-up, run-level token totals and Claude/Qwen delegation remain future work. This Standard EXE release reuses the signed Android **1.8.1.39/code 21** artifact.

## 검증

소스 기능 검사는 임시 프로필·fixture에서 수행했다. 실제 사용자 세션에 시험 요청을 보내지 않았다.

- 배포 버전의 전체 **197개 파일·1,467개 검사** 통과: `output/exe-85-tests.log`. 이전 Nogari 검사 결과를 재사용하지 않았다.
- 실제 App과 생성 broker·전달 기록·stdio MCP·독립 CLI fixture를 연결한 작업 분담 통합 검사 통과: `output/exe-85-task-flow-smoke.log`. 병렬 작업→결과 제출→검토→선행 검증, 재시작 중복 방지, 프로젝트/최근 목록의 같은 하위 세션·선택·작업 상태, A의 초안·화면·포커스 보존과 Remote 390px·재접속을 확인했다.
- 기능 구현 중 설치된 Codex **0.163.0**의 첫 전달·실제 모델/effort 요청·정확한 턴·결과 검토를 임시 홈과 loopback Responses fixture에서 확인했다. 실제 모델 API를 호출하지 않았다.
- TypeScript·Vite production build와 네이티브 PTY 검사 통과: `output/exe-85-build.log`, `output/exe-85-pty-smoke.log`.
- 생성된 패키지의 실행·내장 Git·브라우저 bridge·Dashboard와 종료·트레이·보안 검사 통과: `output/exe-85-packaged-smoke.log`, `output/exe-85-packaged-lifecycle-smoke.log`.
- 설치 파일 FileVersion **1.8.1.85**, ProductVersion **1.8.1**, 크기와 SHA-256이 같은 빌드의 manifest와 일치한다. Authenticode는 **NotSigned**다. 기존 node-pty 종료 보조 프로세스의 `AttachConsole failed` 진단 뒤에도 필수 성공 marker와 종료 코드 0을 확인했다. Vite의 500KB 이상 번들 경고는 남아 있다.
- 기존 서명 APK **1.8.1.39/code 21**, arm64-v8a, 패키지 ID와 프로젝트 릴리스 인증서를 재검증했다. APK SHA-256: `f04502319e96f1cf3e2fb1a949ec6ae81dcefad4443877f31ca36c8c15190957`.
- 새 작업 엔진·파일 관찰·Remote 작업 화면 자산을 포함해 패키지의 런타임·렌더러 **320개 파일**이 고정 빌드 소스와 일치했다. `output/exe-release-1.8.1.85/local-verification.json`.
- 공개 GitHub에서 **1.8.1.84·1.8.1.83 → 1.8.1.85** 감지를 확인했다. 실제 업데이터로 EXE 전체를 다운로드하고 자산 세 개의 크기·SHA-256·URL·태그와 소스 커밋을 확인했다. `output/exe-85-public-verify.log`, `.build-tools/public-verified-1.8.1.85.json`.

## 배포 기록

- 공개 게시: **2026-10-20 00:41:51 KST**. [GitHub Release v1.8.1.85](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.85).
- 고정 소스·태그: `c32f70089027568063510896d131191b7669b472`.
- 공개 다운로드 검증 완료: **2026-10-20 00:42:51 KST**.
- 소스 제품 버전·Android 소스 versionName: **1.8.1.85**. npm 호환 버전: **1.8.1**.
- 기존 서명 APK **1.8.1.39/code 21** 재사용. 새 APK·Company·Microsoft Store 배포는 실행하지 않았다.

| 공개 자산 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Acedia-Setup-1.8.1.85-x64.exe | 151425086 | `e5791c6b22931ff920d04c1a36e6af6e3c5ded4aae4a4c8b616e6ba04c5861df` |
| Acedia-Setup-1.8.1.85-x64.exe.blockmap | 159620 | `3795b8fda12bbc787008a584c478a239240849bfbfd907db66c1577f8b4e7279` |
| latest-exe.json | 256 | `6680d5a0ef408f6b3a3c57c25eca4d82be2e8bc5b50ee22bede5daca8a12ac79` |

설정의 **Check → Update** 또는 다음 앱 실행의 업데이트 안내로 적용한 뒤 Codex 세션을 **Restart**한다. 이 배포에서 설치 프로그램과 실제 사용자 세션에 대한 시험 요청은 실행하지 않았다. 공개 게시·다운로드 검증 완료와 사용자 PC의 설치 완료는 별개다.
