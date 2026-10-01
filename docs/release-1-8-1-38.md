---
type: Release
title: Acedia 1.8.1.38 EXE release
description: Restore automatic queued-message delivery, align Remote filters and improve account refresh and request accounting.
status: stable
last_updated: 2026-10-01
sources:
  - resource: remote-service.md
  - resource: local-dashboard.md
  - resource: account-pool.md
  - resource: usage-accounting.md
  - resource: exe-release-workflow.md
  - resource: ../app/electron/remote-pwa/app.js
  - resource: ../app/electron/services/account-pool.mjs
  - resource: ../app/electron/shared/session-state.mjs
  - resource: ../app/scripts/electron-remote-queue-smoke.mjs
  - resource: ../app/scripts/electron-remote-session-filter-smoke.mjs
---

# Acedia 1.8.1.38

- Remote와 Dashboard에서 세션 활성화의 30초 제한을 작업 대기와 분리했다. CLI가 실행되면 활성화 타이머를 해제하고, 늦게 실행된 경우에도 경고를 자동 해제한다. 작업·질문이 끝나면 대기 메시지를 세션별로 순서대로 전송하며 전송 실패·결과 불명은 수동 재시도로 유지한다.
- Remote 세션 필터를 데스크톱과 같은 **All / Active / Sleeping**으로 정리했다. 실제 PTY와 실행·휴면 정보를 반영하고 전체 개수, 검색 교집합, 선택 저장, URL·Back 복원과 이전 링크 이전을 제공한다.
- 계정 한도 갱신을 **Refresh list** 하나로 통합했다. 로그인한 전체 계정을 조회하며 분산 제외·한도 소진 계정도 포함한다. 최대 두 RPC로 진행 상황을 표시하고 부분 실패 시 이전 조회값을 보존한다.
- 정상 완료 후 연결이 닫혀도 완료 상태를 유지한다. 과거의 완료 여부 미확인 연결 종료를 새 취소와 구분하며 토큰 정보 누락을 사용량 0으로 표시하지 않는다. 계정 배정 기간의 대화 토큰 합계와 요청별 응답 토큰은 별도로 안내한다.
- Remote cache **v81**을 사용한다. Standard EXE·blockmap과 같은 빌드의 `latest-exe.json`을 배포하며 서명 검증된 Android APK **1.8.1.28**을 재사용한다. Android 소스 versionName은 1.8.1.38, versionCode는 20을 유지한다.

검증: **140개 파일·892개 테스트**를 `--testTimeout=15000 --maxWorkers=4`로 통과했다. PTY 실행 검증과 격리 TypeScript/Vite 프로덕션 빌드가 통과했다. 계정 UI, Remote 필터와 대기열의 실제 Electron 화면 검증 범위는 각 기능 문서와 [검증 기록](log.md)에 기록되어 있다.

패키지 bridge/Dashboard 및 lifecycle 검증이 통과했다. 앱 종료·트레이·보안 경로의 성공 마커와 종료 코드 0을 확인했다. 변경된 패키지 소스 10개와 렌더러 파일 5개는 격리 빌드의 파일과 바이트가 일치한다. 기본 작업 폴더와 격리 소스도 줄바꿈을 정규화한 내용이 일치한다. 공유 의존성은 기존 설치를 사용하며 사용자 앱과 세션은 종료하지 않았다.

- 설치 파일: `Acedia-Setup-1.8.1.38-x64.exe`
- 앱·설치 파일 FileVersion: **1.8.1.38**
- 크기: **120425406 bytes**
- SHA-256: `e9b1940cf631762b5c0e23bc485bda93e78a7b8750685da4e4dc215becb737ea`
- 같은 빌드의 `latest-exe.json` 버전·파일명·크기·SHA-256 및 blockmap 생성 확인.
- Authenticode: **NotSigned**. 파일 무결성 검증은 코드 서명을 대신하지 않는다.
- OKF 문서: 오류 0, 기존 날짜 경고 1 (`known-limitations.md`).

실제 상용 계정 한도 조회·상용 응답의 토큰 제공 여부는 모의 응답 검증과 구분한다. 응답에 토큰 정보가 없는 개별 요청의 정확한 사용량은 복원하지 않는다.

[공개 EXE 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.38)는 위 설치 파일·blockmap·manifest를 제공한다. 공개 업데이트 감지와 다운로드 해시는 게시 단계에서 검증하며, 게시 완료와 사용자 PC의 설치 완료는 별도 상태다.
