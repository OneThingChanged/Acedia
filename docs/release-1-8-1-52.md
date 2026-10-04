---
type: Release
title: Acedia 1.8.1.52 session usage
description: Measure per-session tokens and API baseline USD with exact conversation ownership, parent/child totals and CSV export.
status: stable
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

- TypeScript/Vite 프로덕션 빌드와 Standard EXE 생성, 패키지의 신규 세션 사용량 모듈 포함·내장 Git·bridge/Dashboard·종료·트레이·보안 lifecycle 검증을 통과했다.
- 설치 파일과 manifest의 버전·크기·SHA-256, blockmap과 재사용 APK를 확인했다. 공개 다운로드에도 `publish-github-exe.ps1 -VerifyOnly`를 적용해 같은 결과를 확인했다. Authenticode는 **NotSigned**이며 기존 EXE 채널과 같은 상태다.

## 공개 배포

2026-10-05 **06:53:27 KST**, [v1.8.1.52](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.52)를 최신 안정 EXE 릴리스로 게시했다. 제품 태그와 릴리스 대상은 검증한 소스 `f03039600ab927eed0ddaed912205ef9838d8f08`이다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.52-x64.exe` | 151,244,041 | `276cb7d6c815767f06fa761b535fdbcca3e07108b843033388524c681f85321f` |
| `Acedia-Setup-1.8.1.52-x64.exe.blockmap` | 159,065 | `b8ddb66290d1a27595705482211ad569db4d063bee22efd2f4072d5a089feb0d` |
| `latest-exe.json` | 256 | `8fc76df14642a3e11210ecc104acb8294b6641be86de84ad042dcf24de2852ad` |

**06:54:13 KST**에 프로덕션 업데이터로 **1.8.1.50 및 1.8.1.51 → 1.8.1.52 감지**와 **1.8.1.51 기준 실제 EXE 다운로드·설치 전 해시 검증**을 완료했다. 세 공개 자산의 실제 크기·SHA-256, 최신 안정 릴리스, 고정 소스 태그와 번들 APK 버전 **1.8.1.39**도 일치했다.

Git 소스와 EXE 게시를 완료했다. 사용자 PC의 설치 프로그램은 실행하지 않았으며 설정의 Check → Update로 적용한다. Microsoft Store와 새 APK 배포는 수행하지 않았다.

## 지원 범위

사용량은 로컬에 수집된 대화 기록을 기반으로 한다. 연결 미확인 과거 기록은 사용량을 보존하되 등록 세션에 추정 배정하지 않는다. Codex 미지원 모델·형식과 Claude 비용은 미산정이며, 지원 단가의 환산액도 실제 청구액과 별도다. 상세 규칙은 [세션별 사용량](session-usage.md)을 따른다.
