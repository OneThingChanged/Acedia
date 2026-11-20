---
type: Release
title: Acedia 1.8.2.31
status: published
last_updated: 2026-11-20
---

# Acedia 1.8.2.31

- Remote와 Dashboard에서 세션을 재시작할 때 기존 대화와 실행 계정을 이어갑니다. 계정을 사용할 수 없으면 기존 CLI를 유지하고 요청 화면에 원인을 표시합니다.
- LAN 대시보드의 8자리 연결 코드 입력을 제거했습니다. Acedia 설정에서 복사한 접속 링크를 열면 연결됩니다. 링크를 갱신하면 이전 링크와 활성 연결을 해제합니다.
- Standard EXE에는 기존에 서명한 Android APK 1.8.1.39를 포함합니다.

## 배포 및 검증

- 2026-11-20 19:08:02 KST에 `53b740c9aefee833145c987c0ca0857e8b13f1a3`에서 빌드한 Standard EXE를 게시했습니다. [GitHub 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.31)
- 데스크톱 테스트 2,302개, Android 테스트 28개와 타입 검사, 프로덕션 빌드를 통과했습니다. 패키지에서 하위 경로의 Remote 재시작 API, 계정 오류 시 활성 런타임 보존, LAN 인증과 이전 링크 해제, native PTY, Dashboard 및 앱 수명주기를 검증했습니다.
- 1.8.2.29와 1.8.2.30에서 업데이트를 감지했습니다. 19:08:46 KST에 공개 자산을 내려받아 SHA-256, 설치 파일의 NSIS CRC `56dab841`, 압축 데이터와 설치 전 시작을 검증했습니다. EXE의 Authenticode 상태는 `NotSigned`입니다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.31-x64.exe` | 156414520 | `04d83872d174224943b017f012da16328366c1b8eebd4aff1b2446468bec9365` |
| `Acedia-Setup-1.8.2.31-x64.exe.blockmap` | 163440 | `4d7986ddab472fed8c5134f554812bd8b170cca49486bcb5429b19228acb666f` |
| `latest-exe.json` | 256 | `40686d31deb4cccadac0f4166c4b02928ba7b88d3c051e3db01b8649f41f3391` |
