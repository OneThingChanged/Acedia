---
type: Release
title: Acedia 1.8.1.28 EXE and Android release
description: Prevent accidental Remote page zoom on mobile while retaining touch scrolling.
status: stable
sources:
  - resource: remote-service.md
  - resource: ../app/electron/remote-pwa/index.html
  - resource: ../app/electron/remote-pwa/styles.css
  - resource: ../app/electron/remote-pwa/sw.js
  - resource: ../mobile/src/screens/RemoteScreen.tsx
---

# Acedia 1.8.1.28

- Remote의 모바일 페이지 폭과 배율을 고정해 두 손가락 확대 때문에 화면이 잘리는 현상을 막는다. 터미널의 한 손가락 세로 스크롤은 유지한다.
- Android 앱의 WebView 내장 확대 컨트롤을 끈다. 이 설정은 네이티브 APK 변경이므로 새 APK 설치가 필요하다.
- Remote 서비스 워커 캐시를 v72로 올려 변경된 HTML과 CSS를 갱신한다.
- Standard EXE와 같은 버전의 서명된 ARM64 APK를 함께 배포한다. Android versionCode는 20이다. Microsoft Store 채널은 갱신하지 않는다.

모바일 브라우저/PWA와 Android WebView의 실제 터치 동작은 기기에서 확인해야 한다.
