---
type: Release
title: Acedia 1.8.1.54 async question phone notifications
description: Forward Codex async questions to the phone without interrupting work or repeating alerts for partial answers.
status: stable
last_updated: 2026-10-05
sources:
  - resource: notifications-and-power.md
  - resource: remote-service.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/services/active-questions.mjs
  - resource: ../app/electron/main.mjs
  - resource: ../app/electron/services/web-services.test.mjs
---

# Acedia 1.8.1.54

## 변경 사항

- **Codex 비동기 질문 폰 알림 수정**: 1.8.1.53에서 작업 중 질문을 채팅에 표시하면서 폰 알림 전송은 호출하지 않던 누락을 수정했다. 실제 터미널에 남아 있는 질문을 확인한 뒤 기존 native monitor와 Web Push로 응답 필요 알림을 전달한다.
- **작업 상태와 알림 중복 방지**: 실행을 중단하는 대기 훅을 만들지 않고 Working을 유지한다. 대화·질문 call ID로 한 번만 알리며 부분 답변이나 여러 질문 폼을 오가도 반복하지 않는다. 중단한 세션의 감지 기록을 정리하고 전송 호출 실패 시 재시도한다.
- 전역 질문 알림과 세션별 음소거 설정을 적용하며 기존 완료 알림 경로를 유지한다. 잠금화면 payload는 기존의 일반 응답 필요 문구를 사용한다.
- 제품·설치 파일·Android 소스 버전은 **1.8.1.54**, npm 호환 버전은 **1.8.1**이다. 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다. PC 업데이트로 질문 전송 수정이 적용되며 폰의 알림 권한·연결·채널 설정은 기존과 같다.

## Changes

- Send phone alerts for live Codex async questions. Version 1.8.1.53 refreshed chat but omitted the notification transport call.
- Preserve the working hook and notify once per conversation/call identity, including across partial answers and queued forms. Prune stopped sessions and retry failed transport calls.
- Reuse authenticated native monitoring and Web Push with existing global/session notification preferences and generic question payloads. Keep completion notifications unchanged.

## 검증

- 관련 **7개 파일·46개 테스트**를 통과했다. 질문 ID 중복 방지, 부분 답변·다른 질문·대화 변경, 동시 전송·실패 재시도·정리를 확인했다.
- 전체 **161개 파일·1,052개 테스트**를 통과했다. Windows Store/process 검사는 각각 따로 실행했다. TypeScript/Vite 빌드, EXE 생성, packaged bridge·Dashboard·내장 Git·종료·트레이·보안 lifecycle 검증도 통과했다.
- 변경한 Electron 소스와 renderer 파일의 패키지 포함·원본 일치, 재사용 APK, 설치 파일 FileVersion **1.8.1.54**와 manifest 크기·SHA-256·blockmap을 확인했다. Authenticode는 기존 EXE 채널과 같은 **NotSigned**다.
- 로컬 산출물과 공개 다운로드 모두 `publish-github-exe.ps1 -VerifyOnly`를 통과했다.
- 실제 격리 HTTP native monitor API에서 질문 이벤트 1건 수신, Working 유지, 일반 문구 사용과 음소거 시 이벤트 억제를 검증했다. 실제 사용자 폰에 모의 완료·질문 알림을 보내지 않았다.
- 사용자 PC의 읽기 전용 확인에서는 실행본 **1.8.1.52**, 전역 질문·완료 설정과 등록 세션 알림 켬, loopback Remote와 공개 로그인 페이지의 정상 응답을 확인했다. 저장된 기기 토큰은 유효기간 내다. 저장된 토큰만으로 폰의 실제 백그라운드 연결·알림 소리 상태는 확인할 수 없다.

## 공개 배포

2026-10-05 **15:35:27 KST**, [v1.8.1.54](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.54)를 최신 안정 EXE 릴리스로 게시했다. 제품 태그와 릴리스 대상은 검증한 소스 `4689d445ace856f138dc848fbbdd84fab0191a78`이다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.54-x64.exe` | 151,256,976 | `3753729d3b8eff91f5a8ac6a8549699520c2766ff7e4f607881bcd8f73c748b8` |
| `Acedia-Setup-1.8.1.54-x64.exe.blockmap` | 159,251 | `7a1eb5397b7b97ef8b174a0e3b114c28a75ea6cb01e3bd86203afe34a0d43e7f` |
| `latest-exe.json` | 256 | `074011ba7a6a8521b771577ec4f1763ec1bcb6e17b62f4333a74024f530f8e3e` |

**15:36:35 KST**에 프로덕션 업데이터의 **1.8.1.52 및 1.8.1.53 → 1.8.1.54 감지**와 **1.8.1.53 기준 실제 EXE 다운로드·설치 전 해시 검증**을 완료했다. 세 공개 자산의 실제 크기·SHA-256, 최신 안정 릴리스, 고정 소스 태그와 번들 APK 버전 **1.8.1.39**도 일치했다.

Git 소스와 EXE 게시를 완료했다. 사용자 PC의 설치 프로그램을 실행하지 않았으며 폰 실기기 수신·소리 여부는 확인이 필요하다. 설정의 Check → Update로 PC 수정본을 적용한다. Microsoft Store와 새 APK 배포는 수행하지 않았다.
