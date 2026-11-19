---
type: Release
title: Acedia 1.8.2.30
status: published
last_updated: 2026-11-20
---

# Acedia 1.8.2.30

- 프로젝트 보드에서 세션이 많은 카드는 2~3열로 배치한다. 읽기 참조 점선은 카드 사이에서 겹침이 적은 경로를 우선한다. 점선을 선택하면 나머지 참조선을 흐리게 표시한다.
- 왼쪽 세션 목록은 같은 날 세션을 다시 열어도 순서를 유지한다.
- Remote의 Claude 채팅에서 전달 방식 버튼과 `Tab`으로 작업 중 추가 입력을 선택할 수 있다. Remote 소유자는 JSONL 로그를 미리 보고 원본을 다운로드할 수 있다. 큰 로그의 미리보기는 마지막 512KiB 범위로 제한한다.
- Android 소스의 새 PC 연결 검사, 알림 모니터와 문서 미리보기는 등록한 서비스 하위 경로를 유지한다.

## 배포 및 검증

- 2026-11-20 06:06:56 KST에 게시했다. 빌드 소스는 `7cc952c199435a2d4d5616c7feb669bd29f12ded`이다. [공개 Standard EXE 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.30)
- 데스크톱 전체 테스트 2,297개와 Android 테스트 28개, Android 타입 검사와 데스크톱 프로덕션 빌드가 통과했다. 격리한 Claude Code 2.1.317에서 진행 중 한글 여러 줄 입력을, 패키지 HTTP에서 소유자의 JSONL 미리보기와 원본 바이트를 확인했다. native PTY, Dashboard, 시작·종료 검사와 패키지 파일 446개도 검증했다.
- 1.8.2.29와 1.8.2.28에서 업데이트를 감지했다. 06:07:31 KST에 공개 자산의 SHA-256, 설치 파일의 NSIS CRC `d7150a64`, 압축 데이터와 설치 전 시작을 확인했다.
- EXE의 Authenticode 상태는 `NotSigned`다. Android 릴리스 키와 로컬 서명 설정이 없어 새 APK 빌드는 서명 검사에서 중단됐다. EXE는 검증한 기존 서명 APK 1.8.1.39를 포함한다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.30-x64.exe` | 156413589 | `46805af9e99405725f2caf7e08ef653447b92aa66ca25fd047bfde6d38f51bdc` |
| `Acedia-Setup-1.8.2.30-x64.exe.blockmap` | 163513 | `d53ca58356cd360e3154a02a1d3221b074b6faac21fbbbe2d1ae06b9e4038ecd` |
| `latest-exe.json` | 256 | `48a67e801f9799d16a044a980d7b2bc9116ed2cd939e68f2dabd7d9094223c6b` |
