---
type: Release
title: Acedia 1.8.2.07
status: published
last_updated: 2026-11-06
---

# Acedia 1.8.2.07

- Codex 포함 사용량이 100%여도 서버가 추가 크레딧 사용 가능을 알린 계정은 라우팅에 사용할 수 있다. 신규 배정·재시작·native 연결·이후 요청에 같은 판정을 적용하며 실제 사용량 수치는 그대로 표시한다.
- 데스크톱 하단에 **크레딧 가능**, Dashboard·Remote 계정 카드에 추가 크레딧 상태와 확인된 잔액을 표시한다. 크레딧 소진에 따른 차단과 실제 HTTP 429 응답의 대기·중복 재전송 방지를 유지한다. 크레딧 구매나 지출 설정 변경은 수행하지 않는다.
- 터미널의 MP4 등 영상 링크를 클릭하면 Windows 기본 영상 재생기로 연다. Ctrl/Cmd+클릭하면 탐색기에서 파일 위치를 표시한다. 자식 세션의 실제 작업 폴더를 기준으로 파일을 찾으며 다른 일반 파일의 기존 위치 표시 동작은 유지한다.
- 기존 서명 APK 1.8.1.39를 재사용한다. 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Keep Codex routing accounts eligible after included usage reaches 100% when the server reports available extra credits. Apply the same rule to assignment, restart, native connections and subsequent requests without changing the displayed usage percentage.
- Show extra-credit availability in the desktop footer and credit details on Dashboard/Remote account cards. Preserve credit-exhaustion blocking, upstream 429 cooldowns and generation replay protection. No credits are purchased and no spending settings are changed.
- Open terminal video links with the Windows default media application. Ctrl/Cmd-click reveals the file in Explorer. Relative paths use the effective session folder, including child sessions.

## 검증

- 크레딧 판정 관련 9개 파일의 187개 검사와 영상 링크 관련 5개 파일의 52개 검사, TypeScript/Vite 빌드를 통과했다. 실제 유료 요청이나 영상 재생기 실행 없이 모의 API와 파일·버퍼 기반으로 확인했다.
- 전체 232개 파일의 1,876개 테스트와 TypeScript/Vite 빌드를 통과했다.
- 패키지의 Electron Node 런타임에서 크레딧 사용 가능·소진·429 대기 판정을 검증했다. Remote/Dashboard의 새 크레딧 모듈 제공, 첨부 파일 원본 전송·재시작·출처 제한, 보드·큐·세션 준비 API와 native PTY 검사도 통과했다. GUI 자동화와 실제 유료 요청은 수행하지 않았다.
- ASAR 내 소스·렌더러 파일 386개와 Pixel Office 자산·라이선스 20개가 고정 제품 소스와 일치한다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포는 수행하지 않았다.
- 로컬·공개 설치 파일 모두 NSIS CRC `03b44332`, 압축 파일 전체 검사와 설치 전 검증 모드 시작을 통과했다. 기존 EXE 채널과 같은 미서명(`NotSigned`) 상태다. 사용 중인 앱을 종료하거나 설치를 덮어쓰지 않았다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.07](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.07).
- 게시: **2026-11-06 21:31:55 KST**. 공개 전체 다운로드 검증: **21:34:55 KST**.
- 제품 소스 커밋: `a575ce6c4ca167c51dc2bdd018fd34fed91eb721`.
- 실제 업데이터에서 **1.8.2.06 / 1.8.2.05 / 1.8.2.04 → 1.8.2.07** 감지를 확인했다. 공개 세 자산의 태그·크기·SHA-256·manifest가 빌드 원본과 일치한다.
- 앱 업데이트·재시작 후 적용된다. Remote/Dashboard 새로고침 시 PWA 캐시 v109를 사용한다. 브라우저 메모리에 남은 예약 메시지는 새로고침 전에 보관한다. 배포 과정에서 운영 세션과 브라우저 큐는 조작하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.07-x64.exe` | 156264099 | `89807307f6a6b0a6a5e85a38ff3a521cfe16affcdbd3c2b8af5e93c140973aee` |
| `Acedia-Setup-1.8.2.07-x64.exe.blockmap` | 163605 | `3bd6f4ac3eb8ec1ee5e0c7a04cec3832fd29c151cbaaa61b5265ca12cff32246` |
| `latest-exe.json` | 256 | `73645eb8facadb87d22836c100c9f1b36122e6349e19c52af22585c51c04098e` |
