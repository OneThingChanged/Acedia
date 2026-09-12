---
type: Release
title: Acedia 1.8.1.8
description: Worker log panel, automatic collector account switching and session grouping.
status: stable
sources:
  - resource: ../app/src/components/SubagentMonitor.tsx
  - resource: ../app/electron/services/subagent-monitor.mjs
  - resource: usage-server-operations.md
---

# Acedia 1.8.1.8

- Codex 세션의 작업자 버튼으로 직접 하위 작업자의 읽기 전용 로그를 오른쪽 패널에 표시합니다. 작업자 전환, 최신 로그 따라가기, 확인 가능한 모델·effort·턴 상태를 지원합니다.
- 최상단은 탭 영역으로 유지하고 세션 복구·작업자·대화 버튼을 아래 도구 모음 오른쪽에 배치했습니다. 사용자가 데브앱에서 배치를 확인했습니다.
- 수집 폴더의 Codex 로그인 변경 시 서버의 등록된 공용 계정 또는 해당 직원의 개인 계정으로 자동 연결합니다. 신규 로그인은 개인 계정으로 생성하며 이전 기록과 미전송 기록의 귀속을 보존합니다.
- 최근 수집 기록을 명령별·세션별 묶음 또는 개별 요청으로 표시합니다. 기존 로그의 식별자는 이벤트 ID를 유지하며 보완합니다.

## 범위

작업자 화면은 로컬 로그를 읽으며 중앙 서버로 대화 내용을 보내지 않습니다. 직접 입력·중단 제어는 제공하지 않습니다. 최근 로그만 표시하며 누락된 모델·상태는 미확인입니다. 목록 캐시로 최대 15초 지연될 수 있습니다.

계정 전환의 정확한 과거 시각을 알 수 없어 감지 시점 이후 기록부터 새 계정에 배정합니다. 로그아웃과 다른 직원 소유 개인 계정은 자동 수집하지 않습니다. 기록 묶음 합계는 최근 500개 요청 범위이며 전체 세션 합계나 구독 한도 소진율이 아닙니다.

EXE 공개 채널 배포이며 검증된 기존 모바일 APK를 재사용합니다. Store 제출은 포함하지 않습니다.

## 검증

전체 테스트 699개, 작업자·수집기 Electron UI 검사, 최종 EXE 빌드와 packaged bridge/lifecycle 검증을 통과했습니다. 초기 bridge 검사는 20초 제한에 걸렸으며 최종 빌드 재검증은 통과했습니다. 설치 파일 FileVersion은 1.8.1.8, Authenticode 상태는 NotSigned입니다. 공개 파일의 크기·SHA-256과 태그 소스는 게시 단계에서 대조합니다.
