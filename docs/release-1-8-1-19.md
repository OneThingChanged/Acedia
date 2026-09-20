---
type: Release
title: Acedia 1.8.1.19 EXE release
description: Refresh local HTML and relative assets when reopening an existing document tab.
status: stable
sources:
  - resource: ../app/electron/services/document-preview-refresh.mjs
  - resource: ../app/src/components/DocViewer.tsx
  - resource: ../app/scripts/electron-document-preview-smoke.mjs
---

# Acedia 1.8.1.19

HTML 문서를 다시 열면 기존 탭에서 최신 파일을 읽습니다. 이미 표시 중인 문서를
파일 목록이나 터미널 링크로 다시 열어도 갱신하며, 연결된 JavaScript 등 상대경로
리소스도 다시 로드합니다. 만료된 미리보기 주소는 새 주소로 복구합니다.
열린 문서를 계속 감시하는 자동 갱신 기능은 아닙니다.

Electron 검사에서 변경된 HTML·JavaScript 반영과 만료 주소 복구를 확인했습니다.
관련 회귀 검사 9개, 프런트엔드 빌드와 OKF 검증을 통과했습니다.
데스크톱 전체 회귀 검사 766개와 모바일 타입 검사·테스트 24개를 통과했습니다.
Standard packaged smoke와 lifecycle smoke를 통과했습니다. 문서 탭 재사용,
Dashboard, 트레이 복귀와 종료·복원 검사를 포함합니다. 검사 로그에는 종료된 PTY의
`AttachConsole failed` 메시지가 있었으며 최종 성공 마커와 종료 코드 0을 확인했습니다.
APK의 릴리스 서명·패키지 ID·ARM64 구성과 EXE manifest의 크기·SHA-256을 검증했습니다.
Windows EXE의 Authenticode 상태는 `NotSigned`입니다.

Windows EXE와 Android APK를 함께 배포합니다. APK versionName은 `1.8.1.19`,
versionCode는 `19`이며, 같은 APK를 EXE에도 포함합니다. HTML 재열기 수정은
데스크톱 기능이며 모바일은 버전을 맞춰 재빌드합니다.
Company 릴리스나 Store 제출은 생성하지 않습니다.
GitHub 게시와 현재 PC의 설치·업데이트 완료는 별도 상태입니다.
실제 Android 기기에 새 APK를 설치하는 검사는 수행하지 않았습니다.
