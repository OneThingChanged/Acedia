---
type: Feature
title: 상태 표시줄 구성
description: 계정 한도와 로컬 리소스·포트의 표시 여부 및 사용·잔여 비율 선택.
status: stable
sources:
  - resource: ../app/src/components/StatusBarSettingsPanel.tsx
  - resource: ../app/src/components/UsageStatusBar.tsx
  - resource: ../app/src/lib/statusBarSettings.ts
  - resource: ../app/scripts/electron-settings-search-smoke.mjs
---

# 상태 표시줄 구성

설정 → 상태 표시줄에서 전체 표시와 Codex·Claude·Gemini·기타 제공자, 리소스,
포트 표시를 선택한다. 기존 전체 표시 값을 유지하고 세부 항목은 기본적으로 모두 켜진다.
제공자 필터는 해당 제공자의 계정 그룹 전체에 적용하며 받은 한도 데이터가 있을 때만 표시한다.
사용하지 않는 도구의 한도나 누락된 서버 값을 새로 추정하지 않는다.

사용 비율 또는 남은 비율을 선택하면 하단 숫자·막대와 상세 한도 창에 함께 적용한다.
예를 들어 90%를 사용했으면 남은 비율은 10%이며 경고 색상은 실제 90% 소진을 기준으로
유지한다. 계정 한도는 로컬 대화의 토큰 집계와 별개라고 상세 화면에서 안내한다.
리소스와 포트는 이 PC에서 집계하며 숨기면 해당 화면의 주기적 조회도 해제한다.

선택 즉시 저장·반영하며 같은 앱 프로필의 다른 작업창과 재시작 후에도 유지한다.
저장 실패를 표시하고 실패한 값을 적용하지 않는다. 기존 Agents의 전체 사용량 표시
스위치도 같은 값을 사용한다. Remote/PWA와 모바일 표시 설정은 별도다.

## 검증

558개 테스트, 프런트엔드 빌드와 103개 설정 검색 대상·세 창 크기 검증을 통과했다.
숨김 Electron의 실제 React 화면에서 계정 그룹 숨김, 90% 사용→10% 남음 전환,
막대 폭·경고 색·상세 화면 일치, 리소스·포트 컴포넌트 제거를 확인했다.
두 창 사이 설정 동기화와 저장된 구성으로 새 창 복원도 확인했다.
