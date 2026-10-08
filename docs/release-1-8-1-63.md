---
type: Release
title: Acedia 1.8.1.63
description: "사이드바·채팅 UX 개선, Quick Open·알림 통합과 Chat 모드 Codex 시작 질문 표시."
status: candidate
last_updated: 2026-10-08
---

# Acedia 1.8.1.63

## 변경 내용

- 사이드바를 새 대화·전체 대화·브라우저·프로젝트 보드와 프로젝트·최근 대화 중심으로 정리했다. 실제 Acedia 아이콘을 사용하고 상단바의 중복 로고·접기 버튼과 사이드바 하단 계정·라우팅·설정 표시를 제거했다. 설정은 우측 상단에서 연다.
- 사이드바 헤더에 알림·검색 아이콘을 배치했다. 알림은 기존 알림 센터와 읽지 않은 개수를 표시하고, 검색은 기존 Quick Open과 같은 단축키·기능을 사용한다.
- 최근 대화는 마지막으로 연 순서와 날짜별로 표시하며 고정·이름순·전체/활성/휴면 필터를 제공한다. 프로젝트를 접어도 최근 대화가 보이고, 보관한 대화는 하단에서 복원한다. 보관은 기록이나 실행 중인 세션을 종료하지 않는다. 분할 화면은 별도 영역에서 이름 변경·해제하며 사이드바 폭과 접기 상태를 저장한다.
- 채팅 본문과 입력창을 같은 폭의 중앙 열로 정리했다. 사용자 메시지는 우측 말풍선, 답변은 카드 테두리 없이 표시하고 도구·추론 세부 내용은 펼쳐서 확인한다. 프로젝트·연결 정보와 실제 제공자를 입력창에 표시하며 파일·이미지 첨부, 전송·대기열·중지 기능을 유지한다.
- 메시지·답변·코드 블록에 복사 아이콘과 성공·실패 안내를 추가했다. 코드 복사는 원본 코드만, 답변 복사는 도구 실행 내역을 제외한 본문을 복사한다. Enter는 전송하고 Shift+Enter와 Ctrl/Cmd+Enter는 줄바꿈한다.
- Chat 모드에서도 Codex의 폴더 신뢰·Hooks 검토 질문을 표시한다. 현재 터미널 화면의 질문과 선택을 확인해 사용자가 누른 항목을 전달한다. 질문이 바뀌거나 실행이 끊기면 응답을 중단하며, 시작 질문에 대한 선택을 기다리는 동안 대기열 전송을 보류한다. Hooks 상세 검토는 터미널에서 이어간다.

사용 방법: [워크스페이스 동작](workspace-interactions.md).
기존 서명 APK 1.8.1.39/code 21을 포함하는 EXE 업데이트다.

## English

- Reorganize the sidebar around conversations and projects, using the Acedia icon. Remove duplicate titlebar navigation and sidebar account/routing/settings controls.
- Place notifications and search in the sidebar header. Search opens the existing Quick Open with the same configured shortcut.
- Add visit-based recent ordering, date groups, pins, archived-conversation restoration and All/Active/Sleeping filters. Keep recent conversations visible when project folders collapse; persist sidebar width and view preferences.
- Align desktop chat and its composer in a centered reading column. Use right-aligned user bubbles, open assistant text and expandable tool/reasoning details. Retain attachments, queued messages and stop controls.
- Add message, response and fenced-code copying with result feedback. Shift+Enter and Ctrl/Cmd+Enter insert newlines; Enter sends.
- Show live Codex folder-trust and hook-review startup questions in Chat. Send only the user's selected option after checking the current terminal question and selection; hold queued messages while a startup answer is needed.
- Reuse the signed mobile APK 1.8.1.39; no Microsoft Store submission or new APK build.

## 검증

- 전체 **174개 파일·1,167개 검사**, 모바일 메타데이터·연결 검사 24건과 native PTY 실행 검증을 통과했다.
- 사이드바의 실제 Electron 동작·저장·복원과 800/1280/1440px 및 다크·라이트 테마를 확인했다. 기존 워크스페이스 배치·세션 구성 검사도 통과했다.
- 데스크톱 채팅 420/800/1280px에서 본문·입력창 정렬, 테마, 코드·답변 복사, 실패 안내, 파일·이미지 첨부, 줄바꿈, 전송·대기열·중지와 Claude 인증 전 전송 방지를 확인했다. 복사·파일 선택은 fixture로 검증했으며 OS 클립보드 붙여넣기는 별도다.
- Chat에서 최초 터미널 실행·연결과 폴더 신뢰·Hooks 질문, 선택 변경, 중복 클릭, 질문 변경 시 전송 중단, 500px 줄바꿈, 모드 전환 시 PTY·입력 초안 유지를 확인했다. Remote 질문의 1024/390px 검사도 통과했다. 실제 사용자의 폴더·Hooks 신뢰 승인은 실행하지 않았다.
- TypeScript·Vite 빌드는 채팅 UX 변경 후 통과했다. 고정 소스의 EXE 빌드·패키지 실행과 공개 업데이트 검증 결과는 완료 후 아래에 기록한다.

실제 사용자 앱의 설치·재시작과 실제 Android 기기 동작은 별도 검증이다.
