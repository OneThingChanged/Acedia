---
type: Release
title: Acedia 1.8.2.06
status: published
last_updated: 2026-11-06
---

# Acedia 1.8.2.06

- 프로젝트 보드를 전용 새 창으로 연다. 프로젝트별 부모·자식 노드, Sleeping·종료 세션, 진행·응답 필요·검토·완료·중단 상태와 사용자 확인 목록을 표시한다. 노드 더블클릭은 담당 작업창을 재사용하며 꺼진 세션을 자동 실행하지 않는다.
- 보드 창 위치·크기·최대화·확대율·이동·접기 상태와 확인 완료 기록을 저장한다. 새 결과·새 작업 시도는 다시 미확인으로 표시하고, 일반 답변 완료와 작업 분담의 검증 완료를 구분한다. 추가 지시는 해당 Chat 화면에서 작성한다.
- 보드 상단에 프로젝트·세션별 컴퓨터 사용 신호를 표시한다. 데스크톱 조작과 내장 브라우저 작업을 구분하며, 외부 도구는 식별 가능한 hook 신호가 있어야 표시한다. 상태 갱신으로 작업창 포커스를 이동하지 않는다.
- Remote·Dashboard에서 여러 메시지를 예약하면 첫 메시지 이후 입력 준비 거절로 큐가 멈추던 경로를 수정했다. 서버가 이전 전송의 턴과 비어 있는 입력란을 확인한 뒤 다음 메시지를 전송한다. 전송되지 않은 입력 준비 거절은 자동으로 재확인하며 대화 변경·종료·전송 결과 불명확 상태의 중복 전송 방지는 유지한다.
- 계정 기록 저장 실패가 계정 목록·한도·배정 조회까지 계속 막던 문제를 수정했다. 한도 100%인 계정도 표시하고, 공간 부족과 파일 접근 오류를 구분하며 저장 다시 시도로 앱 재시작 없이 복구할 수 있다.
- 기존 서명 APK 1.8.1.39를 재사용한다. 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Open Project Board in its own window, with project/session trees, work states and a persistent human review inbox. Double-click a node to reuse its Acedia workspace without automatically starting an offline session.
- Remember window placement, zoom and collapsed nodes. Display session-bound desktop/browser activity signals without stealing focus; external tools require compatible hook signals.
- Fix Remote and Dashboard queues stopping after their first message. Check the previous accepted turn and the actual empty composer before advancing; preserve unknown-outcome replay protection and existing terminal drafts.
- Keep routing accounts, exhausted quotas and assignments readable after a recoverable write failure. Distinguish storage error types and retry saving without restarting the app.

## 검증

- 전체 229개 파일의 1,843개 테스트와 TypeScript/Vite 빌드를 통과했다. 큐·전송·인증 HTTP 관련 5개 파일의 76개 검사를 포함한다.
- 같은 지연 상태에서 기존 큐 소스는 3개 중 1개 전송 후 2개가 입력 준비 오류로 남았고, 수정 소스는 3개를 순서대로 모두 전송했다. 실제 큐 함수를 Node VM에서 검증했으며 운영 세션에 메시지를 보내지 않았다.
- 보드 창·이동 어댑터, 노드 레이아웃, 서버 렌더링, 확인 상태 저장과 도구 신호를 검증했다. 창 조작·브라우저 UI 자동화는 수행하지 않았다.
- 패키지의 Electron Node 런타임에서 Remote/Dashboard API·첨부·서비스 재시작·번들 Git·native PTY 검사를 통과했다. 새 보드의 Sleeping 자식·확인 기록·소유 창 재사용·실행 명령 제한, 큐 3개 순서·턴 수신·빈 입력란 대기, 라우팅 저장 복구 API와 최초 대화 준비 상태 API를 확인했다.
- ASAR 내 소스·렌더러 파일 382개와 Pixel Office 자산·라이선스 20개가 고정 제품 소스와 일치한다. 빌드용 minimatch는 런타임 패키지에 없으며 기존 서명 APK 1.8.1.39를 포함한다.
- 로컬·공개 설치 파일 모두 NSIS CRC `3d9690e4`, 압축 파일 전체 검사와 설치 전 검증 모드의 실제 시작을 통과했다. 기존 EXE 채널과 같은 미서명(`NotSigned`) 상태다. 사용 중인 앱을 종료하거나 설치를 덮어쓰지 않았다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.06](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.06).
- 게시: **2026-11-06 16:25:12 KST**. 공개 전체 다운로드 검증: **16:26:04 KST**.
- 제품 소스 커밋: `ca9ddb20d1ee3836193acddac3ebbf2d9105a05d`.
- 실제 업데이터에서 **1.8.2.05 / 1.8.2.04 / 1.8.2.03 → 1.8.2.06** 감지를 확인했다. 공개 세 자산의 태그·크기·SHA-256·manifest가 빌드 원본과 일치한다.
- 앱 업데이트·재시작 후 새 기능이 적용된다. Remote/Dashboard는 새로고침하여 PWA 캐시 v108을 사용한다. 배포 과정에서 사용자의 현재 브라우저 큐나 운영 세션은 조작하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.06-x64.exe` | 156262282 | `05fa214c2975dbac6d742ccf6e384fdb945ea2a8663698e473192a7c685abfc6` |
| `Acedia-Setup-1.8.2.06-x64.exe.blockmap` | 163451 | `7fdfb7fed811bd1961958dab5ba8b0df3e44cda2a0cba09f25e49184c14c03c5` |
| `latest-exe.json` | 256 | `4e4ee3368ca1c0c9c165e3da2da08a3a4cebced6c044de6c3e5793f0ca4e7d43` |
