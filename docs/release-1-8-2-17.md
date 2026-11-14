---
type: Release
title: Acedia 1.8.2.17
status: ready
last_updated: 2026-11-14
---

# Acedia 1.8.2.17

- 터미널의 깊은 파일 경로를 검사할 때 발생하는 과도한 정규식 연산을 제거했다. 긴 JSON·동영상 경로가 있는 세션을 선택하거나 링크를 검사할 때 화면이 멈추는 원인을 수정했다.
- 기존 로컬 Codex 세션의 지정 라우팅 계정과 실제 실행 계정을 MCP/API로 조회하고 다음 실행 계정을 저장할 수 있다. 저장만으로 진행 중 작업을 중단하지 않으며, 명시적인 중지·재시작 API로 적용한다.
- 별도 플러그인 없이 선택한 Codex·Claude 계정 홈에 Acedia 사용 스킬을 설치한다. 사용자가 수정한 스킬은 보존하며, 세션·메시지·작업 분담·라우팅·페이지 수집 사용법을 제공한다.
- 읽기 전용 `acedia_connection` 진단으로 실제 호스트 버전, 지원 기능, 스킬 설치 상태와 MCP 도구 목록 차이를 확인한다. CLI 시작 시 연결은 기존 자동 설정을 사용한다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 포함한다.

## English

- Remove exponential regular-expression work when scanning deep terminal paths, fixing renderer stalls caused by long JSON and media paths.
- Inspect and configure the next routed account for existing local Codex sessions through MCP/API. Keep the running task intact until an explicit stop and restart.
- Install built-in Acedia skills into the selected Codex and Claude account homes without a separate plugin. Preserve user-edited files and provide progressive workflow references.
- Add read-only connection diagnostics for the actual host version, supported capabilities, skill status and MCP tool differences.
- Reuse the existing signed APK for the Standard EXE channel.

## 검증

- 전체 Vitest 256개 파일·2068개 테스트가 실패·대기 없이 통과했다. 버전 갱신 전후가 섞였던 설치 파일 이름 검사는 갱신 완료 후 재실행해 통과했다.
- 관련 라우팅·연결·스킬 설치 및 깊은 경로 회귀 검사, 실제 Codex의 격리 홈 스킬 검색, TypeScript/Vite 빌드를 통과했다. 패키지·설치 파일·공개 다운로드는 배포 과정에서 추가 확인한다.
- 실행용 의존성 감사는 취약점 0건이다. 전체 개발 의존성 감사의 6건은 빌드 도구의 minimatch 및 전이 영향이며, 최종 ASAR에 minimatch가 없음을 별도로 검증한다. [보안 권고](https://github.com/advisories/GHSA-g3hv-75wg-m249).
- 실제 PW_관리자 세션의 최근 경로 형태를 대상으로 기존 검사 1초 초과와 새 검사 0.13~0.58ms를 재현했다. 운영 세션의 입력·중단·재시작은 수행하지 않았다.
- 세션 테이블 HTML은 검토용 초안이며 이번 제품 기능에 포함하지 않는다.
