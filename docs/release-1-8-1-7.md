---
type: Release
title: Acedia 1.8.1.7
description: Central Codex usage collection, session path search and workspace fixes.
status: stable
sources:
  - resource: ../app/package.json
  - resource: central-usage-collector.md
  - resource: usage-server-operations.md
---

# Acedia 1.8.1.7

## 변경 사항

- 설정에 중앙 사용량 수집기를 내장하고 독립 CLI 수집기와 서버 실행 패키지를 추가했습니다. Codex 요청별 토큰, 모델·effort·명시된 Fast 설정, 스킬 읽기 요청, Windows 사용자·PC 정보를 수집합니다.
- 서버에서 공용 계정을 등록하고 계정·직원별 사용량, 남은 계정 한도, 일별·주별·월별 분석과 페이지별 기록을 확인합니다. 계정과 직원 상세는 중앙에 표시하며 테마를 선택할 수 있습니다.
- 이미지가 포함된 대용량 세션 로그의 수집 정지를 수정했습니다. 한 줄 상한은 64MiB입니다.
- 세션 검색에 프로젝트·세션 작업 경로와 원격 경로를 포함했습니다. 대소문자와 슬래시 방향에 관계없이 일부 경로로 검색할 수 있습니다.
- 탭 분할 시 패널 식별자를 유지하고 브라우저 위치 변경을 추적합니다. 탭 드래그 중 UI 텍스트 선택을 억제합니다.
- Windows 에이전트 CLI 종료 시 전용 셸도 종료하여 종료 상태를 알리고, 재시작 시 스크롤 기록을 보존합니다.

## 범위와 검증

- 전체 자동 테스트 696개, 수집기 UI, 세션 종료, EXE 빌드, packaged bridge 및 lifecycle smoke 통과. OKF 문서 검증 오류·경고 0개.
- Codex 수집을 검증했습니다. Claude와 일반 채팅 자동 수집은 검증·납품 범위에서 제외합니다.
- 직원별 토큰 비율은 수집된 계정 토큰 대비 비율이며 공급자 구독 한도의 개인별 소진율이 아닙니다. 누락된 Fast 설정은 미확인으로 표시합니다.
- 대화 본문·코드·로그인 비밀은 서버로 전송하지 않습니다. 서버 DB 및 운영 인증 정보는 배포에 포함하지 않습니다.
- 설치 파일 FileVersion은 1.8.1.7이며 Authenticode 상태는 NotSigned입니다.
- Standard EXE 채널 배포입니다. 기존 검증된 모바일 APK를 재사용하며 Store 제출은 수행하지 않습니다.
- 실제 사용자 환경의 탭 드래그 증상과 설치 후 사용성은 별도 확인이 필요합니다.
