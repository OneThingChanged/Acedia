---
type: Release
title: Acedia 1.8.2.00
status: published
last_updated: 2026-11-02
---

# Acedia 1.8.2.00

- **설정 → 일반 → 앱 시작**에 Windows 로그인 시 Acedia 자동 실행을 추가했다. 현재 사용자의 실제 시작 프로그램 상태를 읽고 체크 변경만 적용한다. Windows에서 비활성화한 항목을 앱 시작 때 임의로 다시 켜지 않는다. Windows EXE 설치본에서 지원하며 기본은 OFF다.
- **설정 → Remote**에 앱 시작 시 Remote 자동 활성화와 저장된 외부 터널 자동 연결을 추가했다. 각각 선택하고 Save로 저장하면 다음 앱 실행부터 적용한다. 외부 자동 연결은 named tunnel 토큰·호스트 이름·고정 포트를 사용하며 새 quick tunnel을 자동 생성하지 않는다. 기본은 OFF다.
- Remote 연결은 앱 창 생성 뒤 백그라운드에서 진행한다. 설정·포트·터널 오류가 앱 시작을 막지 않으며 설정에서 진행·실패를 확인하고 수동 재시도할 수 있다. 중복 서버 시작과 Stop·종료 뒤 늦은 터널 실행을 방지한다. 설정 검색과 적용 시점 안내도 추가했다.
- 제품 표시·설치 파일명·태그는 **1.8.2.00**, npm 호환 버전은 **1.8.2**다. 버전 비교에서 `00`은 숫자 0으로 처리하면서 화면에는 요청한 두 자리 표기를 유지한다.

Standard EXE 업데이트다. 기존 서명 검증 Android **1.8.1.39/code 21**을 재사용한다.

## English

- Add **Settings → General → App startup** to launch Acedia at Windows sign-in. Read the actual OS registration and apply only explicit toggle changes. Do not re-enable entries disabled in Windows during app startup. Supported in the installed Windows EXE; default OFF.
- Add **Settings → Remote** options to start Remote with Acedia and reconnect a saved external tunnel. Save each choice for the next launch. Automatic external connections require a named tunnel token, hostname and fixed port; never create a new quick tunnel automatically. Default OFF.
- Start Remote in the background after creating the app window. Display progress and failures without blocking the app, and retain manual retry. Prevent duplicate servers and late tunnel launches after Stop or shutdown. Include settings search and application-scope guidance.
- Use **1.8.2.00** for product labels, installer filenames and the release tag, with npm version **1.8.2**. Compare the padded revision numerically while preserving its display format.

This Standard EXE reuses the existing signed Android **1.8.1.39/code 21** artifact.

## 검증

- 완료한 전체 **215개 파일·1,722개 검사**와 취소 처리 보완 후 관련 **4개 파일·74개 검사**를 재사용했다. 버전 전환은 관련 **3개 파일·13개 검사**와 제품·npm·lockfile·모바일 소스 버전 일치 검증을 통과했다. `output/app-startup/tests-full.log`, `tests-final-targeted.log`.
- 숨김 Electron의 설정 화면에서 124개 검색 대상, Windows ON/OFF·Windows 비활성 상태·미지원 빌드·실패 표시와 Remote의 Save 전후를 확인했다. 800/1202/1920px 배치 및 계정·모델·알림 설정 회귀도 통과했다. `settings-electron-verified.log`, `settings-windows-final.png`, `settings-remote-final.png`.
- 실제 main/coordinator의 격리 시작에서 Remote OFF·정상 ON·잘못된 설정의 세 경우를 확인했다. ON의 loopback 로그인 응답·중복 Start의 동일 포트·Stop 뒤 저장값 유지와 세 경우의 사용자 CLI 0개·Windows 등록 호출 0회를 확인했다. `main-electron-final.log`. 사용자 Windows 시작 프로그램 등록·실제 재부팅·외부 Cloudflare 접속은 수행하지 않았다.

- 재점검한 실행 의존성은 npm audit **0개**다. 전체 감사에는 새 [minimatch 경고 GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)와 빌드 도구의 전이 영향으로 **Moderate 15개**, High·Critical 0개가 보고됐다. 수정은 11.0.1부터지만 현재 공식 app-builder-lib의 의존 범위도 `^10.2.5`라 범위 밖 강제 교체·자동 대규모 다운그레이드는 적용하지 않았다. 앞선 0개 기록과 이번 결과를 구분한다. `output/exe-release-1.8.2.00/audit-production.log`, `audit-all-direct.log`.

- 버전 전환 13개 검사와 신규 세션 UI 18개 배치·native PTY 검사를 통과했다. 완료한 설정·실제 main 시작 검사와 함께 `output/exe-release-1.8.2.00/followup-checks-direct.json`에 기록했다.
- 고정 소스에서 TypeScript·Vite·NSIS 설치 파일·blockmap·EXE manifest를 생성했다. packaged bridge·내장 Git·Dashboard·브라우저 재사용·보안·종료·트레이 검사를 통과했다. `build-direct.log`, `packaged-direct.log`, `lifecycle-direct.log`. 두 검사의 종료 코드는 0이며 기존 정리 단계 native helper 출력은 assertion 실패와 구분한다.
- Windows FileVersion **1.8.2.00**, ProductVersion **1.8.2**, Authenticode **NotSigned**를 확인했다. 제품·태그·설치 파일·manifest는 **1.8.2.00**으로 일치하고 Windows 숫자 버전은 끝자리 00과 0을 같은 값으로 비교한다. 앱 시작 모듈을 포함한 런타임·렌더러 관련 파일 **366개**와 Pixel Office 자산·라이선스 20개가 소스와 일치한다. 빌드 도구용 minimatch는 패키지에 포함하지 않았다. `local-verification.json`.
- 공개 업데이터에서 **1.8.1.99·1.8.1.98·1.8.1.96 → 1.8.2.00** 감지와 설치 파일 전체 다운로드를 확인했다. 세 자산의 공식 URL·크기·SHA-256·최신 안정 릴리스·소스 태그를 검증했다. `public-verification-direct.log`.

## 배포 기록

- 공개 게시: **2026-11-02 02:26:31 KST**. [GitHub Release v1.8.2.00](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.00).
- 공개 다운로드 검증 완료: **2026-11-02 02:27:18 KST**.
- 고정 제품 소스·태그: `3dce5e0918284f97a05412666e0016ca6cd65b64`.
- 기존 서명 검증 APK **1.8.1.39/code 21**을 재사용했다. 새 APK·Store·Company 배포는 실행하지 않았다.
- 사용자 앱과 실제 세션은 교체·재시작하지 않았다. 설정의 **Check → Update**로 적용하며 새 자동 시작 항목의 기본값은 OFF다.

| 공개 자산 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Acedia-Setup-1.8.2.00-x64.exe | 156232168 | `a9d139dfe7eef271bef8440890b3b29764364438cb6bd28dbc19d1c1d8b9b5b1` |
| Acedia-Setup-1.8.2.00-x64.exe.blockmap | 163154 | `3a5195f505992505bbece742cfd33f8554e24e60a66a8286947272d0defbbe9d` |
| latest-exe.json | 256 | `7f4893cac7849bb093faa097766e8b8ebe53270458ce099323589f227fd4200b` |
