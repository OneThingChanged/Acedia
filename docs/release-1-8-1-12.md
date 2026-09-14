---
type: Release
title: Acedia 1.8.1.12
description: Gemini and Antigravity terminal integration and Dashboard/Remote chat scroll preservation.
status: stable
sources:
  - resource: gemini-cli.md
  - resource: remote-service.md
  - resource: ../app/src/types.ts
  - resource: ../app/electron/remote-pwa/app.js
---

# Acedia 1.8.1.12

- 새 세션과 설정에 Gemini CLI 및 Antigravity CLI를 추가했습니다. 설치 감지, 실행 기본값, 고급 실행 옵션과 Remote 세션 생성을 지원합니다.
- 개인 Google 계정·AI Pro·Ultra 사용자는 Antigravity CLI를 선택합니다. Gemini CLI의 해당 계정 서비스 종료 안내를 설정과 [연동 문서](gemini-cli.md)에 반영했습니다.
- 대시보드·리모트에서 최하단에 있던 채팅은 메시지 전송, 입력창·첨부·대기열 크기 변경과 채팅 갱신 후에도 최하단을 유지합니다. 이전 대화를 읽고 있으면 스크롤 위치를 유지합니다.

## 사용 및 검증 범위

CLI는 별도 설치가 필요하며 기존 로그인 환경을 사용합니다. Antigravity 설치 후 Acedia를 다시 시작하고 **새 세션 → Antigravity CLI**를 선택합니다. 두 도구는 터미널 방식이며 앱 내 계정 관리, 사용량 수집, 대화 기록, 자동 복원 및 브라우저 MCP 자동 설정은 아직 제공하지 않습니다.

전체 테스트 717개, 실행 설정 Electron UI·네이티브/cmd PTY 검사, 1920/1280/390px Remote UI 검사를 통과했습니다. 사용자의 스크린샷에서 독립 Antigravity CLI Google 로그인 성공을 확인했으며, Acedia 내부의 실제 모델 응답은 미검증입니다.

최종 EXE 빌드, packaged bridge/lifecycle 검증과 패키지 내 소스 일치 확인을 통과했습니다. 설치 파일 FileVersion은 1.8.1.12, Authenticode 상태는 NotSigned입니다. 검사 중 PTY 종료의 AttachConsole 진단과 종료 시 GPU 진단이 출력됐지만 필수 성공 마커와 종료 코드는 정상입니다.

GitHub EXE 채널 배포입니다. 기존 검증된 모바일 APK 1.8.0.1을 재사용하며 Store와 Company 배포는 포함하지 않습니다. 실제 사용자 프로필 설치·업데이트 적용 여부는 게시·다운로드 검증과 별개입니다.
