---
type: Release
title: Acedia 1.8.1.97
status: published
last_updated: 2026-10-29
---

# Acedia 1.8.1.97

- Pixel Office를 하나의 연속된 공유 사무실로 바꿨다. 프로젝트 팀은 부서 이름과 은은한 바닥색으로 구분하며 같은 바닥·열린 통로를 공유한다. 방 카드 높이 때문에 다른 팀의 벽이 직원을 덮던 문제를 해결했다.
- 전체 보기와 부서 바로 이동, 휠·버튼 확대, 바닥 드래그·가운데 버튼·화살표 이동을 지원한다. `0`으로 전체 보기에 돌아가며, Tab으로 화면 밖 직원을 선택하면 해당 자리로 이동한다.
- 캔버스와 직원 선택 영역의 좌표를 맞추고 native 스크롤로 생기는 어긋남을 막았다. 필터에 맞는 모든 직원을 페이지 제한 없이 키보드로 선택할 수 있다. 작은 전체 보기에서는 조직을 살펴보고 부서 이동·100% 확대·선택 정보로 이름과 상태를 확인한다.
- 화면 밖 가구·직원 그리기를 생략하고 캔버스를 화면 크기로 제한한다. 실제 상태·직급·부모 관계, 이미지 공유 캐시, 4fps, 숨김 시 중단과 reduced motion 지원을 유지한다.
- 설정이 없는 지원 도구의 신규 일반 세션·프로젝트 첫 세션·workspace MCP/API·작업 분담 하위 Codex는 Dangerous를 기본 ON으로 생성한다. 원격 웹 생성 창도 기본 ON이며 브라우저에 기억한 명시적 OFF와 체크 해제를 유지한다. 명시적 ON/OFF·remember를 존중하고 미지원 도구는 OFF다. 기존 세션·실행 중인 CLI·프로필을 자동 변경하거나 승인·질문에 자동 응답하지 않는다.

Standard EXE 업데이트다. 번들 Android APK는 기존 서명 검증본 **1.8.1.39/code 21**을 재사용한다.

## English

- Replace separate Pixel Office room cards with one continuous shared office. Project teams become named departments with subtle floor colors and open paths, fixing walls overlapping staff in adjacent cards.
- Add Fit all, department navigation, wheel/button zoom, floor or middle-button dragging and arrow-key panning. Press `0` to fit the office; keyboard focus brings offscreen staff into view.
- Align canvas and accessible staff targets under the same transform and prevent native scrolling from shifting their coordinates. Keep all filtered staff keyboard-accessible without pagination. Use department navigation, 100% zoom or selected-staff details to read names in small views.
- Bound the canvas to the viewport and skip offscreen furniture and staff drawing. Preserve live state, reporting-line roles, shared image caching, 4fps, hidden-view pause and reduced motion.
- Default Dangerous to ON for newly created supported-tool sessions, including project first sessions, workspace MCP/API creation and delegated Codex workers, when no permission preference is configured. Remote web creation also starts ON and preserves remembered browser choices and explicit OFF. Preserve explicit ON/OFF/remember settings and creation-dialog overrides; unsupported tools stay OFF. Existing sessions, running CLIs and profiles remain unchanged, with no new automatic approval or question responses.

This Standard EXE reuses the existing signed Android **1.8.1.39/code 21** artifact.

## 검증

- 전체 **213개 파일·1,694개 검사 범위**를 확인했다. 전체 실행에서 1,693개가 통과했고, API가 Dangerous OFF를 강제한다고 가정한 기존 테스트 1개를 새 정책 위임 계약에 맞춰 갱신했다. 해당 파일의 7개 재검사는 모두 통과했다. 제품 코드는 재검사 과정에서 변경하지 않았으며 검사를 생략하지 않았다. `output/exe-release-1.8.1.97/tests-direct.log`, `startup-contract-recheck.log`.
- 개발 의존성을 포함한 npm audit 취약점 **0개**. `output/exe-release-1.8.1.97/audit-all-direct.log`.
- 실제 Electron 조직도·세션 사용량·터미널 링크·Pixel Office·native PTY 검사를 통과했다. 원격 PWA와 로컬 Dashboard는 각각 1280/390px에서 기본 ON·명시적 OFF·브라우저 기억값을 검사했고, 320/360/390/430px 모바일 화면과 기존 대화·큐·모델·파일 동작도 통과했다. `output/exe-release-1.8.1.97/followup-checks-direct.json`.
- 신규·프로젝트 생성 UI의 18개 배치와 실제 main/App의 Dangerous 기본값 검증은 아래 기록을 재사용했다. 해당 코드와 테스트 산출물은 이후 검토에서도 유지했다. 기존 하위 세션의 sandbox 실행 실패는 보존하고 정상 권한 검증 결과와 구분한다.

- 고정 소스에서 TypeScript·Vite·NSIS 설치 파일·blockmap·EXE manifest를 생성했다. `output/exe-release-1.8.1.97/build-direct.log`.
- packaged bridge·내장 Git·문서 브라우저 재사용·Dashboard·보안·종료·트레이 검사를 통과했다. 두 실행의 종료 코드는 0이며, 정리 단계의 기존 native helper `AttachConsole failed` 출력은 기능 assertion 실패와 구분했다. `packaged-direct.log`, `lifecycle-direct.log`.
- FileVersion **1.8.1.97**, ProductVersion **1.8.1**, Authenticode **NotSigned**를 확인했다. 런타임·렌더러 362개와 Pixel Office 자산·라이선스 20개가 고정 소스와 일치한다. `windows-verification.json`, `local-verification.json`.
- 공개 업데이터에서 **1.8.1.96·1.8.1.95 → 1.8.1.97** 감지를 확인하고 설치 파일 전체를 실제 다운로드했다. 세 자산의 공식 URL·크기·SHA-256·최신 안정 릴리스와 소스 태그를 검증했다. `public-verification-direct.log`.

기능 개발 검증은 관련 7개 파일·79개 검사와 TypeScript/Vite build, 격리된 실제 App의 16부서·117직원 검사를 통과했다. 별도 검증은 숨김 창의 CDP focus emulation으로 보드·우측 합계 Tab 40회, Shift+Tab 2회, Enter 2회를 확인했다. 실제 OS 창 활성화나 사용자 세션을 사용하지 않았다. 기존 기록은 `output/pixel-office-shared-floor/`와 `output/pixel-office-shared-floor-review/`에 보관한다.

Dangerous 기본값 변경은 관련 11개 파일·136개 검사, TypeScript와 Vite build를 통과했다.
별도 임시 프로필의 숨김 Electron에서 일반·프로젝트 생성 창의 기본 ON·체크 해제·명시적
ON/OFF·remember·재로딩과 18개 화면 배치를 확인했다. 실제 main/App과 모의 CLI에서
workspace API 프로젝트 첫 세션·추가 세션·작업 세션 factory payload의 저장값과 실행 인수를
설정 없음·ON·OFF·remember OFF/ON·이전 boolean OFF별로 확인했다. 미지원 도구 OFF,
기존 저장 세션·실행 중 CLI·화면·포커스 보존도 검사했다. 작업 payload는 fixture가 전달하며
전체 작업 실행·모델 검증·결과 회수의 실서비스 검사는 이 검증에 포함하지 않는다.
초기 샌드박스 Electron ACL 오류와 fixture 수정 전 실패 기록을 보존하고 승인된 정상 권한에서
재검증했다. 로그와 화면은 `output/dangerous-defaults/`에 있다. 기존 Pixel Office·릴리스 준비
15개 파일의 SHA-256은 작업 전후 일치했다. 이후 직접 검토에서 원격 대시보드 생성 API도
권한 생략 시 coordinator의 기본값을 따르도록 보완했다. 명시적 boolean은 그대로 전달하고
잘못된 자료형은 거부한다. 원격 생성 창은 기본 ON, 브라우저별 명시적 OFF 기억을 지원하며
service worker 캐시를 갱신한다. 추가 HTTP·실제 원격 UI 검증도 통과했으며 위 검증 항목에 기록했다.

## 배포 기록

- 공개 게시: **2026-10-29 13:17:00 KST**. [GitHub Release v1.8.1.97](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.97).
- 공개 다운로드 검증 완료: **2026-10-29 13:17:44 KST**.
- 고정 제품 소스·태그: `cd712e3c705c2d320779666509e792cff7c33152`.
- 기존 서명 검증 APK **1.8.1.39/code 21**을 재사용했다. 새 APK·Store·Company 배포는 실행하지 않았다.
- 현재 설치된 1.8.1.96 앱과 실제 사용자 세션은 교체·재시작하지 않았다. 설정의 **Check → Update**로 설치형 업데이트를 적용한다. 기본 권한 변경은 새로 만드는 세션에 적용되며 기존 명시적 설정과 저장 세션은 유지한다.

| 공개 자산 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Acedia-Setup-1.8.1.97-x64.exe | 156224298 | `a4cf8cb65d5e8da9b1903b853f2cdb53a0509a6015088bfafae8d8126281ce7e` |
| Acedia-Setup-1.8.1.97-x64.exe.blockmap | 163260 | `8e002331f3c0180755dfbbcac9e99c8c795dd84bbe42a192730e87fe3a0451cb` |
| latest-exe.json | 256 | `5518cc1a434bd6116e3063c4ca921e7ca40bb16676d6c9d77878e592e66b12ef` |
