---
type: Release
title: Acedia 1.8.2.27
status: published
last_updated: 2026-11-18
---

# Acedia 1.8.2.27

- 실제로 하달받은 작업을 진행 중인 자식만 부모의 `Waiting for N child tasks`에 집계한다. 보드에는 전달 기록과 확인할 결과가 계속 표시된다.
- Codex CLI 업데이트 선택창을 `cli-update`로 표시한다. 입력과 열린 터미널 뷰가 없는 백그라운드 세션은 이번 안내를 한 번 넘긴 뒤 빈 입력창을 확인한다. [세션 전달 계약](workspace-mcp.md#다른-세션으로-작업-전달)

## 배포 및 검증

- [공개 Standard EXE 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.27)는 2026-11-18 18:40:16 KST에 게시했다. 빌드 소스는 `2c1af4b8e724240041c93b24b0cb343b00445acb`다.
- 데스크톱 278개 파일·2,267개 테스트와 TypeScript·Vite 빌드가 통과했다. 패키지 런타임의 관련 검사 204개, 인증된 HTTP, native PTY와 소스 대비 445개 패키지 파일을 검증했다. 실제 두 업데이트 선택창의 터미널 출력을 재생해 감지와 한 번의 건너뛰기 동작을 확인했다.
- 1.8.2.26과 1.8.2.25에서 업데이트를 감지했다. 18:41:12 KST에 공개 자산의 크기·SHA-256, 설치 파일의 NSIS CRC `ee19ecaa`, 압축 데이터 및 설치 전 시작을 확인했다. Authenticode 표시는 `NotSigned`다. 사용자 PC에는 설치하지 않았다.
- EXE에는 기존 서명 APK 1.8.1.39가 포함된다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.27-x64.exe` | 156408404 | `1fd336706600fec637b2f68640b053f778230462b6e746afd6c8550fda4eaebe` |
| `Acedia-Setup-1.8.2.27-x64.exe.blockmap` | 163267 | `5c1f9d3664bd2cf0c7f81804a7f97bc79a8a36bf41aba1c034b0ba01b236512c` |
| `latest-exe.json` | 256 | `e3956ef1c1a4b9c4a0e1669866a0db5baaf5eb9bfa25130d28be382152cb5469` |
