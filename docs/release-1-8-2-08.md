---
type: Release
title: Acedia 1.8.2.08
status: published
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
- 패키지의 Electron Node 런타임·인증 HTTP에서 새 수집 API, 원본 GIF 바이트/SHA-256, HTML 보관, 저장 결과 조회와 현재 프로필 hook 도우미를 확인했다. 새 출력이 없는 터미널 조회, Remote/Dashboard 첨부 원본 전송·재시작·출처 제한, 보드·큐·세션 준비 API와 native PTY 검사도 통과했다. 패키지 검사는 GUI 자동화나 운영 세션 입력 없이 수행했다.
- ASAR의 런타임·렌더러 파일 390개와 Pixel Office 자산·라이선스 20개가 고정 제품 소스와 일치한다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포는 수행하지 않았다.
- 로컬·공개 설치 파일 모두 NSIS CRC `504fa000`, 압축 파일 전체 검사와 설치 전 검증 모드 시작을 통과했다. 기존 EXE 채널과 같은 미서명(`NotSigned`) 상태다. 사용 중인 앱을 종료하거나 설치를 덮어쓰지 않았다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.08](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.08).
- 게시: **2026-11-07 04:01:44 KST**. 공개 전체 다운로드 검증: **04:02:33 KST**.
- 제품 소스 커밋: `1d5a14c729cfb78a0348f1bd7870b30b40732824`.
- 실제 업데이터에서 **1.8.2.07 / 1.8.2.06 / 1.8.2.05 → 1.8.2.08** 감지를 확인했다. 공개 세 자산의 태그·크기·SHA-256·manifest가 빌드 원본과 일치한다.
- 앱 업데이트·재시작 후 적용된다. 새 브라우저 도구는 MCP 클라이언트 재연결 또는 해당 CLI 재시작 뒤 표시된다. 기존 실행 프로필의 브라우저 로그인 상태를 재사용하며 운영 세션·설정·브라우저 큐는 배포 과정에서 조작하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.08-x64.exe` | 156275065 | `57118e2574a8e3f9f11bb1d95ef3c279620219bdf08659858474c60d3c4562ca` |
| `Acedia-Setup-1.8.2.08-x64.exe.blockmap` | 163541 | `45080d8d4abbbffe5bf6cf44ac6aefa23fdedbc7b008e2502a7b4377da02245e` |
| `latest-exe.json` | 256 | `a8a3823a70ad8b679192972f3c0dd497acdf1d445567e954b1146c79a453eded` |
