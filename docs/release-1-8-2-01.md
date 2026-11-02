---
type: Release
title: Acedia 1.8.2.01
status: published
last_updated: 2026-11-02
---

# Acedia 1.8.2.01

- Remote 대화 조회를 세션별로 하나씩 처리한다. 느린 응답을 다음 상태 조회가 무효화해 본문이 계속 비어 있던 문제를 수정했다. 세션을 바꾸면 이전 요청을 취소하고, 최신 대화·파일 정보 갱신은 한 번의 후속 조회로 합친다.
- 최근 대화는 준비된 텍스트를 먼저 반환하고 파일 메타데이터 확인은 최대 150ms만 기다린다. 늦은 파일 카드는 기존 읽기를 재사용해 제한된 후속 조회로 보충한다. 중첩된 도구 JSON을 해독해 이스케이프된 줄바꿈을 UNC 네트워크 경로로 오인하지 않는다.
- Remote의 Owner에 이메일·프로필 URL을 저장하지 못하도록 검증하고 GitHub 아이디 안내를 추가했다. 프로젝트 밖으로 내보낸 파일은 기존 소유자 권한으로 열며 일반 승인 사용자의 접근 범위는 유지한다.
- Remote·Dashboard 왼쪽 목록을 프로젝트 아래 부모·자식·손자 세션 트리로 표시한다. 접기 상태를 기억하고, 검색·직접 링크는 필요한 부모 경로를 펼친다. Active에서 필요한 부모를 유지하며 휴면 자식 표시 설정을 따른다.
- 세로 영상의 재생·탐색 컨트롤이 미리보기 아래로 잘리지 않도록 실제 본문 영역에 맞춘다. PC·휴대폰 가로/세로·태블릿에서 영상 비율을 유지한다.
- Claude의 계정 단위 `limits[]` 응답과 기존 응답을 함께 지원한다. 서버가 5시간 한도를 제공하지 않으면 주간 사용량으로 표시하고, 미검증 Ultra 계정의 임시 한도와 모델별 주간 한도는 유지한다. [Ultra 공식 안내](https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan).
- Remote 정적 캐시는 v105로 갱신한다. 기존 서명 APK 1.8.1.39를 재사용하며 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Keep slow chat responses usable with one in-flight read per session, cancellation on session changes, and coalesced explicit refreshes.
- Return conversation text before slow file metadata; reuse background checks and refresh file cards separately. Decode tool envelopes before extracting paths to avoid spurious UNC probes.
- Validate Remote owner usernames and explain external export access. Show project session families with persistent folds, ancestor-aware filtering and search.
- Fit portrait video controls inside the preview. Support Claude's structured account windows and weekly-only Ultra responses while retaining real temporary and model limits.

## 검증

- 전체 218개 파일·1,753개 테스트, TypeScript/Vite 빌드 통과.
- 실제 Electron 설정 검색·사용량·세로 영상·Remote 세션 트리·신규 세션 UI와 native PTY 검증 통과. 영상은 20개 화면 조건, 세션 트리는 Remote/Dashboard와 PC·휴대폰·태블릿 6개 조건을 검사했다.
- 4.5초 응답 지연 및 모바일 CPU 감속 환경에서 최근 대화가 표시되고 중복 조회가 기존 응답을 버리지 않음을 검증했다. 늦은 파일 정보도 본문 표시 후 보충됐다.
- 실제 대화의 읽기 전용 격리 측정에서 Cascader 조회 경로는 약 2.8초에서 91ms로 줄었다. 네트워크·장치에 따른 전체 로딩 시간과는 별도 수치다.
- 소유자 설정 오류를 재현한 격리 서버에서 외부 PNG의 403 차단과 올바른 소유자 설정 후 200 응답을 확인했다.
- 실행 의존성 취약점 0개. 빌드·개발 도구에는 이전 릴리스와 같은 minimatch 관련 Moderate 15개가 남아 있다. 강제 major override는 적용하지 않으며 배포 ASAR에 해당 모듈이 들어가지 않는지 별도로 검증한다. [공식 보안 권고](https://github.com/advisories/GHSA-g3hv-75wg-m249).

EXE 빌드와 packaged bridge/Dashboard·lifecycle 검사를 통과했다. ASAR 내 소스·렌더러 관련 파일 371개와 Pixel Office 자산·라이선스가 소스와 일치하며 minimatch는 포함되지 않았다. 설치 파일의 Windows FileVersion은 `1.8.2.01`, ProductVersion은 `1.8.2`다. 설치 파일은 기존 EXE 채널과 같은 미서명(`NotSigned`) 상태다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.01](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.01)
- 게시: **2026-11-02 17:58:03 KST**. 공개 다운로드 검증: **17:59:24 KST**.
- 제품 소스 커밋: `ccf7abd36182cd67ce1dc5070f87dc2270a76eb0`.
- 실제 업데이터로 **1.8.2.00 / 1.8.1.99 / 1.8.1.96 → 1.8.2.01** 감지를 확인했다. 공개 EXE 전체와 blockmap·manifest를 내려받아 크기·SHA-256·태그·설치 파일/manifest 일치를 검증했다. 사용자 PC의 설치 프로그램 실행은 이 검증에 포함하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.01-x64.exe` | 156238153 | `365cab51a854767b1bc39aa2fe980789d9d3e016543b6e3f5a6b3a918231b2dd` |
| `Acedia-Setup-1.8.2.01-x64.exe.blockmap` | 163266 | `32d419084c6bfad6881295ed491b8e91a752f7f454475f12cdbee134bc40d7ea` |
| `latest-exe.json` | 256 | `57bf9c52e3401038a0e807612d7b93c2895c414d6d138318adb0af5efdf7d9b0` |
