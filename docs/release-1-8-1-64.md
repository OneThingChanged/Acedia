---
type: Release
title: Acedia 1.8.1.64
description: "Chat 파일 링크·이미지 미리보기·작업 상태 표시 수정과 사용량 수집기 회귀 검사 보완."
status: draft
last_updated: 2026-10-08
---

# Acedia 1.8.1.64

## 변경 내용

- Chat 모드에서 `/G:/...` 형태의 Windows 파일 링크, 공백·한글·퍼센트가 포함된 경로와 줄 번호 링크가 올바른 파일을 열도록 수정했다. 일반 본문에 적힌 파일 경로도 클릭할 수 있으며 코드 블록의 소스는 유지한다.
- 이미지 경로·Markdown 이미지와 Codex/Claude의 사용자 첨부 이미지를 채팅 안에서 미리보기로 표시한다. 기존 대화의 첨부도 원본 기록에서 필요할 때 읽으며, 이미지를 누르면 확대·축소·이동·복사를 지원하는 뷰어가 열린다.
- 입력창 위에 현재 작업과 경과 시간·중지 버튼을 표시한다. 스크롤 중에도 상태가 보이며, CLI 기록과 Hooks 상태를 함께 확인해 새 작업 시작·도구 실행·완료를 반영한다.
- Windows 사용량 수집기 배포 검사의 대기·전송·종료 확인을 보완했다. 감시기의 계정 조회와 다음 수집 주기를 기다리며 서버 수신 결과를 확인한다.

사용 방법: [워크스페이스 동작](workspace-interactions.md).
수집기 검사 원인과 조치: [사용량 수집기](central-usage-collector.md).
기존 서명 APK 1.8.1.39/code 21을 포함하는 EXE 업데이트다.

## English

- Fix Windows file links in Chat, including `/G:/...` links, spaces, Korean names, literal percent signs and line anchors. Make file paths in ordinary message text clickable while preserving fenced source code.
- Preview image paths, Markdown images and native Codex/Claude user attachments inline. Recover existing attachments from their source records on demand, and open the image viewer with zoom, pan and copy controls.
- Keep the current action, elapsed time and Stop control visible above the composer. Combine transcript lifecycle events and hook state to reflect new work, tool activity and completion.
- Make the Windows usage-client distribution regression wait for fresh server receipt and actual watcher shutdown, allowing for the startup account probe and collection interval.
- Reuse the signed mobile APK 1.8.1.39.

## 검증

- 전체 **177개 파일·1,188개 검사**와 Chat/path/store/IPC 집중 검사 73건을 통과했다.
- 버전 갱신 후 모바일 메타데이터·연결 검사 24건, 릴리스 메타데이터 검사 15건과 native PTY·터미널 링크 실행 검증을 통과했다.
- 실제 Electron에서 파일 링크 대상, 이미지 미리보기·뷰어, 작업 시작·완료·새 작업의 경과 시간, 중지 동작과 다크·라이트·420/1280px 배치를 확인했다. 기존 Chat 시작 질문 및 Remote 1024/390px 검사도 통과했다. 파일 선택과 클립보드 전달은 fixture로 검증했다.
- TypeScript·Vite 빌드를 통과했다. EXE 패키지·공개 업데이트 검증 결과는 배포 후 이 문서에 기록한다.
