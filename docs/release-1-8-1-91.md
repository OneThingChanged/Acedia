---
type: Release
title: Acedia 1.8.1.91
status: published
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

- 고정 소스의 TypeScript·Vite production build와 Standard NSIS 빌드 통과. `app/electron-dist/exe-1.8.1.91`으로 출력을 분리했고 빌드 단계의 자동 게시는 비활성화했다. 기존 APK의 패키지·arm64 아키텍처·인증서·해시도 다시 확인했다. `output/exe-91-build.log`. 기존 Vite 500KB 번들 경고는 남아 있다.
- 패키지의 내장 Git·브라우저 bridge·Dashboard·PTY·문서 재사용과 종료·트레이·보안 검사 통과. `output/exe-91-packaged-smoke.log`, `output/exe-91-packaged-lifecycle-smoke.log`. 임시 packaged 실행기의 외부 제한만 45초로 설정하고 원래 성공 조건을 유지했다. 이전 릴리스에도 있던 모의 PTY 종료의 `AttachConsole failed` 진단과 Chromium API 경고는 남지만 성공 표식과 종료 코드 0을 확인했다.
- 새 자동화 서비스·공통 시작 화면 판독부를 포함한 런타임·렌더러 **338개 파일**이 고정 빌드 소스와 일치했다. 설치 파일 FileVersion **1.8.1.91**, ProductVersion **1.8.1**, 크기·SHA-256이 같은 빌드 manifest와 일치한다. Authenticode는 **NotSigned**다. `output/exe-release-1.8.1.91/local-verification.json`, `output/exe-release-1.8.1.91/windows-verification.json`.
- 공개 GitHub에서 **1.8.1.90·1.8.1.89 → 1.8.1.91** 업데이트 감지를 확인했다. 실제 업데이터로 EXE 전체를 다운로드하고 세 자산의 크기·SHA-256·공식 URL·태그·소스 커밋·최신 안정 릴리스를 검증했다. `output/exe-91-public-verify.log`, `.build-tools/public-verified-1.8.1.91.json`.

## 배포 기록

- 공개 게시: **2026-10-23 01:58:59 KST**. [GitHub Release v1.8.1.91](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.91).
- 고정 소스·태그: `59030c4698f32b6134968db1837416817b310643`.
- 공개 다운로드 검증 완료: **2026-10-23 01:59:48 KST**.
- 소스 제품 버전·Android 소스 versionName: **1.8.1.91**. npm 호환 버전: **1.8.1**.
- 기존 서명 APK **1.8.1.39/code 21** 재사용. 새 APK·Company·Microsoft Store 배포는 실행하지 않았다.

| 공개 자산 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Acedia-Setup-1.8.1.91-x64.exe | 151455924 | `a5946a52c221d93da4d32786ac36edb5f90884be6398f12abc692c4c8230f903` |
| Acedia-Setup-1.8.1.91-x64.exe.blockmap | 159019 | `4d5857fd3c8157eacba263598234c8786e18ea58aabee78686b2805fd7040bd4` |
| latest-exe.json | 256 | `011ac21b14c767343a56cf7d694bc90c753132762a7d41d42888fe7916ffc825` |

설정의 **Check → Update** 또는 다음 앱 실행의 업데이트 안내로 적용한다. 이후 **작업 흐름 → 모델 정책 → 프로젝트 시작 자동화**에서 프로젝트의 폴더 신뢰 자동 확인을 켠다. 이번 배포에서 실제 사용자 앱을 교체하거나 시험 작업을 전달하지 않았다. 공개 게시와 사용자 PC의 설치 완료는 별개다.
