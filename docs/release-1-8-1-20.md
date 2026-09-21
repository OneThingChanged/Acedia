---
type: Release
title: Acedia 1.8.1.20 Remote Hosting
description: Saved local HTTP pages and isolated previews in Remote. Source delivery only; EXE publication pending.
status: draft
sources:
  - resource: remote-service.md
  - resource: ../app/electron/services/remote-hosting.mjs
  - resource: ../app/electron/remote-pwa/hosting.js
  - resource: ../app/electron/services/remote-hosting.test.mjs
  - resource: ../app/scripts/electron-remote-hosting-smoke.mjs
---

# Acedia 1.8.1.20

Remote의 Documents·Usage 옆에 **Hosting**을 추가합니다. 소스 반영 단계이며
설치된 앱에서 사용하려면 이 버전의 EXE 배포·업데이트가 필요합니다.

## 사용 방법

1. 개발 PC에서 원본 웹 서버와 Acedia Remote를 실행합니다.
2. Remote에 로그인하고 **Hosting**을 선택합니다. 모바일 하단 메뉴에도 있습니다.
3. 이름과 로컬 URL을 입력하고 **추가**를 누릅니다.
   예: `http://127.0.0.1:4410/docs/ux-dnf-exporter/dnf-exporter-draft.html`
4. 등록한 이름을 눌러 페이지를 봅니다. **페이지 다시 열기**, **새 창으로 열기**,
   **제거**를 사용할 수 있습니다. 제거는 등록만 지우며 원본 파일은 삭제하지 않습니다.

## 지원 범위

- 명시된 포트가 있는 HTTP 루프백 주소: `127.0.0.1`, `localhost`, `::1`.
- HTML·이미지·CSS·JS 미리보기와 상대경로, 일반적인 루트 경로 자원 중계.
- 서버의 등록 목록 영구 저장, 데스크톱·모바일 공통 UI와 한·영 안내.
- 승인된 Remote 사용자만 목록·등록·미리보기 발급 API를 사용합니다.
- 미리보기 링크는 30분 유효하며 링크 소지자는 그동안 접근할 수 있습니다.
  등록 제거·서비스 종료로 링크가 무효화됩니다. 공유할 때 유의해야 합니다.
- Remote 쿠키·인증 헤더는 원본 서버에 전달하지 않습니다. 미리보기 스크립트는
  Remote DOM·저장소에서 격리합니다. 외부 리다이렉트와 쓰기 요청은 허용하지 않습니다.

범용 앱 프록시는 아닙니다. 사이트 로그인, 폼 제출, API·WebSocket 연결과
LocalStorage에 의존하는 페이지의 완전한 실행은 지원하지 않습니다.
페이지가 안 열리면 개발 PC의 서버와 URL을 확인합니다. 링크가 만료되면 다시 엽니다.

## 검증

최종 작업 트리 검사에서 126개 테스트 파일, 769개 테스트가 모두 통과했고
OKF 문서 검증도 오류·경고 없이 통과했습니다. 별도 작업 중인 Codex 설정 보존
수정 2개 파일은 이 Hosting 커밋에 포함하지 않습니다.

실제 Electron의 1280px·390px 화면에서 URL 등록·페이지 열기, 상대 이미지 로딩,
JavaScript 실행과 Remote DOM 접근 차단을 확인했습니다. 서비스 테스트에서
비로그인 접근, 교차 출처 요청, 잘못된 URL, 인증 헤더 비전달 및 제거 후 만료를 확인했습니다.
2026-09-21 확인 당시 예시 DNF 서버의 4410 포트는 연결 거부 상태여서
그 페이지 자체는 검증하지 못했고 로컬 테스트 서버로 검증했습니다.

이 요청에서는 Git 소스만 전달하며 EXE·APK·Store 빌드와 배포는 수행하지 않습니다.
