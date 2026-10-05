---
type: Release
title: Acedia 1.8.1.55 same-model capacity retry
description: Resume Codex capacity failures with the same model, effort, account and conversation; show retry progress and final failure alerts.
status: stable
last_updated: 2026-10-05
sources:
  - resource: notifications-and-power.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/services/codex-capacity-retry.mjs
  - resource: ../app/electron/main.mjs
  - resource: ../app/src/components/CapacityRetryNotice.tsx
  - resource: ../app/scripts/codex-capacity-retry-smoke.mjs
---

# Acedia 1.8.1.55

## 변경 사항

- **같은 모델로 자동 재시도**: 현재 Codex 턴이 모델 용량 부족으로 종료되면 30초·60초·120초 간격으로 최대 3회 이어서 진행한다. 기존 모델·effort·계정·대화와 실행 중인 CLI를 유지한다. Codex 자체 재연결이 끝나고 실패한 턴이 확인된 뒤 시작한다.
- **진행 상황과 실패 안내**: 터미널·Chat 및 Dashboard/Remote에 횟수와 남은 시간을 표시하고 예약을 취소할 수 있다. 계속 실패하면 자동 입력을 멈추고 경고와 데스크톱 알림 센터 기록을 남긴다. 팝업·소리·Windows 알림은 기존 응답 필요 알림 설정과 세션 음소거를 따른다.
- 사용자의 입력·중단·질문·새 대화·세션 재시작은 예약을 취소한다. 과거 기록과 인용된 오류는 제외하며, 실제 입력 화면이나 전송 결과를 확인하지 못하면 자동 재전송 없이 안내한다. 완료한 작업을 확인한 뒤 이어가라는 메시지를 사용하고 기존 도구 명령이나 요청 전체를 반복하지 않는다.
- 제품·설치 파일·Android 소스 버전은 **1.8.1.55**, npm 호환 버전은 **1.8.1**이다. 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다. 이번 용량 부족 실패 안내는 모바일 시스템 푸시로 보내지 않으며 원격 화면에서 확인할 수 있다.

## Changes

- Resume a live Codex turn after a model-capacity failure, with up to three retries after 30, 60 and 120 seconds. Preserve the model, effort, account, conversation and CLI process.
- Show retry counts, countdown and cancellation in desktop terminal/chat and Dashboard/Remote. Leave a persistent warning and desktop notification-center entry after recovery fails, honoring existing notification preferences.
- Cancel recovery on user input, interruption, questions or conversation/session changes. Ignore historical or quoted failures, verify the live composer before submission and stop on uncertain delivery. Ask Codex to check completed work before continuing rather than replaying the original request or tool commands.
- Reuse the signed mobile APK 1.8.1.39. Capacity-retry failure alerts appear in the remote view; this release does not add mobile system push for those failures.

## 검증

- 전체 **163개 파일·1,064개 테스트**를 통과했다. 일반 161개 파일·1,041개 테스트와 Windows Store/process 검사 2개 파일·23개 테스트를 나눠 실행했다.
- 설치된 **Codex CLI 0.160.0**을 격리 프로필과 로컬 응답 fixture로 실행했다. 같은 모델 `gpt-6.1-sol`·effort `high`·계정·대화 유지, 원래 요청 문맥 보존, 두 번의 재시도 후 성공 및 세 번 실패 후 한 번만 최종 안내되는 동작을 확인했다.
- 실제 Electron의 데스크톱·Remote **900/390px** 화면에서 카운트다운·횟수 갱신·취소·최종 경고와 작은 화면 레이아웃을 확인했다. 기존 Codex 질문 화면 검증과 TypeScript/Vite 빌드, production main bridge 검증도 통과했다.
- EXE 생성과 packaged bridge·Dashboard·내장 Git·종료·트레이·보안 lifecycle 검증을 통과했다. 패키지의 변경 Electron 소스 **13개**와 renderer 파일 **3개**가 빌드 원본과 일치하고 재사용 APK도 일치했다.
- 설치 파일 FileVersion **1.8.1.55**, manifest의 파일명·크기·SHA-256과 blockmap을 확인했다. 로컬 산출물과 공개 다운로드 모두 `publish-github-exe.ps1 -VerifyOnly`를 통과했다. Authenticode는 기존 EXE 채널과 같은 **NotSigned**다.
- 사용자 설치 프로그램을 실행하거나 실제 사용자 폰에 모의 알림을 보내지 않았다.

## 공개 배포

2026-10-05 **18:38:06 KST**, [v1.8.1.55](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.55)를 최신 안정 EXE 릴리스로 게시했다. 제품 태그와 릴리스 대상은 검증한 소스 `18cbd1312ecb9c6f46054b3d9cbf6039b9b444de`다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.55-x64.exe` | 151,261,475 | `029d017a374f1805396d36155b48eb9fafa51165fecb9d3a4538974708798415` |
| `Acedia-Setup-1.8.1.55-x64.exe.blockmap` | 159,070 | `e9de14182308525f969ec72cc18817895283f0f81be41cd8e43f8436915ca71b` |
| `latest-exe.json` | 256 | `86ea007d7e6089a39371bd3315738b19a0960bf623cfb05b10bab4fe4bcc1812` |

**18:38:44 KST**에 프로덕션 업데이터의 **1.8.1.53 및 1.8.1.54 → 1.8.1.55 감지**와 **1.8.1.54 기준 실제 EXE 다운로드·설치 전 해시 검증**을 완료했다. 세 공개 자산의 크기·SHA-256, 최신 안정 릴리스, 소스 태그와 번들 APK 버전 **1.8.1.39**도 일치했다.

Git 소스와 EXE 게시를 완료했다. 설정의 Check → Update로 적용한다. 사용자 PC에 설치를 실행하지 않았으며 Microsoft Store와 새 APK 배포는 수행하지 않았다.
