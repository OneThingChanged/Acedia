---
type: Release
title: Acedia 1.8.1.52 session usage
description: Measure per-session tokens and API baseline USD with exact conversation ownership, parent/child totals and CSV export.
status: draft
last_updated: 2026-10-05
sources:
  - resource: session-usage.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/services/usage-session-summary.mjs
  - resource: ../app/electron/remote-pwa/usage-sessions.js
  - resource: ../app/scripts/electron-session-usage-smoke.mjs
---

# Acedia 1.8.1.52

## 변경 사항

- **세션별 사용량**: Usage에 새 탭을 추가했다. 오늘·최근 7일·이번 달·전체 기록의 토큰과 API 기준 USD 환산액을 프로젝트·AI·상태·검색으로 확인하고 CSV로 내보낸다.
- **부모·자식 합계**: 세션을 조직도 관계로 묶고 자체 사용량과 현재 필터의 자식 포함 합계를 구분한다. 캐시·추론 토큰을 중복 없이 표시하고 기록 당시 모델별로 계산한다.
- **정확한 대화 연결**: 같은 폴더를 사용하는 세션도 대화 ID와 완료 훅으로 구분한다. 확인된 소유자를 보존하며 기존 연결 미확인 기록은 과거 대화로 따로 표시한다.
- **가격과 기록 상태 구분**: 기존 2026-09-13 단가 스냅샷의 Codex 지원 모델을 환산한다. Claude·미지원 형식·모델은 토큰을 유지하며 미산정으로 표시한다. 금액은 실제 구독 요금·청구액과 별도인 비교 지표다.
- Dashboard와 승인된 Remote/PWA에 적용하며 숨겨진 탭은 갱신을 중지한다. 실패 시 마지막 사용량을 유지하고 재시도할 수 있다.
- 제품·설치 파일·Android 소스 버전은 **1.8.1.52**, npm 호환 버전은 **1.8.1**이다. EXE에는 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다.

## Changes

- Add Session usage to Usage with date/project/provider/status/search filters, token breakdowns, API baseline USD and CSV export.
- Group real parent/child sessions while separating each session's own usage from filtered family totals; count cached input and reasoning once and price the recorded models.
- Attribute conversations by exact IDs and completion hooks, retain confirmed ownership and display unresolved legacy history separately from shared-folder sessions.
- Show pricing coverage and distinguish unsupported prices, known zero costs and missing usage. Reuse the dated pricing snapshot; these values are comparison baselines, not subscription charges or reconstructed bills.
- Support desktop Dashboard and approved Remote/PWA views, preserve the last good totals on failures and pause polling when hidden.

## 검증

- 전체 **160개 파일·1,037개 테스트**, TypeScript 검사와 `git diff --check`를 통과했다.
- 세션 소유자 구분, 과거 기록·삭제된 세션 보존, 기존 DB 열 추가, 날짜 경계, 기록 당시 모델, 미산정·0달러 구분과 500건을 넘는 기간 집계를 확인했다.
- 로컬 Dashboard와 Remote API의 인증·필터 검증·새로고침 제한, 실제 Electron 화면의 CSV·키보드 포커스·실패 값 보존·기간 응답 순서·탭 이탈 갱신 중지를 확인했다. 1920·1280·390px의 목록·상세 배치를 검증했다.
- 기존 Remote/PWA의 대화·문서·계정 관리와 여섯 표시 언어, 세션·프로젝트 생성 창, 부모·자식 조직도, 터미널 링크와 native PTY 검증을 통과했다.

EXE 빌드·패키지 검증을 진행 중이다. 공개 배포 후 실제 업데이터 감지·다운로드 해시 검증 결과를 기록한다.
