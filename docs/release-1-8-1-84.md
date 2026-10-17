---
type: Release
title: Acedia 1.8.1.84
description: "Codex 0.163에서 계정 라우팅 세션을 재개할 때 작업 폴더 누락으로 종료되는 문제 수정."
status: stable
last_updated: 2026-10-18
---

# Acedia 1.8.1.84

## 변경 내용

- Codex **0.163.0**에서 계정 라우팅 세션을 재개할 때 `tui.resume_cwd="current" requires --cd when using a remote workspace` 오류로 종료되는 문제를 수정했다. 라우팅된 Codex 실행 인수에 실제 작업 폴더를 `--cd`로 전달한다.
- 사용자가 고급 실행 설정에 지정한 `--cd`·`-C`는 중복하거나 덮어쓰지 않는다. 기존 대화 ID와 계정·모델·권한 전달을 유지하며, 대화 기록을 초기화하지 않는다.

Standard EXE 업데이트다. **업데이트 후 실패한 세션을 Restart**하면 기존 대화를 재개할 수 있다. 기존 서명 APK **1.8.1.39/code 21**을 재사용하며 새 APK를 생성하지 않는다.

## English

- Fix routed Codex sessions exiting on resume in Codex **0.163.0** with `tui.resume_cwd="current" requires --cd when using a remote workspace`. Pass the effective working directory explicitly to the remote TUI.
- Preserve explicit `--cd`/`-C` launch overrides, conversation identity, account selection, model and permission handling. Existing conversation history is retained.

Update the desktop host, then **Restart the affected session** to resume its conversation. This Standard EXE release reuses the signed Android **1.8.1.39/code 21** artifact.

## 검증

- 설치된 Codex **0.163.0**과 격리된 로컬 모의 API에서 같은 오류를 재현했다. 수정 후 같은 대화 ID로 재개하고 이전 메시지 보존·작업 완료·캐시 식별자·계정 분리를 확인했다. 외부 모델 API를 호출하지 않았다.
- 작업 경로 전달, 명시적 경로 옵션, 권한 처리와 세션 실행 관련 **118개/4개 파일**의 회귀 검사와 TypeScript 검사가 통과했다.
- 배포 버전의 전체 검사 **195개 파일·1,431개 테스트**가 통과했다. 네이티브 PTY 검사에서 성공 신호 뒤 중복 종료되던 검사 프로그램을 보완했고, 재검사에서 단일 성공 신호와 종료 코드 0을 확인했다.
- 사용 중인 실제 Tripo 세션과 대화 파일·전역 설정은 변경하지 않았다.

원인과 동작 규칙은 [계정 분산 문서](account-pool.md#codex-0163-재개-작업-경로-exe-18184)에 기록했다.

## 배포 기록

제품 버전과 소스를 1.8.1.84로 고정했다. 전체 검사, EXE 패키지 검증, 공개 게시와 다운로드 검증 결과를 이 문서에 추가한다. 공개 게시와 사용자 PC 설치 완료는 별개다.
