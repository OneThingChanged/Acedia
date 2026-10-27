---
type: Release
title: Acedia 1.8.1.96
status: prepared
last_updated: 2026-10-27
---

# Acedia 1.8.1.96

- 한글 원문을 UTF-8 수신함에 저장하는 `acedia_session_message_send` / `acedia_session_message_receive`를 추가했다. 터미널에는 ASCII 알림만 보내며, 원문·파일·Base64 입력, SHA-256 대조, 읽음 확인·답장·재시작 후 중복 방지를 지원한다. Windows PowerShell 등의 잘못된 UTF-8 JSON 요청은 깨진 글자로 전달하지 않고 거부한다.
- 조직도 API에서 기존 세션 이름 변경과 부모 지정·변경·해제를 한 번에 저장한다. 새 자식은 전용 작업 폴더와 시작 여부를 지정할 수 있고, 기존 세션을 창 활성화 없이 종료한 뒤 이동·재개할 수 있다. 대화·모델·effort·Fast·계정·권한 설정을 유지한다.
- 자식 세션의 전용 폴더를 좌측 설명과 우측 파일·Git 패널에 반영한다. 형제 전환 시 폴더별 캐시를 분리하며, 프로젝트 밖 파일의 문서 탭과 Git 이력, 세션 폴더 고정·복원과 하위 작업 폴더의 Git 경로를 보완했다.
- Active 사이드바에서 휴면·정지 자식은 기본으로 숨기고, 부모 우클릭의 표시·숨기기 선택을 저장한다. 실행 중인 자식과 필요한 부모 경로는 유지하며 전체·휴면 탭과 검색에서는 계속 찾을 수 있다.
- Project Board와 우측 사이드바에 Pixel Office를 추가했다. 프로젝트 폴더별 팀과 실제 부모·자식 관계의 팀장·중간 관리자·직원을 표시한다. 동일 폴더 중복 등록은 한 팀으로 보이며, 상태 연동·이미지 캐시·화면 밖 애니메이션 중단을 지원한다. Pixel Agents의 MIT 자산과 라이선스를 포함했다.
- API로 만든 로컬 Codex 세션의 프로젝트 안 `Trust and continue`를 별도 프로젝트 옵션 없이 자동 확인한다. 창 활성화 없이 실제 확인 화면·작업 폴더·Git 신뢰 루트를 검사하며, 명령 승인·로그인·사용자 질문은 자동 응답하지 않는다.

새 MCP 도구는 업데이트 후 **보내는 세션과 받는 세션의 CLI를 다시 시작**해야 나타난다. 메시지 자동 알림은 실행 중인 로컬 Codex에 지원하며, 다른 제공자와 OFFLINE 대상은 `notify: false` 수신함을 사용한다. 저장·알림 시작·원문 읽음은 작업 완료와 구분한다.

Standard EXE 업데이트다. 번들 Android APK는 기존 서명 검증본 **1.8.1.39/code 21**을 재사용한다.

## English

- Add durable UTF-8 session messaging with ASCII-only terminal notifications, original text/file/Base64 input, SHA-256 checks, read receipts, replies and replay protection across restarts. Reject malformed UTF-8 JSON instead of delivering replacement characters.
- Expose atomic session rename/reparent APIs, explicit child working folders, standby creation and background stop/move/resume while preserving conversation and launch settings.
- Follow each session's working folder in sidebar labels, files, Git and rooted document/history tabs. Separate folder caches, preserve pinned session roots and fix Git paths for repository subfolders.
- Hide inactive children under Active by default, with a saved per-parent context-menu toggle. Keep active descendants and their ancestor chain visible.
- Add Pixel Office to Project Board and the right sidebar, with folder-based teams, actual reporting-line roles, cached Pixel Agents assets and paused hidden animations. Include MIT licensing and attribution.
- Automatically confirm native folder trust for API-created local Codex sessions only within the registered project, without activating windows or approving commands, logins or questions.

Restart both sender and receiver CLIs after updating to discover the new MCP tools. Automatic notification currently supports active local Codex sessions; other providers and offline sessions support inbox-only delivery with `notify: false`. Storage, notification start, body read and work completion are separate states.

This Standard EXE reuses the existing signed Android **1.8.1.39/code 21** artifact.

## 검증

- PC 전체 **213개 파일·1,675개 검사** 통과. `output/exe-96-tests.log`.
- PC 의존성 보안 검사 취약점 **0개**. `output/exe-96-audit.log`.
- 네 자리 제품 버전과 EXE 업데이터 관련 **18개 검사** 통과. 실제 Electron의 세션·프로젝트 생성 상호작용과 **18개 화면 조합**, 조직도·드래그·폴더 이동·복원·동기화, 세션 사용량과 터미널 링크·native PTY 검사를 통과했다. `output/exe-96-version-checks.log`, `output/exe-96-electron-*.log`.
- 메시지·직접 전달·PTY·HTTP 경계 관련 **93개 검사**, 격리 Electron main의 UTF-8 원문·읽음·답장 저장과 창 포커스 보존 검사를 통과했다. Windows PowerShell 문자열 요청의 잘못된 바이트는 400, UTF-8 바이트 요청은 200과 본문 해시 일치를 확인했다.
- 실제 Codex와 loopback 응답 fixture에서 새 ASCII 알림의 턴 시작, 원문 수신·한글 답장·재시작 후 중복 방지를 대조했다. 기존 Unicode 직접 전달도 통과했다. native 검사는 기능 assertion과 종료 코드 0을 확인했으며, 정리 단계의 기존 `AttachConsole failed` helper 출력과 구분했다.
- 자식 폴더 관련 **113개 검사**, 실제 App의 다른 드라이브 문서·형제 캐시·핀 복원·지연 응답과 Git cwd 검사를 통과했다. 조직도 API 관련 **144개 검사**, 실제 main/coordinator의 이름·부모 변경·대기 생성·종료·이동·재개·포커스 보존 검사를 통과했다.
- Pixel Office 관련 검사와 실제 App의 팀장 배치·직급·필터·두 위치 전환·이미지 캐시·숨김 중단 검사를 통과했다. API 생성 폴더 신뢰는 격리된 실제 Codex와 Electron main/coordinator에서 확인했다. 사용자 세션에는 테스트 작업을 보내지 않았다.

## 배포 기록

소스 고정·EXE 빌드와 패키지 검증·GitHub 게시를 진행 중이다. 공개 게시 및 다운로드 검증 결과는 완료 후 기록한다. 이 절차는 사용 중인 설치 앱을 교체하거나 세션을 재시작하지 않는다.
