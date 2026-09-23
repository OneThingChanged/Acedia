---
type: Release
title: Acedia 1.8.1.26 EXE release
description: Dashboard return flow and responsive account card grid.
status: stable
sources:
  - resource: account-pool.md
  - resource: ../app/electron/remote-pwa/account-pool.js
  - resource: ../app/electron/remote-pwa/styles.css
  - resource: ../app/scripts/electron-account-pool-smoke.mjs
---

# Acedia 1.8.1.26

- 브라우저 로그인 진행 화면에 Dashboard 복귀 링크를 제공한다.
- 진행 화면이 인증 완료를 확인하면 계정 관리 화면으로 자동 이동한다.
- Codex 인증 완료 탭 자체는 자동 이동하지 않는다. 해당 탭을 닫고 Acedia 진행 화면으로 돌아온다.
- 계정 카드는 넓은 화면에서 3열, 중간 화면에서 2열, 모바일에서 1열로 배치한다.
- Remote 캐시는 v70으로 갱신한다.

Electron 데스크톱·모바일에서 모의 인증 완료, 복귀 링크와 자동 이동, 카드 열 수 및 가로 넘침을 검증했다.
실제 사용자 계정의 OAuth 인증 완료는 별도 확인 대상이다.
Standard EXE 채널이며 검증된 APK 1.8.1.19를 재사용한다.
[GitHub Release](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.26)에 EXE와 같은 빌드의 manifest를 게시한다.
게시와 사용자 PC의 업데이트 설치는 별도다.
