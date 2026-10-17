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
- TypeScript·Vite 프로덕션 빌드와 관련 문서의 상대 참조 26개를 확인했다. 고정 소스의 EXE 패키지 실행·Git·Dashboard와 종료·트레이·보안 검사가 통과했다. 패키지의 런타임·렌더러 **314개 파일**이 소스와 일치했다.
- 설치 파일의 FileVersion **1.8.1.84**, ProductVersion **1.8.1**, 크기·SHA-256과 같은 빌드의 manifest를 검증했다. Authenticode 상태는 `NotSigned`다.
- 공개 GitHub에서 **1.8.1.82·1.8.1.83 → 1.8.1.84** 감지를 확인했다. 실제 업데이터로 EXE를 전부 내려받고 공개 자산 세 개의 크기·해시·URL과 소스 태그가 일치함을 확인했다.
- 사용 중인 실제 Tripo 세션과 대화 파일·전역 설정은 변경하지 않았다.

원인과 동작 규칙은 [계정 분산 문서](account-pool.md#codex-0163-재개-작업-경로-exe-18184)에 기록했다.

## 배포 기록

- 공개 게시: **2026-10-18 04:27:16 KST**. [GitHub Release v1.8.1.84](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.84).
- 고정 소스·태그: `9cdba6421e8bad63c8785065b98cb7ba01983f50`.
- 공개 다운로드 검증 완료: **2026-10-18 04:28:03 KST**.
- 소스 제품 버전·Android 소스 versionName: **1.8.1.84**. npm 호환 버전: **1.8.1**.
- 기존 서명 APK **1.8.1.39/code 21** 재사용. SHA-256: `f04502319e96f1cf3e2fb1a949ec6ae81dcefad4443877f31ca36c8c15190957`.

| 공개 자산 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Acedia-Setup-1.8.1.84-x64.exe | 151393552 | `3d807dc16957cc8e82b2b626d6e547ad09c93bc0dad49222bb7f2cbb75faf660` |
| Acedia-Setup-1.8.1.84-x64.exe.blockmap | 159401 | `ec528b78e23204e9a1a4e408ba61100247dccf79d769dfce847a38542b9d74e8` |
| latest-exe.json | 256 | `dce11587ef18ec921840881a31341952cade71f44182c5e58d68ef7c90f1ce61` |

검증 증빙: `output/exe-84-tests.log`, `output/exe-84-build.log`,
`output/exe-84-pty-smoke-recheck.log`, `output/exe-84-packaged-smoke.log`,
`output/exe-84-packaged-lifecycle-smoke.log`,
`output/exe-release-1.8.1.84/local-verification.json`,
`.build-tools/public-verified-1.8.1.84.json`.

패키지 검사 중 기존 node-pty 종료 보조 프로세스의 `AttachConsole failed`가 출력됐지만
필수 bridge·Git·Dashboard 성공 marker와 종료 코드 0을 확인했다.

설정 **Check → Update** 또는 앱 재실행 시 업데이트 안내로 적용한 뒤 실패한 Tripo2
세션을 **Restart**한다. 이 배포에서 설치 프로그램과 실제 사용자 세션은 실행하지 않았다.
공개 게시·다운로드 검증 완료와 사용자 PC의 설치 완료는 별개다.
