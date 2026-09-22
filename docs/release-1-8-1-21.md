---
type: Release
title: Acedia 1.8.1.21 source changes
description: Remote chat video playback and video entries in Documents; publication pending.
status: draft
sources:
  - resource: ../app/electron/services/remote-documents.mjs
  - resource: ../app/electron/remote-pwa/app.js
  - resource: ../app/electron/remote-pwa/chat-markup.js
  - resource: ../app/electron/services/remote-video.test.mjs
  - resource: ../app/scripts/electron-remote-video-smoke.mjs
---

# Acedia 1.8.1.21

Remote 채팅의 MP4·WebM 경로를 클릭하면 영상 플레이어가 열립니다.
Documents 목록에도 영상이 VIDEO 항목으로 표시되며 클릭하면 재생할 수 있습니다.
플레이어는 재생·일시정지·음량·탐색·전체화면 기능을 제공합니다.
채팅 미리보기를 닫으면 영상 연결을 해제하고 Documents를 떠나면 재생을 멈춥니다.

영상은 프로젝트 경로 검증과 기존 인증을 거쳐 디스크에서 스트리밍합니다.
GET·HEAD 및 단일 HTTP Range 요청을 지원하며 이미지의 25MB 제한을 적용하지 않습니다.
HTML 미리보기 안의 MP4·WebM도 같은 구간 전송을 사용합니다.
별도 Hosting 프록시의 지원 형식은 변경하지 않습니다.

관련 테스트 25개, 실제 Electron WebM 재생·닫기·Documents 목록·모바일 폭 탐색,
기존 Remote PWA 데스크톱·모바일 회귀 검사와 OKF 검증을 통과했습니다.
브라우저가 지원하지 않는 코덱은 재생할 수 없으며, 실제 Android 기기와 배포된
터널을 통한 재생은 아직 검증하지 않았습니다.

이번 작업은 소스 커밋까지입니다. 푸시·EXE/APK 빌드·배포는 수행하지 않았습니다.
모바일 소스 versionName만 동기화하고 APK versionCode는 유지합니다.
기존 Codex 설정 보존 관련 미커밋 변경은 포함하지 않습니다.
