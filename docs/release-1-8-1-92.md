---
type: Release
title: Acedia 1.8.1.92
status: ready
last_updated: 2026-10-23
---

# Acedia 1.8.1.92

- Electron을 **43.8.3**, Chromium을 **150.0.7871.250**으로 갱신하고 js-yaml·Vite·Vitest 및 관련 의존성의 보안 수정판을 반영했다. PC 전체 npm 의존성 경고는 16개 패키지에서 **0개**로 줄었다.
- 숨긴 브라우저를 연속 캡처할 때 멈추는 호환 문제를 수정했다. 실제 픽셀·페이지 변경·스크롤 후 영역 캡처·재연결을 확인하며 창 표시와 키보드 포커스를 유지한다.
- EXE 릴리스 CI에서 배포 엔진인 Electron을 포함한 전체 npm 보안 검사를 실행한다. 개발·독립 사용량 서버의 Node.js 보안 기준도 문서와 엔진 범위에 반영했다.
- Electron 내장 Node.js는 **24.22.0**이다. 2026-10-21 Node.js 보안 릴리스 전체 반영과 모바일 개발 의존성 `braces`·`node-forge` 두 건은 상위 수정판 대기 항목이다. PC npm 경고 0개는 전체 런타임 취약점 해소를 의미하지 않는다.

Standard EXE 업데이트다. 현재 검증된 Android 번들은 기존 서명 APK **1.8.1.39/code 21**이다. 모바일 보안 의존성 갱신은 소스에 반영했으며, 새 APK는 기존 배포 서명키를 복원한 뒤 별도로 제공한다.

## English

- Update Electron to **43.8.3**, Chromium to **150.0.7871.250**, and patch js-yaml, Vite, Vitest and related dependencies. The full desktop npm audit reports **zero vulnerable packages**, down from 16.
- Fix repeated screenshots of hidden browser views while preserving window visibility and keyboard focus. Verify real page pixels, updated content, scrolled regions and reconnection.
- Audit all desktop dependencies, including the shipped Electron runtime, before EXE releases. Update the documented Node.js security baseline for development and standalone usage services.
- Embedded Node.js remains **24.22.0**. Full coverage of the October 21 Node.js security release and two mobile development dependencies, `braces` and `node-forge`, still depend on upstream fixes. A clean npm audit does not establish that the entire runtime is free of vulnerabilities.

This Standard EXE currently bundles the existing signed Android **1.8.1.39/code 21** artifact. Mobile dependency updates are in source; a new APK requires restoration of the original release signing key before publication.

## 검증

- PC **206개 파일·1,566개 검사**, 모바일 **24개 검사**와 TypeScript·Expo SDK 호환 검사 통과. 기존에 완료한 검사와 명령 결과를 재사용했다. `output/security-check-20261023`.
- TypeScript·Vite production build와 실제 Electron의 PTY·숨김 브라우저·main-process bridge·Remote PWA·종료·트레이·보안 검사 통과.
- 로컬 Windows 패키지 생성과 packaged bridge·Dashboard·내장 Git·종료·트레이·보안 검사 통과. 런타임·렌더러 **338개 파일**이 현재 소스와 일치한다. 공개 EXE는 고정 소스에서 NSIS 빌드·패키지·다운로드 검증을 거친 뒤 게시한다.
- PC 전체 npm audit 0개. 모바일은 위 두 라이브러리에서 전파된 High 15개이며 Critical은 없다. 자세한 범위와 남은 항목은 [보안 의존성 관리](security-maintenance.md)를 따른다.

## 배포 기록

EXE 배포 준비 중이다. Microsoft Store와 Company 배포는 포함하지 않는다.
