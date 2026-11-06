---
type: Release
title: Acedia 1.8.2.07
status: preparing
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
- 전체 232개 파일의 1,876개 테스트를 통과했다. 패키지·공개 설치 파일 검증 결과는 배포 완료 후 이 문서에 기록한다.
