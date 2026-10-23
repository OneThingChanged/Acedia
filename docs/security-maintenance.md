---
type: Playbook
title: Acedia 보안 의존성 관리
status: active
last_updated: 2026-10-23
---

# Acedia 보안 의존성 관리

Acedia 데스크톱과 Remote·Dashboard 서버는 Electron·Node.js를 사용한다. PHP 런타임은 포함하지 않는다. npm 의존성 검사와 Electron에 포함된 Chromium·Node.js의 보안 공지를 함께 확인한다.

## 의존성 검사

`app/`에서 `npm ci` 후 `npm run security:audit`를 실행한다. EXE 릴리스 CI도 이 검사를 실행하며 Moderate 이상 경고가 있으면 중단한다. Electron은 package.json에서 개발 의존성이지만 EXE 실행 엔진이므로 `--omit=dev` 결과만으로 배포 안전성을 판단하지 않는다. 이 검사는 공개된 npm 권고의 버전 범위를 확인하며 Chromium·내장 Node.js 전체의 취약점 검사를 대체하지 않는다.

`mobile/`의 `npm audit`는 Expo·Metro 개발 도구를 포함한다. 경고가 전파된 패키지 수와 근본 취약점 수를 구분하고, 실제 Android 번들에 포함되는 경로를 별도로 확인한다. 강제 수정으로 Expo·React Native를 오래된 메이저 버전으로 내리지 않는다.

## 2026년 10월 보안 갱신

소스 제품 버전은 **1.8.1.92**다. 호환되는 Electron 43 계열을 유지하면서 보안 수정판과 잠금 파일을 갱신했다.
Standard EXE **1.8.1.92**를 공개하고 업데이터의 실제 다운로드를 검증했다. 포함된 Android 번들은 기존 서명 APK **1.8.1.39/code 21**이다. 모바일 의존성과 새 APK versionName **1.8.1.92/code 22**는 소스에 반영했으며, 새 APK의 빌드·배포는 원래 서명키 복원 대기 상태다. 공개 자산과 소스 커밋은 [1.8.1.92 배포 기록](release-1-8-1-92.md)을 따른다.

| 구성 요소 | 변경 전 | 변경 후 |
| --- | --- | --- |
| Electron | 43.1.1 | 43.8.3 |
| 내장 Chromium | 150.0.7871.114 | 150.0.7871.250 |
| 내장 Node.js | 24.18.0 | 24.22.0 |
| js-yaml | 4.3.0 | 4.3.2 |
| Vite | 7.3.6 | 7.3.7 |
| Vitest | 4.1.6 | 4.1.12 |
| Expo | 57.0.12 | 57.0.31 |
| React Native | 0.86.2 | 0.86.3 |
| 모바일 shell-quote | 1.10.0 | 1.12.0 |

PC의 전체 npm 경고는 **16개 패키지(High 13, Moderate 3)에서 0개**로 줄었다. 모바일은 **26개 패키지(Critical 1, High 22, Moderate 3)에서 High 15개**로 줄었다. 2026-10-23의 npm 권고 기준이며, 공개 APK의 변경 여부와 소스 의존성 상태는 구분한다.

새 Electron에서 숨긴 브라우저를 연속 캡처할 때 멈추는 문제도 보완했다. 준비된 화면은 네이티브 캡처로 읽고, 아직 화면 표면이 없는 숨김 뷰는 CDP로 초기화한다. 원래 렌더링 정책과 다른 디버거 연결을 보존하며 창·뷰 표시와 키보드 포커스를 바꾸지 않는다. 시간 제한 이후 늦게 끝난 작업은 추가 CDP 캡처나 렌더링 정책 변경을 시작하지 않는다.

## 남아 있는 상위 프로젝트 수정

### Electron 내장 Node.js

Electron 43.8.3은 Node.js 24.22.0을 포함한다. [2026-10-21 Node.js 보안 릴리스](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)의 24.22.1 전체 수정이 반영된 것으로 취급하지 않는다. 이 공지에는 Brotli 압축 해제의 코드 실행, DNS 입력 검증, TLS 인증서 검증 등의 수정이 포함된다. [Electron 릴리스의 런타임 버전](https://releases.electronjs.org/release/v43.8.3)과 실제 `process.versions`를 대조한다.

개발·검증용 외부 Node.js는 24.22.1을 사용한다. 외부 Node.js를 업데이트하거나 npm의 `undici`를 갱신해도 Electron 내장 Node.js와 그 내장 `fetch`는 교체되지 않는다. Electron 수정판이 게시되면 같은 절차로 재갱신하고 PTY·Remote·브라우저·패키지 검사를 다시 실행한다.

### 모바일 개발 의존성

남은 15개 패키지 경고의 근본 원인은 두 라이브러리다.

- `braces` 3.0.3: 깊게 중첩된 패턴 처리의 스택 고갈. `micromatch`를 사용하는 Metro 개발 도구 경로다. [권고 GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- `node-forge` 1.4.0: RSA 서명 검증의 잘못된 ASN.1 구조 수용. Expo CLI와 코드 서명 인증서 도구 경로다. [권고 GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

두 패키지 모두 검사 시점의 npm 최신판에도 권고가 남아 있다. 수정판 게시 후 Expo·Metro 호환성을 유지하며 갱신한다. 이 경고만으로 설치된 APK의 악용 가능성이 입증된 것은 아니다.

## 독립 사용량 서버와 수집기

독립 Node.js 실행의 최소 보안 기준은 **22.x의 22.23.4, 24.x의 24.22.1, 26.x의 26.12.1**이다. 해당 계열의 최신 보안 수정판을 사용한다. `usage-server`와 수집기 package.json의 엔진 범위, 실행 도움말과 설치 문서에 같은 기준을 기록한다. 기존에 실행 중인 서버·수집기는 호스트 Node.js를 교체하고 재시작해야 적용된다.

## 검증 결과

- PC 전체 **206개 파일·1,566개 검사** 통과. Windows 수집기 배포 검사와 PowerShell 실행 검사는 릴리스 CI처럼 각각 worker 1개로 실행했다. `output/security-check-20261023/app-tests-final.log`, `distribution-tests.log`, `electron-services-tests.log`.
- 모바일 **24개 검사**, TypeScript 검사, Expo SDK 의존성 호환 검사 통과. Expo가 요구하는 build-properties·linking·system-ui 패치 버전도 맞췄다. `mobile-tests.log`, `mobile-typecheck.log`, `mobile-sdk-check.log`.
- TypeScript·Vite production build, 실제 Electron의 PTY·main-process bridge·Remote PWA·종료·트레이·보안 검사 통과. 브라우저 검사는 빈 화면을 구분하는 실제 픽셀, 변경된 페이지, 스크롤 후 영역 캡처와 재연결을 검증하고 창 표시·포커스 횟수 0을 확인한다. 같은 출력 폴더의 `build.log`, `pty-smoke.log`, `bridge-smoke.log`, `remote-smoke.log`, `lifecycle-smoke.log`, `browser-smoke.log`.
- 로컬 Windows 패키지 생성 후 내장 Git·Dashboard·bridge·종료·트레이·보안 검사 통과. 패키지의 런타임·렌더러 **338개 파일**이 소스와 일치하고 Electron **43.8.3**, Chromium **150.0.7871.250**, 내장 Node **24.22.0**, js-yaml **4.3.2**를 확인했다. `app/electron-dist/security-1.8.1.92/win-unpacked`, `output/security-check-20261023/package-verification.json`, `packaged-smoke.log`, `packaged-lifecycle-smoke.log`.
- 전체 PC audit는 0개, 모바일 audit는 위 두 라이브러리에서 전파된 High 15개다. `app-audit-final.json`, `mobile-audit-final.json`. 위 로그는 모두 로컬 검증 자료이며 실제 사용자 세션에 시험 작업을 전달하지 않았다.

기존의 Vite 번들 크기 경고와 모의 PTY 종료의 `AttachConsole failed` 진단, Chromium GPU·deprecated API 진단은 남아 있다. 성공 표식과 종료 코드 0을 확인했으며, 보안 경고 0개라는 결론은 PC npm 의존성 범위에만 해당한다.
