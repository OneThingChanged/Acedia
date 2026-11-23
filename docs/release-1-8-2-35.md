---
type: Release
title: Acedia 1.8.2.35
status: published
last_updated: 2026-11-23
---

# Acedia 1.8.2.35

- `/acedia`처럼 하위 경로에서 제공하는 Remote는 연결 가능한 Android APK만 다운로드에 표시합니다. 포함된 APK가 하위 경로를 지원하지 않으면 브라우저 접속 안내가 표시됩니다.
- Windows Standard EXE에는 기존 서명 APK 1.8.1.39가 들어 있습니다. 하위 경로를 지원하는 서명 Android 업데이트는 별도 배포가 필요합니다.

## English

- Remote addresses mounted below the hostname root offer the Android download when the bundled APK supports service paths. Otherwise, Remote shows that the browser can be used at the same address.
- The Windows Standard EXE bundles the existing signed Android APK 1.8.1.39. The signed Android update for mounted addresses requires a separate release.

## 배포 및 검증

- 2026-11-23 10:16:59 KST에 `c0ab11ce01c740db8817129f9f0d5ae873d61962`에서 빌드한 Windows Standard EXE를 게시했습니다. [GitHub 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.35)
- 소스 테스트 2,348개를 통과했습니다. 설치 패키지로 하위 경로의 브라우저 접속과 구형 APK 차단, 루트 경로의 기존 APK 다운로드, Dashboard와 앱 수명주기를 확인했습니다.
- 1.8.2.33과 1.8.2.34에서 업데이트를 감지했습니다. 10:17:57 KST에 공개 다운로드의 SHA-256, NSIS CRC `2ff56e93`, 압축 데이터와 설치 프로그램 시작을 확인했습니다. 설치 파일의 Authenticode 상태는 `NotSigned`입니다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.35-x64.exe` | 156430758 | `1f3fcb3d9d69e744b64a3cef5bcc83f79e5546f96f651d93ecf1513c6f89a27a` |
| `Acedia-Setup-1.8.2.35-x64.exe.blockmap` | 163454 | `8cd896b6e723b8a216513d48855b06a0fbdb6b072f6217d607d1dedb47b3d09e` |
| `latest-exe.json` | 256 | `6e1604f90b085c8c9b1a912fd7142e95fe0e60d54848a3d92467c93e0c5c66ef` |
