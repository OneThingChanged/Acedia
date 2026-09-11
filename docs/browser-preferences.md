---
type: Feature
title: 브라우저 설정과 프로필
description: 시작 페이지, 주소창 검색, 확대율과 앱 웹 링크의 기본 동작.
status: stable
sources:
  - resource: ../app/src/components/BrowserSettingsPanel.tsx
  - resource: ../app/electron/services/browser-preferences.mjs
  - resource: ../app/electron/services/browser-preferences.test.mjs
  - resource: ../app/electron/services/browser-settings-smoke.mjs
  - resource: ../app/electron/main.mjs
---

# 브라우저 설정과 프로필

설정 → 브라우저에서 편집한 뒤 저장한다. 값은 앱 프로필에 저장하며 모든 작업창과
브라우저 MCP가 같은 기본값을 읽는다. 다른 창에서 먼저 저장하면 오래된 편집은 거부하고
다시 불러오도록 안내한다. 손상된 설정 파일은 기본값으로 덮어쓰지 않는다.

| 옵션 | 적용 |
|---|---|
| 시작 페이지 | 새 브라우저 탭과 URL을 생략한 MCP 열기. 기존 탭은 이동하지 않는다. |
| 검색엔진 | 주소창의 검색어를 Google/Bing/DuckDuckGo로 전달한다. HTTP/HTTPS 주소와 호스트명은 직접 연다. |
| 기본 확대율 | 저장 시 현재·새 탭에 50–200% 적용. 페이지 이동 시 기본 배율을 사용한다. |
| 웹 링크 열기 | 앱의 일반 웹 링크를 내부 새 탭 또는 기본 외부 브라우저에서 연다. 로그인 전용 흐름과 브라우저 페이지 내부 탐색은 기존 방식을 따른다. |

시작 페이지와 주소창에서 HTTP/HTTPS 이외 스킴과 URL 안의 사용자명·비밀번호는 거부한다.
설정 검색은 옵션 이름으로 이동하며 저장 자체를 실행하지 않는다.

## 검증

주소·검색어 구분, 스킴 제한, 저장·재읽기, 창 간 저장 충돌, 잘못된 값 및 손상된 파일 보존을
단위 테스트로 확인한다. Electron bridge 검증은 실제 IPC를 통해 새 탭 시작 페이지,
현재·새 탭 배율, 주소 이동, 내부 링크 열기와 저장 거부를 로컬 HTTP 페이지로 확인한다.
설정 검색 검증은 작은 창을 포함한 세 크기에서 옵션 이동·배치를 확인한다.

명령: `npm test`, `npm run build`, `npm run electron:bridge-smoke`,
`npm run electron:settings-search-smoke` (`app/`에서 실행).
