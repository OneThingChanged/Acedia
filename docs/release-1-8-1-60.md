---
type: Release
title: Acedia 1.8.1.60
description: "스크린 해제 메뉴, 브라우저 테마 동기화, Claude 로그인 안내와 프로젝트 생성 설정 자동 관리."
status: stable
last_updated: 2026-10-07
---

# Acedia 1.8.1.60

## 변경 내용

- 왼쪽 SCREENS 항목의 우클릭 메뉴에서 **스크린 해제**를 제공한다. 분할 화면을 개별 화면으로 풀면서 탭·선택 상태·프로젝트·세션 고정을 보존한다.
- 앱 테마 변경이 내장 브라우저의 도구 모음·주소 입력·탭 메뉴·방문 기록·다운로드 화면에도 즉시 적용된다. 열려 있는 웹페이지를 다시 로드하지 않는다.
- Claude의 `Login expired · Please run /login`을 일반 답변 대기로 표시하던 문제를 수정했다. 데스크톱과 Remote에 **Claude 로그인 필요** 및 해당 세션의 터미널을 여는 버튼을 표시한다. 인증은 사용자가 터미널에서 `/login`으로 완료한다.
- 로컬 Claude·Codex·Qwen 세션 시작 시 `.acedia/`에 전용 설정과 관리 목록을 생성한다. Git 로컬 exclude 및 Perforce ignore 규칙을 추가하고, 기존 Acedia 설정이 확인된 파일의 읽기 전용 속성을 해제한다. CLI가 읽는 기존 설정 경로와 사용자 설정은 보존한다.
- 설정 병합 실패 시 임시 파일을 정리하고, 링크·junction을 통한 프로젝트 외부 쓰기를 차단한다.

프로젝트 생성 파일의 관리 범위와 Git·Perforce 동작은
[프로젝트 설정 관리](project-managed-files.md)를 참고한다.

## English

- Add an Ungroup screen action to the SCREENS context menu while preserving tabs, focus, project ownership and session pins.
- Apply app themes immediately to embedded browser controls, history and downloads.
- Show a dedicated Claude authentication prompt and terminal action when login expires on desktop and Remote.
- Manage generated project settings under `.acedia/`, add local Git/Perforce ignores and repair read-only files containing verified Acedia settings while retaining user configuration.
- Preserve existing CLI configuration paths; reuse the signed mobile APK 1.8.1.39.

## 검증

- 전체 **166개 파일·1,123개 검사** 및 TypeScript 검사를 통과했다.
- 설정 관리·터미널 실행 관련 **50개 검사**에서 실제 Windows 읽기 전용 파일 해제, 사용자 설정 보존, Git 중첩 프로젝트·worktree, Perforce 사용자 지정 ignore와 junction 차단을 확인했다.
- 실제 Electron에서 스크린 우클릭 메뉴·해제·레이아웃 복원과 4개 테마의 브라우저 도구 모음·메뉴·방문 기록·다운로드 표시를 확인했다.
- Claude 인증 안내는 데스크톱 및 Remote **1024/390px**에서 로그인 필요 표시·터미널 열기·오류 해제 후 복구를 검증했다. 실제 OAuth 로그인이나 ACL 접근 거부 복구를 검증한 것은 아니다.

- TypeScript/Vite 및 Standard EXE 빌드를 통과했다. 기존 APK **1.8.1.39**의 패키지·아키텍처·서명 인증서를 검증하고 재사용했다.
- native PTY, packaged bridge·Dashboard·내장 Git 및 종료·트레이·보안 lifecycle 검증을 통과했다. Claude 인증 안내의 Electron 데스크톱·Remote 검증도 다시 통과했다.
- `app.asar`의 변경된 runtime 모듈 **6개**가 원본과 일치하며 패키지 버전이 **1.8.1.60**임을 확인했다.
- 설치 파일 FileVersion **1.8.1.60**과 파일명·크기·SHA-256·blockmap·`latest-exe.json` 검증을 통과했다. Authenticode는 기존 EXE 채널과 같은 **NotSigned**다.

## 공개 배포

2026-10-07 **12:38:05 KST**에 [v1.8.1.60](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.60)을 최신 안정 EXE 릴리스로 게시했다. 제품 태그와 릴리스 대상은 검증한 소스 `7d4b832dac651974ab7a6d2a4b69da0995373ac4`다.

| 공개 자산 | 크기 (bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.60-x64.exe` | 151,279,432 | `f07d9ce71467a4ed5717fca2f7dd982f50e0c965f8a2e5fe8fb8aff8ad204684` |
| `Acedia-Setup-1.8.1.60-x64.exe.blockmap` | 159,426 | `1c79701a28d9c88f0c76039fb00e182bb9780f3e40df2273e2ae94f11b1ee4fd` |
| `latest-exe.json` | 256 | `1ca2d1b5a807ff28c9592fe06140f6cd3effaaccd2f0ec3967e7194a8e93b906` |

**12:38:34 KST**에 프로덕션 업데이터의 **1.8.1.58·1.8.1.59 → 1.8.1.60 감지**와 공개 EXE 다운로드·설치 전 해시 검증을 완료했다. 세 자산의 크기·SHA-256과 소스 태그, 최신 안정 릴리스 및 번들 APK 버전 **1.8.1.39**가 일치했다.

실행 중인 사용자 앱의 설치·종료·재시작은 수행하지 않았다. Microsoft Store와 새 APK 배포는 수행하지 않았다.
