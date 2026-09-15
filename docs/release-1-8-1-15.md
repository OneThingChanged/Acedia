---
type: Release
title: Acedia 1.8.1.15
description: Exact Antigravity conversation recovery per Acedia session.
status: stable
sources:
  - resource: gemini-cli.md
  - resource: ../app/electron/services/session-service.mjs
  - resource: ../app/src/lib/spawn.ts
---

# Acedia 1.8.1.15

- Antigravity 세션을 다시 열면 저장된 대화 ID로 자동 복원합니다.
- 같은 폴더의 여러 세션도 각각의 대화로 복원합니다. 최근 대화로 임의 대체하지 않습니다.
- 잘못된 ID, 삭제된 대화 파일, 변경된 작업 폴더는 오류로 안내합니다. 종료된 이전 실행에서 늦게 도착한 ID 알림은 무시합니다.

## 사용 방법

업데이트 후 Antigravity 세션을 다시 시작합니다. 기존에 ID를 수집하지 못한 대화는 CLI의 `/resume`으로 한 번 선택하면 이후 자동 복원됩니다. 자동 복원은 로컬 세션에 적용되며, SSH와 자동 유휴 중지는 포함하지 않습니다.

## 검증 범위

관련 테스트 59개와 TypeScript 검사를 통과했습니다. 실제 Antigravity 1.2.2에서 특정 대화를 열어 ID 수신 및 세션 인덱스 재로딩 후 같은 ID 복원을 확인했습니다. 모델 프롬프트는 보내지 않았습니다. 전체 회귀 검사에서는 730개 중 729개가 처음 통과했고, 별도 사용량 수집기 배포 테스트의 일시적 타이밍 실패는 단독 재실행에서 통과했습니다.

GitHub EXE 채널 배포이며 기존 검증된 모바일 APK 1.8.0.1을 재사용합니다. 실제 사용자 프로필의 설치·업데이트 적용은 게시·다운로드 검증과 별개입니다.

EXE 빌드, packaged bridge/lifecycle 및 패키지 소스 일치 검사를 통과했습니다. FileVersion은 1.8.1.15, 설치 파일 크기는 120351309 bytes, SHA-256은 `1df87d4f9646836fc250fd5d1b6144cd5552725fac36e9bf8aa8dbc86077dfe6`입니다. Authenticode 상태는 NotSigned입니다. 종료 시 GPU 진단이 출력됐지만 필수 성공 마커와 종료 코드는 정상입니다.
