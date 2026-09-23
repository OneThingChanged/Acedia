---
type: Release
title: Acedia 1.8.1.23 EXE release
description: Independent document and HTML worker models and reasoning effort.
status: stable
sources:
  - resource: workspace-interactions.md
  - resource: ../app/src/lib/sessionWorkers.ts
  - resource: ../app/src/components/SessionWorkerFields.tsx
  - resource: ../app/electron/services/worker-role-config.mjs
  - resource: ../app/scripts/electron-worker-settings-smoke.mjs
  - resource: ../app/scripts/worker-settings-cli-smoke.mjs
---

# Acedia 1.8.1.23

- 설정의 Codex 탭, 새 세션, 세션 속성에서 문서·Markdown과 HTML 작업자의 실행 도구,
  모델, 추론 강도를 각각 선택한다.
- 기존 Luna 프리셋과 신규 기본값은 `gpt-6-luna / max`다.
- 모델 선택은 Luna·Sol·Astra 등을 항상 보여주는 전체 드롭다운으로 제공한다.
  자동완성 필터 때문에 다른 모델이 숨는 문제를 해결했고 직접 입력은 별도 옵션이다.
- 알려진 Codex 모델에 맞는 추론 강도를 표시한다. 사용자가 입력한 모델의 지원 여부는
  설치된 CLI와 계정에 따라 다르다. Claude 모델·강도도 별도로 선택할 수 있다.
- 로컬 Codex 실행은 작업자별 TOML 설정을 생성해 서로 다른 모델·강도를 유지한다.
  SSH는 로컬 경로 대신 명시적인 spawn 옵션을 지시한다. 설정 변경은 세션 재실행 시 적용한다.

## 검증 및 배포 범위

화면 조작·저장값 복원·좁은 화면 배치와 설치된 Codex의 strict-config 검사를 통과했다.
CLI 검사는 격리된 설정으로 수행하며 로그인이나 유료 모델 요청을 생성하지 않는다.
실제 계정별 모든 모델의 응답 성공을 보장하는 검사는 아니다.

배포 대상은 Standard EXE GitHub 채널이다. 기존 검증된 APK 1.8.1.19를 재사용하며
새 APK와 Microsoft Store 제출은 생성하지 않는다. 별도 소스 체크아웃에서 빌드하고,
이번 작업 이전부터 수정 중이던 hook 서비스와 해당 테스트는 포함하지 않는다.

GitHub 게시 및 자산의 최종 상태는
[릴리스 페이지](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.23)에서 확인한다.
게시와 사용 중인 PC의 업데이트 설치는 별도다.
