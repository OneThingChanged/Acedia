---
type: Review
title: Remote workspace parity verification
description: "Development implementation and verification of the desktop workspace features shared by Remote, Dashboard and Android WebView."
tags: [remote, pwa, ux, testing]
status: reviewed
last_updated: 2026-10-12
stale_after: 2026-11-12
sources:
  - id: workspace-ui
    resource: ../app/electron/remote-pwa/workspace-ui.js
    title: "Provider logos, Screen colors and retained conversation nodes"
  - id: workspace-api
    resource: ../app/electron/services/remote-workspace-api.mjs
    title: "Shared workspace API"
  - id: workspace-tests
    resource: ../app/electron/services/remote-workspace-api.test.mjs
    title: "Dashboard and Remote endpoint validation"
  - id: workspace-smoke
    resource: ../app/scripts/electron-remote-workspace-smoke.mjs
    title: "Isolated Remote workspace runtime verification"
---

# Remote 웹 개선 검증

사용자가 1.8.1.78의 데스크톱과 Remote 웹 차이 확인 후 구현을 승인했다. 채팅,
사이드바, 기본 모델 및 새 세션 옵션을 공용 웹 클라이언트에 반영했다.
이 기록은 개발 소스의 구현·검증이며 공개 EXE 릴리스 게시 기록은 아니다.
제품 동작과 API 계약은 [Remote service](remote-service.md)에 설명한다.

## 검증 범위

Remote와 Dashboard 서버를 각각 임의의 loopback 포트에서 실행하고, 별도 임시
Chromium 프로필과 합성 세션·대화·이미지를 사용했다. 기존 사용자 세션을 종료하거나
실제 계정으로 새 모델 요청을 보내지 않았다. 이미지 복사 검사는 사용자 클립보드를
바꾸지 않고 Clipboard API에 전달하는 PNG Blob을 확인했다.

| 검사 | 확인한 동작 |
| --- | --- |
| 공용 API | 등록 세션의 이미지 sequence 읽기, 미등록 ID 거절, Remote 인증, 동일 origin, JSON 형식·크기, 기본 모델 revision 저장, 정확한 세션 종료, steering/sessionId 검증. 코드 링크의 기존 프로젝트 경계와 바이너리 파일 거절 유지. |
| 모델 UI | 현재 native 모델과 Fast가 오래된 저장값보다 우선. hook이 없어도 호스트 canRestart를 사용. 목록 갱신 중 초안 유지. effort·Fast 저장, 기본 모델 호스트 저장, Claude의 Fast 숨김. 모델 기본 effort는 생략. |
| 채팅 | 사용자 말풍선 이미지, 답변별 파일 3개 제한과 모든 파일 검색, C++ 파일 미리보기, PNG 복사, 이미지 DOM·요청 수와 열린 작업 상세 유지. 고정 Working·큐와 충분한 입력창 폭. |
| 전송 | Tab steering, 완료 후 큐, 비동기 질문 중 작업 표시·steering, blocking 질문의 예약, 대화가 바뀔 때 전송 보류. 기존 긴 작업·늦은 활성화·FIFO·실패/불확실 결과 큐 검사 통과. |
| 사이드바·옵션 | Codex/Claude 로고, 검색 전후 같은 Screen 색, Windows 경로·빈 프로젝트 검색, 프로젝트 접기, 완료의 새로고침 유지·읽음, 정확한 세션 종료, 성공한 생성의 agent·Dangerous 기억. |
| 화면 크기 | 통합 화면은 1280px·390px에서 Remote·Dashboard 각 확인. 모델 창은 1024px·390px, 기존 큐·필터는 1280px·375px에서도 확인. |

## 실행 결과

`app/`에서 다음 명령을 사용했다. Electron은 Node의 CLI로 실행해 출력 파이프를
유지하며, 검증용 창은 `show: false`인 일반 창이다.

```powershell
npm test -- --maxWorkers=2
npm run build
node node_modules/electron/cli.js scripts/electron-remote-workspace-smoke.mjs
node node_modules/electron/cli.js scripts/electron-session-model-smoke.mjs
node node_modules/electron/cli.js scripts/electron-remote-queue-smoke.mjs
node node_modules/electron/cli.js scripts/electron-remote-session-filter-smoke.mjs
```

전체 검사 **189개 파일 / 1,367개 테스트**와 TypeScript·Vite 빌드가 통과했다.
기본 동시 실행에서는 변경과 무관한 Store WACK 및 account-pool-native 검사가 각각
5초 제한에 걸렸고, 동시 worker 수를 2로 줄인 전체 재검사는 통과했다.
추가 JSON 크기·형식 검사 후 관련 API·링크·번역 검사 **34개**, 마지막 모바일 질문·입력창
조정 후 Remote 모듈과 웹 API 검사 **12개 파일 / 62개 테스트**도 다시 통과했다.

통합 검사 캡처는 `output/workspace-*-chat.png`, `output/workspace-*-model.png`,
`output/workspace-*-image.png`에 생성된다. 입력창이 기존 textarea의 `width: auto`에
덮이는 CSS 충돌을 캡처에서 확인해 수정하고 다시 검증했다.
비동기 질문 카드는 높이를 제한하고 선택 목록을 내부에서 스크롤한다. 모바일 입력창의
모델·전송 방식은 한 줄에 두어 작업 중에도 대화를 읽을 공간을 남긴다. 필터 검사에서는
숨겨진 Chromium 창의 중간 애니메이션이 좌표 검사를 흔들어 drawer 전환을 테스트에서만
비활성화하고 열린 상태의 위치를 확인했다.

Android는 같은 웹 소스를 수신한다. 실제 휴대폰의 키보드·Clipboard 지원 및 새
호스트 배포 후의 원격 네트워크 환경 검증은 이 임시 Electron 검사에 포함되지 않는다.
Fast의 실제 계정 권한과 과금·모델 실행은 기존 호스트와 CLI가 결정한다.

## 완료 후 Working 표시 수정

사용자가 보낸 ProjectWitch 화면의 실행 호스트를 loopback API로 확인했다.
`/api/state`의 renderer 상태는 `working`이지만 최신 hook은 `done`, `/api/chat`의
lifecycle은 `idle`이며 pending question도 없었다. 터미널도 완료와 입력 대기 화면을
보여줬다. 서버가 renderer의 오래된 상태를 그대로 내보내고, 웹에서도 그 Working을
Done hook보다 먼저 검사하던 우선순위가 원인이었다.

공용 `resolveSessionWorkStatus`를 호스트의 live 상태 투영과 웹의 상태 판단에 적용했다.
완료 hook 이후에는 Done, 새 working/tool hook 이후에는 Working을 사용한다. 비활성,
종료, 시작·복구 상태는 보존한다. 현재 실행 호스트의 읽기 전용 상태를 새 판정에 넣어
`working + done hook → done` 결과도 확인했다. 사용자 세션이나 대화 원본은 변경하지 않았다.

관련 검사 **13개 파일 / 95개 테스트**, TypeScript·Vite 빌드가 통과했다. Remote와
Dashboard의 **1280px·390px** 통합 UI 검사에 실제 충돌 조합을 추가해 헤더·사이드바의
Done 표시, 완료 읽음, 예약 보류와 새 작업의 Working 재전환을 확인했다.
수정은 개발 소스에 반영한 상태이며 설치된 호스트에 적용하려면 다음 EXE 배포가 필요하다.

## 외부 Remote 지연 조사

2026-10-12 실행 중인 설치본(파일 버전 `1.8.1.77`, PWA cache `v93`)을 읽기 전용으로
조사했다. 위에서 검증한 개발 소스의 DOM 유지 개선과 현재 배포된 화면을 구분한다.
실제 세션을 닫거나 입력을 전송하지 않았고, Remote 서버와 터널 설정을 변경하지 않았다.

| 조회 | JSON 크기(압축 전) | 로컬 처리 시간 |
| --- | ---: | ---: |
| 전체 상태, 27세션·23프로젝트 | 약 30KB | 캐시 조회 5~8ms |
| ProjectWitch, 최근 400블록 | 약 1.72MB | 캐시 조회 약 24ms |
| ToonShader, 최근 400블록 | 약 1.01MB | 느린 조회 5.4~5.5초 / 캐시 직후 약 23ms |
| Acedia, 최근 400블록 | 약 1.37MB | 캐시 조회 약 25ms |
| Steam, 최근 400블록 | 약 1.64MB | 캐시 조회 약 21ms |
| Nogari, 235블록 | 약 574KB | 캐시 조회 약 9ms |

ToonShader의 파일 후보 1,053개 중 30개는 도구 출력의 문자 그대로인 `\\r\\n` 등을
UNC 경로로 해석한 항목이었다. 파싱된 네트워크 호스트는 `r`, `n-`, `norigin`이었다.
`conversationFileCandidates`와 `conversationFileAssociations`가 출력의 경로 후보를 추출하고,
`ConversationStore.listBlocks`가 응답 전에 모든 후보의 `fs.stat` 결과를 기다리는 경로다.
이후 조회는 존재 파일 5초·누락 파일 30초 캐시를 사용하지만, 잘못된 네트워크 조회가
다시 필요한 시점에는 대화 로딩도 함께 지연될 수 있다.

SQLite를 읽기 전용으로 연 별도 진단에서 기존 `listBlocks`를 실행하고, 이 30개 후보만
누락 캐시로 처리했다. 산출물 INSERT는 진단용으로 무시해 원본 DB를 수정하지 않았다.
동일한 400블록·128파일 페이지는 약 **51ms**에 처리됐다. 일반 로컬 파일 후보의
메타데이터 조회는 약 25ms, 이전 문맥을 포함한 경로 후보 파싱은 약 26ms였다.
따라서 잘못 해석한 UNC 파일 조회가 큰 서버 지연을 만드는 유력한 경로다.

별도로, 상태는 약 1.6초 간격(응답 시간 추가), 대화는 최소 3초 간격으로 다시 조회하며
변경이 없어도 최근 400블록을 전송한다. ProjectWitch를 20블록으로 읽으면 약 78KB로
줄어들었다. 설치본은 변경 시 대화 DOM을 통째로 교체하고 접힌 도구 출력도 생성한다.
개발 소스의 DOM 유지 개선 이후에도 큰 대화 페이지 반복 전송과 파일 조회 비용은 남는다.

외부 `/login`은 측정 위치에서 약 90~500ms에 응답했고 Cloudflare Brotli 압축이 확인됐다.
인증된 외부 대화 API의 실제 압축 전송량과 사용자의 외부 기기·회선은 측정하지 않았으므로,
로컬 JSON 크기를 실제 회선 전송량으로 단정하지 않는다. 우선 개선 후보는 잘못된 경로
후보 제거·산출물 조회의 응답 지연 분리·변경분 조회·작은 첫 페이지와 이전 기록 추가 로딩이다.
이번 요청에서는 Remote 성능 코드를 수정하지 않고 원인 조사 결과만 기록했다.

[^workspace-ui]: Provider logos, Screen colors and retained conversation nodes
[^workspace-api]: Shared workspace API
[^workspace-tests]: Dashboard and Remote endpoint validation
[^workspace-smoke]: Isolated Remote workspace runtime verification
