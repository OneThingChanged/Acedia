---
type: Release
title: Acedia 1.8.1.43 highlighted terminal path boundaries
description: Exclude adjacent Korean particles from highlighted terminal filesystem links.
status: stable
last_updated: 2026-10-03
sources:
  - resource: workspace-interactions.md
  - resource: exe-release-workflow.md
  - resource: ../app/src/lib/terminal.ts
  - resource: ../app/scripts/electron-terminal-links-smoke.mjs
  - resource: ../.github/workflows/release-exe.yml
---

# Acedia 1.8.1.43

## 구현

- 초록색 등으로 강조된 터미널 파일·폴더 경로의 클릭 범위를 글자 색상 경계에 맞췄다. `03_Development/GitHub/SubStorage` 바로 뒤의 일반 색상 `는`이 경로에 포함되지 않는다.
- 링크 밑줄·마우스 클릭 범위와 직접 클릭 시 경로 판별에 같은 경계를 적용했다. 조사 부분을 클릭하면 파일·폴더 열기를 실행하지 않는다.
- 한글 폴더명, 이름 자체가 `는`으로 끝나는 폴더, 공백이 포함된 절대 경로와 줄바꿈 경로를 유지한다. ANSI 팔레트 색상과 RGB 색상을 지원한다.
- [1.8.1.42의 현재 프로젝트 열기](release-1-8-1-42.md)를 포함한다. 워크스페이스 사용법·한국어·영어 README·배포 기록을 갱신하고 공식 배포 전에 실제 터미널 링크 마우스 검사를 실행한다.
- EXE만 갱신하며 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다. 제품·Android 소스 버전은 1.8.1.43, npm 호환 버전은 1.8.1이다.

## 검증

수정 전 실제 Electron에서 `SubStorage는`을 여는 실패를 재현했다. 수정 후 팔레트/RGB·상대/절대·한글·줄바꿈 경로 **8개 조합**의 클릭 대상과 조사 비클릭 검사가 통과했다. 기존 soft/hard wrap 경로와 색상 없는 한글 이름 검사도 통과했다.

관련 검사 **24개**와 1.8.1.43 TypeScript/Vite 빌드가 통과했다.

[공식 GitHub 빌드](https://github.com/OneThingChanged/Acedia/actions/runs/37028400291)에서 전체 **141개 파일·899개 테스트**, 생성 창 상호작용·22개 화면 조합, 기존 soft/hard wrap 경로와 새 색상 경계 8개 조합의 native pointer 검사, native PTY, TypeScript/Vite·NSIS 빌드와 packaged bridge/Dashboard·lifecycle 검증이 통과했다. Windows 사용량 설치·watcher와 PowerShell 검사는 각각 단독으로 실행했다. 예상한 거부 경로의 오류와 빠른 PTY 종료의 `AttachConsole failed` 로그도 관찰했으므로 로그 전체가 무오류였다는 뜻은 아니다.

## 공개 배포

2026-10-03 **00:43:37 KST**, [v1.8.1.43](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.43)를 최신 안정 릴리스로 게시했다. 제품 태그와 릴리스 대상은 고정 소스 `6fd12a31fc6ad54074d76d77e58cadada77096df`다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.43-x64.exe` | 120,878,922 | `bdef51a8c487eab1c66b1e5321e072cceaad0519cd0a5e5933aa348fdb63a5da` |
| `Acedia-Setup-1.8.1.43-x64.exe.blockmap` | 126,656 | `a8a1c5b7e1153eba9de6fbb1bbad53c06de79b7930809dffa429f086d44cf94d` |
| `latest-exe.json` | 256 | `183a95bd266c585981c1186fdb45538af7145089ade51ab1ac021fd1eee425a9` |

공개 설치 파일 FileVersion은 **1.8.1.43**, Authenticode는 **NotSigned**다. 같은 빌드의 manifest와 설치 파일 크기·SHA-256이 일치한다.

00:45:02 KST에 프로덕션 업데이터로 **1.8.1.42 → 1.8.1.43 감지·실제 다운로드·설치 전 해시 검증**을 완료했다. 공개 세 자산의 크기·SHA-256, 최신 안정 릴리스, 제품 소스 태그와 재사용 APK 버전도 확인했다. 설치 프로그램은 실행하지 않았으며 사용 중인 앱의 설정에서 업데이트를 진행한다.
