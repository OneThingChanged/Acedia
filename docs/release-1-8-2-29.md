---
type: Release
title: Acedia 1.8.2.29
status: published
last_updated: 2026-11-19
---

# Acedia 1.8.2.29

- 보드에서 프로젝트나 자식 세션 목록을 접고 펼칠 때 카드 위치와 화면 배율을 유지한다. 더블클릭하면 선택한 카드를 확대한다.
- 세션의 우클릭과 `⋯` 메뉴에서 세부정보, 속성, 이름 변경, 대화 열기, 시작·중지, 삭제를 사용할 수 있다. 삭제는 기존 확인창에서 확정한다.

## 배포 및 검증

- 2026-11-19 02:26:31 KST에 게시했다. 빌드 소스는 `f842a5145dfae73e1b1409c5ec4de7cea6ad6e3c`이다. [공개 Standard EXE 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.29)
- 데스크톱 전체 테스트 2,282개와 버전 확정 후 보드 회귀 테스트 103개가 통과했다. 패키지의 보드 관리 요청 경로, native PTY, Dashboard, 앱 시작·종료 검사와 소스 대비 패키지 파일 446개를 검증했다.
- 1.8.2.28과 1.8.2.27에서 업데이트를 감지했다. 02:27:26 KST에 공개 자산의 SHA-256과 설치 파일의 NSIS CRC `627c016e`, 압축 데이터, 설치 전 시작을 확인했다.
- Windows 설치 파일의 Authenticode 상태는 `NotSigned`다. 기존 서명 APK 1.8.1.39를 포함한다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.29-x64.exe` | 156409534 | `9dbbff17caaf9d598eac710f2995cb5b2f514c76ffebc0b87e927bc5dbb515ce` |
| `Acedia-Setup-1.8.2.29-x64.exe.blockmap` | 163449 | `e8a24a1d345629f5e0d443a1c3cc0cf17acb27f81379cd8558c44441aab6f6d0` |
| `latest-exe.json` | 256 | `8ba68f5138ab127c880d437724580c2f6038e76a76a7d6f03e78976c34ffec14` |
