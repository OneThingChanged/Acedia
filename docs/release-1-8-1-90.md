---
type: Release
title: Acedia 1.8.1.90
status: published
last_updated: 2026-10-22
---

# Acedia 1.8.1.90

- 세션별 **개인 메모**를 추가했다. 세션 상단 메모 아이콘과 사이드바 우클릭에서 열고, 채팅·터미널·분할 화면·Remote·Dashboard에서 같은 메모를 편집한다. 꺼진 세션의 메모도 CLI를 시작하거나 현재 대화를 바꾸지 않고 편집한다.
- 메모는 자동 저장하며 연결 끊김·새로고침에 대비한 초안을 보관한다. 동시 편집 시 저장된 메모와 내 초안을 확인한 뒤 선택한다. 메모는 사용자 프로필에 저장하며 AI 프롬프트·대화·작업 전달에 자동으로 포함하지 않는다. 세션당 UTF-8 64KiB까지 저장한다.
- 데스크톱 사이드바의 **Active** 목록에서 활성 부모 아래의 **Sleeping 자식·하위 자식**을 함께 표시한다. 기존 상태·접기 동작·실제 Active/Sleeping 집계는 유지한다. 부모를 켜도 자식을 자동 실행하지 않으며, 다른 활성 자식의 문맥으로만 표시되는 비활성 부모 아래의 Sleeping 형제는 추가하지 않는다.
- 새 채팅 세션에 보낸 첫 요청이 최초 제공자 대화 ID 연결 시 사라지던 문제를 수정했다. 시작 대기 요청·작성 중 초안·첨부와 전송 잠금을 유지한다. 다른 대화로 요청이 넘어가지 않으며 실패하거나 접수 여부가 불확실한 요청을 자동 재전송하지 않는다.

Standard EXE 업데이트다. 기존 서명 APK **1.8.1.39/code 21**을 재사용한다.

## English

- Add private per-session notes to Desktop Chat, Terminal, split panes, Remote and Dashboard. Open notes from the toolbar or sidebar context menu, including offline sessions without starting a CLI or changing the current conversation.
- Autosave notes with local draft recovery and explicit conflict resolution. Store notes in the user profile, separate from AI prompts, transcripts and task delivery. Each note supports up to 64KiB of UTF-8 text.
- Show Sleeping descendants beneath active parents in the desktop Active sidebar. Preserve lifecycle states, folding and actual filter counts without starting children. Do not reveal unrelated sleeping siblings through an inactive contextual parent.
- Preserve the first queued Chat request, drafts, attachments and submission lock when a new session receives its initial provider conversation ID. Keep existing conversations isolated and uncertain submissions subject to review.

This Standard EXE release reuses the signed Android **1.8.1.39/code 21** artifact.

## 검증

- 배포 버전을 확정한 전체 **205개 파일·1,555개 검사** 통과: `output/exe-90-tests.log`.
- TypeScript와 네이티브 PTY 검사 통과: `output/exe-90-typecheck.log`, `output/exe-90-pty-smoke.log`.
- 실제 Electron의 첫 요청 UI 검사 통과: 시작 대기 요청·초안, 최초 ID 연결·재마운트 후 한 번 전달, 전송 중 연결 잠금·올바른 기록, 알려진 대화 격리와 실패 검토 유지. `output/exe-90-chat-first-smoke.log`.
- 실제 Electron의 세션 메모 검사 통과: 분할 화면·충돌·복사, 꺼진 세션의 선택/실행 불변, 채팅↔터미널 전환과 Remote/Dashboard의 공유 저장·새로고침·1280/390/320px 화면. `output/session-notes-validation/passed.json`.
- 실제 전체 앱의 Active 부모와 Sleeping 자식·하위 자식 표시, 실제 집계 유지, 자동 실행 부재와 비활성 문맥 부모 아래 Sleeping 형제 제외 검사 통과. 기존 사이드바 상호작용·접기·검색·1280/800px 화면 검사 포함. `output/sidebar-active-sleeping-electron.log`.

- 고정 소스의 TypeScript·Vite production build와 Standard NSIS 빌드 통과. 출력은 `app/electron-dist/exe-1.8.1.90`으로 분리했다. 기존 APK의 패키지·arm64 아키텍처·인증서·해시를 재검증했다. `output/exe-90-build.log`, `output/exe-90-build-retry.log`.
- 최초 빌드의 임시 실행기가 `--publish never`를 wrapper와 중복 전달해 자산 생성 뒤 게시 설정 단계에서 실패했다. GitHub 초안·자산이 생성되지 않았음을 확인하고, 같은 제품 소스에서 게시 옵션을 한 번만 전달해 NSIS 빌드를 다시 통과했다. 제품 소스·버전은 변경하지 않았으며, 후속 검증과 게시는 재빌드한 산출물만 사용했다.
- 패키지의 내장 Git 조회·브라우저 bridge·Dashboard·PTY·문서 재사용과 종료·트레이·보안 검사 통과. `output/exe-90-packaged-smoke.log`, `output/exe-90-packaged-lifecycle-smoke.log`. 임시 packaged 실행기의 외부 제한만 45초이며 원래 성공 조건은 유지했다. 이전 릴리스에도 있던 모의 PTY 종료의 `AttachConsole failed` 진단과 Chromium API 경고는 남지만 각 기능의 성공 표식과 종료 코드 0을 확인했다.
- 메모 서비스·공통 편집기·웹 자산을 포함한 패키지 런타임·렌더러 **334개 파일**이 고정 빌드 소스와 일치했다. 설치 파일 FileVersion **1.8.1.90**, ProductVersion **1.8.1**, 크기·SHA-256이 같은 빌드 manifest와 일치하며 Authenticode는 **NotSigned**다. `output/exe-release-1.8.1.90/local-verification.json`, `output/exe-release-1.8.1.90/windows-verification.json`.
- 공개 GitHub에서 **1.8.1.89·1.8.1.88 → 1.8.1.90** 업데이트 감지를 확인했다. 실제 업데이터로 EXE 전체를 다운로드하고 세 자산의 크기·SHA-256·공식 URL·태그·소스 커밋·최신 안정 릴리스를 검증했다. `output/exe-90-public-verify.log`, `.build-tools/public-verified-1.8.1.90.json`.

## 배포 기록

- 공개 게시: **2026-10-22 18:21:47 KST**. [GitHub Release v1.8.1.90](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.90).
- 고정 소스·태그: `1641890b9ab7d7cbc018d15b356947b81ca6b1c7`.
- 공개 다운로드 검증 완료: **2026-10-22 18:22:33 KST**.
- 소스 제품 버전·Android 소스 versionName: **1.8.1.90**. npm 호환 버전: **1.8.1**.
- 기존 서명 APK **1.8.1.39/code 21** 재사용. 새 APK·Company·Microsoft Store 배포는 실행하지 않았다.

| 공개 자산 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Acedia-Setup-1.8.1.90-x64.exe | 151451276 | `69db052114ff2b648f9af301983553e8008aaefc412fb6c64b7f45c4c2eeee34` |
| Acedia-Setup-1.8.1.90-x64.exe.blockmap | 159323 | `a37eae7d24f245628d6ea009911512d595dc1f8d733ac29f22f7db696ba9b8bc` |
| latest-exe.json | 256 | `d979778763257bc85145aac7675639957c42befbae4724c947acec3b098f96b9` |

설정의 **Check → Update** 또는 다음 앱 실행의 업데이트 안내로 적용한다. 이 배포에서는 설치 프로그램을 실행하거나 실제 사용자 세션에 시험 작업을 전달하지 않았다. 공개 게시와 사용자 PC의 설치 완료는 별개다.
