---
type: Release
title: Acedia 1.8.2.08
status: prepared
last_updated: 2026-11-07
---

# Acedia 1.8.2.08

- 내장 브라우저에 `browser_collect_page`, `browser_capture_asset`, `browser_collection_get` MCP/API를 추가했다. 실제 렌더링된 탭의 본문·화면·원문/펼친 DOM HTML·Chromium HTML/MHTML·이미지 원본을 백그라운드로 저장하고, 결과를 재수집 없이 나눠 조회한다.
- 지연 로딩 이미지와 Zhihu GIF 원본을 수집하고 SHA-256·자산 맵·누락 목록을 기록한다. 접근 차단, 코드 펼치기 잔여 항목, 저장 실패와 수집 한도 초과는 미완료로 보고한다. 창 활성화나 번역·Wiki 등록은 자동 실행하지 않는다. 앱 업데이트 후 MCP 클라이언트를 재연결해야 새 도구가 표시된다.
- 이전 실행의 호스트 주소를 가진 세션에서도 hook 도우미가 자기 프로필의 현재 주소·인증 쌍을 먼저 사용하도록 개선했다. 오래된 주소에 대한 반복 대기를 줄이며 SSH 환경의 포워딩 동작은 유지한다.
- Codex 터미널의 연속 텍스트·ANSI 처리를 묶고, 새 출력이 없는 버퍼 조회에서는 전체 스크롤백 복사를 생략했다. 합성 벤치마크에서 다시 그리기 처리 시간이 약 26% 줄었으며, 앱 전체가 같은 비율로 빨라지거나 모든 멈춤이 해결됐다는 의미는 아니다.
- 기존 서명 APK 1.8.1.39를 재사용한다. 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Add embedded-browser collection MCP/API tools for rendered article text, viewport screenshots, original/expanded DOM HTML, Chromium HTML/MHTML and original image bytes. Capture in the background and page saved results without recapturing.
- Preserve lazy-loaded images and Zhihu GIF originals, with SHA-256, asset maps and explicit missing/partial reports. Do not activate windows, translate content or register Wiki entries. Reconnect the MCP client after updating the host to discover the tools.
- Prefer the current endpoint and credentials from each hook helper's own profile, avoiding repeated waits against an obsolete host while retaining SSH environment forwarding.
- Batch adjacent Codex terminal text/ANSI processing and avoid copying unchanged scrollback on empty polls. Synthetic redraw processing improved by approximately 26%; this is a component measurement, not a whole-app performance or freeze-resolution claim.

## 검증

- 전체 235개 파일의 1,899개 테스트와 TypeScript/Vite 빌드를 통과했다. 브라우저 수집·실제 stdio MCP/인증 HTTP·백그라운드 동작, hook 주소 선택과 터미널 스크롤백 회귀 검사를 포함한다.
- 격리한 비표시 Electron 브라우저에서 원문/펼친 코드 분리, 본문 구조, 지연 로딩, 스크롤 복원, 원본 GIF 바이트·해시, 브라우저 쿠키/Referer가 필요한 이미지 요청과 저장 결과 재조회를 확인했다.
- 요청한 Zhihu 글은 기존 Acedia 프로필에서 본문·화면 조회가 성공했지만 새 격리 프로필에서는 차단됐다. 새 도구가 그 글 전체를 수집 완료했다고 보고하지 않으며, 차단 결과를 미완료로 기록한다.
