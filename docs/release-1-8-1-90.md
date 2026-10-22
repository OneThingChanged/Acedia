---
type: Release
title: Acedia 1.8.1.90
status: preparing
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

Standard EXE 빌드·패키지 검증·공개 다운로드 결과는 완료 후 아래에 추가한다.

## 배포 기록

준비 중. 설치 파일 게시와 실제 사용자 PC의 업데이트 설치는 별개다.
