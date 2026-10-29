---
type: Release
title: Acedia 1.8.1.98
status: preparing
last_updated: 2026-10-29
---

# Acedia 1.8.1.98

- 우측 Pixel Office는 왼쪽 Active와 같은 활성 세션 기준을 사용하며, 필요한 부모·상위 부모를 함께 표시한다. Sleeping·종료·미시작 자식과 활성 자손이 없는 비활성 가지는 제외한다.
- 우측은 모든 프로젝트의 활성 세션을 기본으로 보여준다. 프로젝트 선택·현재 프로젝트 따라가기는 유지하며, 검색으로 비활성 자식을 다시 표시하지 않는다. 활성 자식을 검색할 때도 필요한 부모는 남긴다.
- 세션이 종료되거나 다시 활성화되면 표시 항목을 즉시 다시 계산한다. 직급은 전체 관계를 기준으로 유지하고, 선택만으로 세션을 시작하지 않는다. Project Board의 전체·활성 팀 보기는 유지한다.

Standard EXE 업데이트다. 기존 서명 검증 Android **1.8.1.39/code 21**을 재사용한다.

## English

- The right Pixel Office now uses the same active-session predicate as the left Active list and retains required parents and ancestors. Hide sleeping, stopped and unstarted children and inactive branches with no active descendants.
- Show active sessions across all projects by default in the dock. Keep project selection and Follow current project. Search cannot reveal inactive children and keeps the parents of matching active sessions.
- Recompute the projection when sessions stop or become active. Preserve roles from the full hierarchy and selection-only behavior. Keep Project Board's All and Active teams views unchanged.

This Standard EXE reuses the existing signed Android **1.8.1.39/code 21** artifact.

## 검증

- 전체 **213개 파일·1,696개 검사**를 통과했다. `output/exe-release-1.8.1.98/tests-direct.log`.
- 개발 의존성을 포함한 npm audit 취약점 **0개**. `output/exe-release-1.8.1.98/audit-all-direct.log`.
- 격리된 실제 App의 16부서·117세션에서 우측의 활성 세션 16개와 필요한 상위 세션을 합친 **45개 ID**가 왼쪽 Active 목록과 일치했다. 비활성 자식 검색 제외, 검색한 활성 자식의 부모 유지, 종료 시 가지 제거와 다른 자식 활성화 시 부모 재표시를 검증했다. 기본 전체 프로젝트·현재 프로젝트 따라가기·낮은 창 높이·포인터/키보드 이동·메모·선택 시 자동 시작 없음도 통과했다. `output/pixel-office-active-dock/electron.log`, `active-comparison.json`, 화면 PNG.
- 큰 Project Board의 전체 117세션 보기, 이미지 캐시·4fps·모션 감소·숨김 정지·해제 시 정리도 통과했다. 실제 사용자 프로필·세션·창 포커스를 사용하지 않았다.
- 신규 세션 UI 18개 배치·조직도·세션 사용량·터미널 링크·native PTY 검사를 통과했다. 원격 PWA와 로컬 Dashboard는 각각 1280/390px 및 320/360/390/430px 모바일 화면에서도 기존 대화·큐·파일 동작을 통과했다. Office 검증과 합쳐 7개 실행 기록은 `output/exe-release-1.8.1.98/followup-checks-direct.json`에 있다.

빌드·설치 파일·공개 다운로드 결과는 검증 후 아래 게시 기록과 함께 갱신한다.

## 배포 기록

게시 전이다. Microsoft Store·Company·새 APK 빌드와 사용자 앱의 설치·재시작은 이번 범위에 포함하지 않는다.
