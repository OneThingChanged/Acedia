---
type: Release
title: Acedia 1.8.1.14
description: Antigravity account quota collection and status-bar display.
status: stable
sources:
  - resource: gemini-cli.md
  - resource: ../app/electron/services/antigravity-usage.mjs
  - resource: ../app/src/components/UsageStatusBar.tsx
---

# Acedia 1.8.1.14

- Antigravity CLI가 전달하는 계정 한도를 Acedia 하단바와 Remote에 연결했습니다.
- 하단바에서 Antigravity를 선택하면 Gemini의 5시간·주간 한도를 함께 표시합니다. 상세 창에서 다른 모델 한도와 초기화 시각을 확인할 수 있습니다.
- 기존 사용자 상태 표시줄 명령을 보존합니다. 인증 정보·프롬프트·대화 원문은 사용량 스냅샷에 저장하지 않습니다.

## 사용 방법과 갱신 범위

업데이트 후 기존 Antigravity 세션은 한 번 다시 시작합니다. 하단바 계정 목록에서 **Antigravity**를 선택하고, 남은 비율을 보려면 상태 표시줄 설정을 **남음**으로 변경합니다.

CLI 상태 변경 시 한도를 수신하며, `/usage`는 Google 서버에서 한도를 갱신합니다. Acedia의 새로고침은 마지막 수신 데이터를 다시 읽습니다. 5분간 수신이 없으면 마지막 수신 데이터임을 안내합니다. AI Studio API 결제 비용이나 토큰 집계와는 별도이며, SSH 한도 수집은 포함하지 않습니다.

## 검증

전체 테스트 725개, TypeScript 검사, 실제 로그인된 Antigravity 1.2.2의 한도 수신 및 Electron 하단바 표시를 확인했습니다. 공백이 있는 Windows 경로와 배포 EXE의 스크립트 실행, 기존 사용자 상태 표시줄 출력 보존도 검증했습니다. 실제 모델 요청은 수행하지 않았습니다.

GitHub EXE 채널 배포이며 기존 검증된 모바일 APK 1.8.0.1을 재사용합니다. 사용자 프로필에 설치·업데이트를 적용하는 검증은 게시·다운로드 검증과 별개입니다.

EXE 빌드, packaged bridge/lifecycle 및 패키지의 수집기·렌더러 소스 일치 검사를 통과했습니다. FileVersion은 1.8.1.14, 설치 파일 크기는 120349429 bytes, SHA-256은 `e262848f9769f20d7c60561ff36766b150ef46539211f188ea7b747234e31018`입니다. Authenticode 상태는 NotSigned입니다. 종료 중 GPU 진단이 출력됐으나 필수 성공 마커와 종료 코드는 정상입니다.
