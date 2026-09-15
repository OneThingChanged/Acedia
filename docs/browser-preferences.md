---
type: Feature
title: 브라우저 설정과 프로필
description: 브라우저 기본 동작, 프로필별 로그인 격리와 앱 재시작 시 웹 탭 복원.
status: stable
sources:
  - resource: ../app/src/components/BrowserSettingsPanel.tsx
  - resource: ../app/electron/services/browser-preferences.mjs
  - resource: ../app/electron/services/browser-preferences.test.mjs
  - resource: ../app/electron/services/browser-settings-smoke.mjs
  - resource: ../app/electron/services/browser-profiles.mjs
  - resource: ../app/scripts/electron-browser-profiles-smoke.mjs
  - resource: ../app/electron/main.mjs
  - resource: ../app/src/components/BrowserExtensionsPanel.tsx
  - resource: ../app/electron/services/browser-extensions.mjs
  - resource: ../app/scripts/electron-browser-extensions-smoke.mjs
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

## 프로필과 재시작 복원

**1.8.0.11**부터 설정에서 프로필을 추가·이름 변경하고 새 탭의 기본 프로필을 선택한다.
기존 기본 프로필의 Chromium 저장 위치는 유지한다. 새 프로필은 별도의 영구 파티션을
사용해 같은 사이트의 쿠키와 로그인을 분리한다. 한 프로필 안에서는 탭끼리 공유한다.
프로필은 로그인 격리 단위이며 에이전트 접근 권한을 분리하는 보안 경계는 아니다.

브라우저 모아보기의 새 탭 프로필 선택기로 기본값을 덮어쓸 수 있고, 탭에 프로필 이름을
표시한다. 기존 탭의 프로필은 바꾸지 않는다. MCP 목록은 프로필 목록과 탭의 프로필을
제공하며 `browser_open`의 `profileId`로 지정할 수 있다. 생략 시 같은 기본값을 사용한다.

기본 프로필·현재 기본값은 제거할 수 없고, 열린 탭이 있는 프로필 제거는 저장 단계에서
거부한다. 목록에서 제거해도 쿠키 파일을 삭제하지 않는다. 프로필은 최대 32개다.

웹 탭 복원은 기본적으로 꺼져 있다. 켜면 다음 앱 시작 시 최대 50개 웹 탭을 원래 ID와
프로필로 백그라운드에 복원한다. 로컬 문서 미리보기와 인증 토큰·코드가 포함된 주소는
저장하지 않는다. 네트워크 실패는 탭을 남겨 다시 불러올 수 있게 한다. 창을 닫고 트레이에
남기는 동작과 앱을 완전히 재시작하는 동작은 구분한다.

## 확장 프로그램 (1.8.1.16 소스 반영, EXE 미배포)

설정 → 브라우저 → 브라우저 확장 프로그램에서 저장된 프로필을 선택하고
`manifest.json`이 들어 있는 압축 해제된 확장 폴더를 추가한다. 추가·켜기/끄기·제거는
즉시 저장된다. 기존 페이지는 새로고침해야 하며, 다음 실행에서 해당 프로필을 열 때
확장이 자동 로드된다. 원본 폴더를 유지해야 한다. 로드 실패는 목록에 표시하며
상태 새로고침 / 재시도로 다시 로드할 수 있다. 제거는 등록만 지우고 원본 파일은 유지한다.
프로필을 제거하면 해당 프로필의 확장 등록과 로드도 정리한다.

Chrome 웹스토어 직접 설치, CRX, 확장 도구모음 버튼·팝업은 지원하지 않는다.
Electron의 일부 Chrome API만 제공하므로 개별 확장의 호환성 확인이 필요하다.
신뢰하는 확장만 추가한다. 확장은 허용된 사이트의 내용을 읽거나 변경할 수 있다.
확장 설정은 앱 프로필의 `browser-extensions.json`에 저장한다.

검증: `node scripts/electron-browser-extensions-smoke.mjs` (`app/`). 실제 Electron에서
콘텐츠 스크립트 실행, 프로필 격리, 켜기/끄기와 설정 UI의 추가·전환·제거를 확인한다.

## 검증

주소·검색어 구분, 스킴 제한, 저장·재읽기, 창 간 저장 충돌, 잘못된 값 및 손상된 파일 보존을
단위 테스트로 확인한다. Electron bridge 검증은 실제 IPC를 통해 새 탭 시작 페이지,
현재·새 탭 배율, 주소 이동, 내부 링크 열기와 저장 거부를 로컬 HTTP 페이지로 확인한다.
설정 검색 검증은 작은 창을 포함한 세 크기에서 옵션 이동·배치를 확인한다.

명령: `npm test`, `npm run build`, `npm run electron:bridge-smoke`,
`npm run electron:settings-search-smoke` (`app/`에서 실행).

프로필 검증은 두 Electron 프로세스를 순서대로 실행해 같은 사이트의 쿠키 격리,
기존 기본 파티션 유지, 재시작 후 저장된 탭·프로필·쿠키와 페이지 복원을 확인한다.
추가 명령: `npm run electron:browser-profiles-smoke`.
