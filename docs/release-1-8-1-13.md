---
type: Release
title: Acedia 1.8.1.13
description: Remove the Gemini CLI integration while retaining Antigravity CLI.
status: stable
sources:
  - resource: gemini-cli.md
  - resource: ../app/src/types.ts
  - resource: ../app/src/lib/spawn.ts
---

# Acedia 1.8.1.13

- 새 프로젝트·세션, 설정과 Remote 도구 목록에서 Gemini CLI를 제거했습니다. Antigravity CLI는 계속 사용할 수 있습니다.
- 저장된 Gemini 세션은 보존합니다. 다시 실행하면 새 Antigravity CLI 세션을 만들라는 안내를 표시하며, 다른 도구로 자동 전환하지 않습니다.
- 컴퓨터에 설치된 Gemini CLI와 로그인·설정 파일은 변경하지 않습니다.

## 검증 범위

전체 테스트 718개, TypeScript 검사, Electron 고급 실행 UI·네이티브/cmd PTY 검사를 통과했습니다.

GitHub EXE 채널 배포이며 기존 검증된 모바일 APK 1.8.0.1을 재사용합니다. 실제 사용자 프로필에 설치하거나 Acedia 내부에서 모델 응답을 받는 검증은 포함하지 않습니다.

EXE 빌드, packaged bridge/lifecycle 검사 및 변경된 패키지 소스 일치 검사를 통과했습니다. 설치 파일 FileVersion은 1.8.1.13, 크기는 120346182 bytes, SHA-256은 `64f23fb75a0d5fa906d21d19b725de6aa9e752601d87880407cc7a3568c3a972`입니다. Authenticode 상태는 NotSigned입니다. 종료 검사 중 GPU 진단이 출력되었지만 필수 성공 마커와 종료 코드는 정상이었습니다.
