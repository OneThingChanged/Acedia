---
type: Release
title: Acedia 1.8.2.17
status: published
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
- 관련 라우팅·연결·스킬 설치 및 깊은 경로 회귀 검사, 실제 Codex의 격리 홈 스킬 검색, TypeScript/Vite 빌드를 통과했다. 패키지·설치 파일·공개 다운로드 검증도 통과했다.
- 실행용 의존성 감사는 취약점 0건이다. 전체 개발 의존성 감사의 6건은 빌드 도구의 minimatch 및 전이 영향이며, 최종 ASAR에 minimatch가 없음을 별도로 검증했다. [보안 권고](https://github.com/advisories/GHSA-g3hv-75wg-m249).
- 실제 PW_관리자 세션의 최근 경로 형태를 대상으로 기존 검사 1초 초과와 새 검사 0.13~0.58ms를 재현했다. 운영 세션의 입력·중단·재시작은 수행하지 않았다.
- 세션 테이블 HTML은 검토용 초안이며 이번 제품 기능에 포함하지 않는다.


## 패키지 검증

- 제품 소스 `1359455fa43a4f16ea8691b15b974747298dc5a0`를 별도 작업 폴더에 고정하고 독립 복사한 의존성으로 빌드했다. ASAR 런타임·렌더러 424개 파일과 Pixel Office 자산·라이선스 20개, 정본 라이선스·제3자 고지를 원본과 대조했다.
- 패키지의 Electron Node 런타임에서 인증된 라우팅 HTTP, 저장 후 다음 실행 계정 변경·자동 배정 복귀, 실제 실행 계정 유지, 양쪽 제공자 홈에 네 스킬 설치·사용자 수정 보존, 읽기 전용 진단 도우미를 확인했다. 창 활성화나 운영 세션 재시작은 수행하지 않았다.
- 패키지의 깊은 경로 4,096단계 검사와 복수 링크·한글·줄/열 위치 검사는 0.37ms에 통과했다. 실제 설치 후 PW_관리자 화면 전환은 사용자의 업데이트 적용 후 확인할 항목이다.
- Remote·Dashboard 인증·공통 UX·첨부·부모 자식·대화 큐, 보드 종료·재열기 어댑터와 native PTY 검증도 통과했다. GUI 자동화는 수행하지 않았다.
- 빌드 첫 시도의 Windows PowerShell 압축 해제 모듈 호환 오류는 해당 빌드 프로세스의 PSModulePath를 시스템 모듈로 한정해 해결했다. 제품 소스를 바꾸거나 버전을 추가 증가시키지 않았다.
- 로컬·공개 EXE의 NSIS CRC `ba9d001e`, 내부 압축 데이터 전체, 설치 전 검증 모드가 통과했다. Authenticode 상태는 `NotSigned`다. 실제 설치나 사용 중인 앱 종료는 수행하지 않았다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.17](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.17).
- 게시: **2026-11-14 18:06:02 KST**. 공개 전체 다운로드 검증: **2026-11-14 18:06:52 KST**.
- **`1.8.2.16` / `1.8.2.15` → 1.8.2.17** 감지를 실제 업데이터로 확인했다. 태그·manifest·EXE·blockmap의 버전·크기·SHA-256이 빌드 원본과 일치한다.
- 앱 업데이트 후 CLI를 다시 시작하면 새 MCP 도구·스킬을 검색한다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포는 수행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.17-x64.exe` | 156357639 | `37afa32843d6cb2deffb1d35cb1362c8620de7d59fefc001ac1ebbb46672bb5e` |
| `Acedia-Setup-1.8.2.17-x64.exe.blockmap` | 163453 | `79eed2610b1e76dce371e1a86b1bf570c5cefff387b0a27e78a94d38422ab386` |
| `latest-exe.json` | 256 | `30ceff3bdb485ce65dc7bcd479fd4d19a19377dafcb8c99c3e7335145a65a9b9` |
