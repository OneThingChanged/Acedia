---
type: Release
title: Acedia 1.8.1.39 notification changes
description: Quiet the Android connection indicator, refresh APK branding and show expandable final-answer previews.
status: stable
last_updated: 2026-10-01
sources:
  - resource: remote-service.md
  - resource: ../mobile/README.md
  - resource: ../mobile/app.json
  - resource: ../mobile/scripts/build-apk.mjs
  - resource: ../mobile/native/android/MultiAgentMonitorService.kt
  - resource: ../app/electron/services/remote-notification-preview.mjs
  - resource: ../app/electron/services/remote-notification-preview.test.mjs
  - resource: ../app/electron/services/remote-device-monitor-service.mjs
  - resource: ../app/electron/services/remote-device-monitor-service.test.mjs
  - resource: ../app/electron/services/web-services.mjs
  - resource: ../app/electron/services/web-services.test.mjs
---

# Acedia 1.8.1.39

## 구현

- APK의 시스템 앱 이름을 **Acedia**로 맞췄다. 기존 APK의 **MultiAgent Mobile** 표시는 오래된 생성 Android 리소스에 남아 있었다. `npm run apk`가 컴파일 전에 Expo prebuild를 실행해 앱 이름, 알림 리소스와 Kotlin 템플릿을 갱신한다.
- 연결 상태는 새 **백그라운드 연결 상태 (무음)** 채널에서 소리·진동·배지 없이 표시하고 잠금화면에서는 숨기도록 설정했다. Android foreground service의 필수 알림이므로 알림창 항목은 남는다. 사용자 설정에서 이 연결 채널만 끄면 작업 알림 채널을 유지하면서 숨길 수 있다.
- 작업 완료 알림은 **프로젝트 / 세션 이름**을 제목으로, PC 이름을 보조 정보로 표시한다. 본문에는 최종 답변을 최대 2,000자까지 넣고 Android BigText로 펼쳐 읽을 수 있다. 알림을 누르면 기존 PC·세션 이동을 사용한다.
- 데스크톱은 완료 hook의 답변을 우선 사용한다. 답변이 없으면 같은 provider session의 최근 assistant 텍스트를 읽는다. 도구 출력·추론은 제외하고, 새 질문 뒤에 이전 답변을 재사용하지 않는다. 세션 불일치·누락·1.5초 조회 제한은 일반 완료 문구로 처리한다.
- 답변 미리보기는 인증된 native monitor API와 제한된 메모리 이벤트 큐에만 포함한다. 토큰 파일에 저장하지 않으며 브라우저 Web Push는 기존 일반 문구를 유지한다. 질문 알림의 일반 응답 필요 문구도 유지한다.
- 제품 버전은 **1.8.1.39**, npm 호환 버전은 **1.8.1**, Android versionCode는 **21**이다.

## 확인한 결과

- 관련 데스크톱·릴리스 검사 **6개 파일·35개 테스트**, 모바일 **24개 테스트**, 모바일 TypeScript 검사 통과.
- 전체 데스크톱 검사 **141개 파일·899개 테스트**를 `--testTimeout=15000 --maxWorkers=4`로 통과했다.
- 실제 HTTP native monitor API에서 hook 답변과 같은 세션의 채팅 답변 미리보기 전달을 검증했다. 미리보기는 기존 브라우저 push payload에 포함되지 않는다.
- 서명된 ARM64 Release APK 빌드 통과. 패키지 `com.onethingchanged.multiagent.mobile`, 앱 이름 **Acedia**, versionName **1.8.1.39**, versionCode **21**, non-debuggable 및 프로젝트 릴리스 인증서 일치 확인.
- APK 안의 새 알림 채널, 무음·표시 범위·BigText 코드와 생성 Kotlin 소스/추적 템플릿 일치를 확인했다.
- APK 크기: **26,957,000 bytes**.
- SHA-256: `f04502319e96f1cf3e2fb1a949ec6ae81dcefad4443877f31ca36c8c15190957`.
- 로컬 후보: `.acedia/mobile-notifications-1.8.1.39/Acedia-Mobile-1.8.1.39.apk`.

## EXE 빌드와 패키지 검증

- 격리 소스에서 새 APK를 지정하고 `npm run release:build:github`를 실행했다. 데스크톱만 갱신하는 옵션을 사용하지 않았으며 TypeScript/Vite 프로덕션 빌드와 NSIS 패키징이 통과했다.
- 실제 native PTY, packaged bridge/Dashboard, packaged lifecycle 검증이 종료 코드 0으로 통과했다. 종료·트레이·보안 성공 마커를 확인했다. Bridge fixture의 빠른 PTY 종료 경로에서 `AttachConsole failed` 로그도 관찰됐으므로 로그 전체가 무오류였다고 해석하지 않는다.
- 변경된 앱·모바일 파일 12개의 기본 작업 폴더/격리 빌드 내용이 줄바꿈 정규화 후 일치한다. 변경된 패키지 서비스·테스트 6개는 격리 소스와 바이트가 일치한다. 패키지와 별도 빌드 출력의 APK도 위 서명된 APK와 같은 SHA-256이다.
- 설치 파일: `Acedia-Setup-1.8.1.39-x64.exe`.
- 앱·설치 파일 FileVersion: **1.8.1.39**.
- EXE 크기: **120,426,457 bytes**.
- EXE SHA-256: `9b6f050b7b03e8575ea809d056933dfae1fc89835e25902cfca71832bc0649e9`.
- 같은 빌드의 `latest-exe.json`은 버전·파일명·크기·SHA-256이 일치하며 `bundledMobileVersion`은 **1.8.1.39**이다. Blockmap 생성도 확인했다.
- EXE Authenticode: **NotSigned**. 파일 무결성 검증은 코드 서명을 대신하지 않는다.
- OKF 문서 검증: 오류 **0**, 기존 날짜 경고 **1** (`known-limitations.md`).

## 공개 배포

[GitHub 안정 릴리스 v1.8.1.39](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.39)를 **2026-10-01 23:36:10 KST**에 게시했다. 소스 커밋과 공개 태그는 `e7776f572360c95ff280ec19a016c33006121118`이다. GitHub 최신 안정 릴리스가 1.8.1.39이며 draft/prerelease가 아님을 확인했다.

게시 파일은 EXE, 해당 blockmap, 같은 빌드의 `latest-exe.json`, 별도 설치용 `Acedia-Mobile-1.8.1.39.apk`다. 업로드된 네 파일의 크기와 GitHub SHA-256 digest가 로컬 파일과 일치한다.

실제 `GithubExeUpdateService`로 **1.8.1.38 → 1.8.1.39** 공개 업데이트 감지를 확인했다. 공개 EXE를 다운로드해 크기·SHA-256 및 설치 전 재검증이 통과했다. 별도 공개 APK도 실제 다운로드한 바이트가 로컬 서명 APK와 같은 크기·SHA-256이다. 설치 프로그램은 실행하지 않았다.

## 설치와 실기기 검증

새 답변 미리보기에는 **데스크톱과 APK 모두 업데이트**가 필요하다. 공개 배포는 사용자 PC나 휴대폰의 설치 확인을 뜻하지 않는다. 실행 중인 사용자 앱과 세션은 종료하지 않았고 직접 설치도 수행하지 않았다. APK 교체 후 Remote 알림을 껐다 다시 켜 새 모니터링 서비스를 시작한다.

사용자 스크린샷으로 기존 APK의 작업 완료 수신을 확인했다. 새 APK의 실기기 알림 펼치기·세션 이동·잠금화면 표시와 장시간 잠금 중 즉시 수신은 아직 검증하지 않았다. 현재 전송은 Android foreground service의 서버 long-poll 방식이며 FCM이나 절전 예외 처리를 추가하지 않았다.
