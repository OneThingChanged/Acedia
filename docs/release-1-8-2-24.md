---
type: Release
title: Acedia 1.8.2.24
status: published
last_updated: 2026-11-17
---

# Acedia 1.8.2.24

- 터미널에서 줄바꿈된 폴더 경로가 중간에서 끊겨 열리지 않는 문제를 수정한다. 확장자가 없는 폴더와 괄호·대괄호·인용부호·백틱으로 표시된 경로를 복원하며, 앞줄과 이어진 줄 모두 전체 경로를 가리킨다.
- 경로의 이어진 줄에서 글자 색이 바뀌어도 명시적인 경로 경계를 유지한다. 경계 부호가 없는 강조 경로는 화면 가장자리·같은 강조 색·이어진 줄의 들여쓰기를 확인해 연결한다.
- 마우스 위치 판정과 호버 링크에 같은 전체 경로를 적용하고, 문장·빈 줄·별도 절대경로·떨어진 열을 잘못 합치지 않도록 제한한다. 3줄짜리 이미지 경로와 기존 파일·문서·영상 링크 동작을 유지한다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 포함한다.

## English

- Fix terminal folder links being truncated at TUI line breaks. Recover extensionless folders and paths bounded by parentheses, brackets, quotes or backticks so either row targets the full path.
- Preserve explicit path boundaries when continuation rows use another foreground color. Join bare highlighted paths only when the pane edge, foreground run and continuation indentation provide evidence.
- Keep mouse hit detection and hover links consistent. Avoid merging prose, blank lines, separate absolute paths or distant columns, while retaining three-row image and existing file, document and video behavior.
- Standard EXE release bundling the existing signed Android APK 1.8.1.39.

## 검증

- 수정 전 실제 xterm 버퍼의 재현 검사 5개에서 보고된 `Native24-20261116-QA-` 위치까지 경로가 잘렸다. 수정 후 폴더 전체를 임시 파일시스템에서 찾고, 양쪽 행의 클릭 위치·호버 범위·활성화 콜백이 같은 경로를 사용하는 것을 확인했다.
- 소스의 전체 Vitest 270개 파일·2,208개 테스트와 관련 경로 검사 69개, TypeScript/Vite 빌드가 통과했다. 배포 버전 메타데이터에서도 전체 검사를 다시 확인한다.
- 검사는 Node의 실제 xterm 버퍼와 임시 폴더를 사용하며 GUI 자동화·운영 세션 변경·모델 호출을 수행하지 않는다.

## 패키지 검증

- 제품 소스 `8fedfc2f2f14de0ed6fc27b63f804bd10b29297f`를 별도 작업 폴더와 복사한 의존성으로 고정해 빌드했다. ASAR 런타임·렌더러 439개 파일, Pixel Office 자산·라이선스 20개와 정본 고지 파일을 대조했다.
- 패키지의 Electron Node 런타임·인증된 HTTP·native PTY 검사 30개와 같은 고정 소스의 경로 회귀 검사 69개가 통과했다. 경로 검사는 배포용 Electron Node 런타임과 실제 xterm 버퍼를 사용하며 GUI를 조작하지 않는다.
- 로컬·공개 EXE의 NSIS CRC `4d476217`, 내부 압축 데이터 전체와 설치 전 검증 모드가 통과했다. Authenticode 상태는 `NotSigned`다. 검증은 설치·레지스트리 변경·기존 앱 종료 전에 끝난다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.24](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.24).
- 게시: **2026-11-17 01:53:26 KST**. 공개 전체 다운로드 검증: **2026-11-17 01:54:38 KST**.
- **1.8.2.23 / 1.8.2.22 → 1.8.2.24** 감지를 실제 업데이터로 확인했다. 태그·manifest·EXE·blockmap의 소스·버전·크기·SHA-256이 빌드 원본과 일치한다.
- 앱 업데이트를 적용해야 새 경로 인식이 반영된다. 새 APK·Store·Company 배포와 사용자 PC 설치는 수행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.24-x64.exe` | 156390394 | `7700fb3e575421d952a6bf014b93a8c0174c5ba90b81051a253b7089b69afdd2` |
| `Acedia-Setup-1.8.2.24-x64.exe.blockmap` | 163484 | `80c1d1a0da3769b2d4704bff5f7f3996deaea0044ca27687b143ba743345bcfc` |
| `latest-exe.json` | 256 | `0cafa48f2ca4ab87455e53e0917572370f0607e08d15ce51a6c628999578a429` |
