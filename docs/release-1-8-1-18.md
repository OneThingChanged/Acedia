---
type: Release
title: Acedia 1.8.1.18 EXE release
description: Wrapped terminal file links and opt-in external provider connections.
status: stable
sources:
  - resource: ../app/src/lib/terminalWrappedPath.ts
  - resource: ../app/src/lib/terminal.ts
  - resource: ../app/scripts/electron-terminal-links-smoke.mjs
---

# Acedia 1.8.1.18

- 터미널 화면 끝에서 CLI가 직접 개행한 괄호 안 파일 경로를 복원합니다.
  앞줄과 뒷줄에서 전체 파일 경로를 열며, 기존 자동 줄바꿈도 유지합니다.
  일반 문장을 합치지 않도록 경로 형태·화면 끝 위치·탐색 행 수를 제한합니다.
- **설정 → 에이전트 → Codex → provider 계정 자동 분배**에서 외부 서버 주소,
  암호화한 API 키와 WebSocket 사용 여부를 저장합니다. 연결 확인은 모델 목록만
  조회하며 실제 생성 요청을 보내지 않습니다.
- 다음 로컬 Codex 실행부터 프록시 연결을 적용합니다. 실행 중인 세션과 SSH에는
  적용하지 않습니다. 계정 등록·분배 전략·대화 고정은 외부 provider 서버가
  담당하며, Acedia는 서버를 설치하거나 시작하지 않습니다.
- 기존 대화 기록을 자동 변환하지 않습니다. 연결 방식을 바꿀 때는 새 대화를
  권장합니다. 로컬 계정 한도는 서버 계정 풀의 사용량과 다를 수 있습니다.

EXE 전용 배포입니다. 모바일 소스 버전만 동기화하고 기존 검증된 APK를 재사용합니다.
새 APK, Company 릴리스 또는 Microsoft Store 제출은 생성하지 않습니다.

회귀 검사 80개와 줄바꿈 경로 검사 8개, Electron 설정 UI·암호화·실제 IPC 검사,
설치된 Codex CLI의 모의 서버 모델 목록 요청을 확인했습니다. 실제 xterm에서도
PNG·Markdown 경로의 직접 개행/자동 줄바꿈에 대해 앞줄·뒷줄 포인터 클릭 및
마우스 좌표 기반 링크 탐색을 확인했습니다. 외부 서버의 실제 계정 분배와 한도
소진 시 동작은 이 검사에 포함하지 않습니다.

전체 회귀 검사와 EXE 패키지 검증을 통과한 산출물을
[GitHub Release](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.18)에 게시합니다.
게시와 현재 PC의 업데이트 설치는 별도 상태입니다.
