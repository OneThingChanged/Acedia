---
type: Release
title: Acedia 1.8.1.25 EXE release
description: Browser OAuth and device-code login for account routing.
status: stable
sources:
  - resource: account-pool.md
  - resource: ../app/electron/services/account-pool.mjs
  - resource: ../app/electron/services/account-login.mjs
  - resource: ../app/electron/remote-pwa/account-pool.js
---

# Acedia 1.8.1.25

- 계정 풀에 브라우저 로그인과 기기 코드 로그인 버튼을 제공한다.
- 로컬 Dashboard에서는 브라우저 로그인을, 다른 기기의 Remote에서는 기기 코드를 먼저 표시한다.
- 브라우저 로그인은 Acedia PC의 브라우저에서 완료한다. 기기 코드 방식은 ChatGPT의 해당 설정을 활성화해야 한다.
- 로그인 ID를 확인해 완료·취소를 처리하며, 실패 시 기존 암호화 인증정보를 보존한다.
- 기기 코드 비활성화, 콜백 포트 충돌, 시간 초과 등은 민감정보 없는 안내로 표시한다.
- Remote 캐시는 v69로 갱신한다.

설치된 Codex CLI에서 격리 홈의 브라우저 로그인 시작·콜백 URL 형식·취소를 확인했다.
실제 Electron 1280px/390px에서 두 방식의 안내, 모의 인증 완료와 암호화 저장을 검증했다.
사용자 계정의 실제 브라우저 인증 완료 및 모든 계정 정책은 별도 검증 대상이다.

Standard EXE GitHub 채널로 배포하며 검증된 APK 1.8.1.19를 재사용한다.
새 APK나 Microsoft Store 제출은 생성하지 않는다. 기존 hook 파일 변경 2개는 포함하지 않는다.
최종 자산은 [GitHub Release](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.25)에 게시한다.
게시와 사용자 PC의 업데이트 설치는 별도다.
