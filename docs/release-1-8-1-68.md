---
type: Release
title: Acedia 1.8.1.68
description: "채팅 모델·effort 변경, 이미지 프레임 경계 수정과 답변별 파일·검색 팝업."
status: draft
last_updated: 2026-10-08
---

# Acedia 1.8.1.68

## 변경 내용

- 채팅 입력창에서 **모델과 추론 강도(effort)**를 선택하고 적용할 수 있다. Codex·Claude의 지원 목록을 사용하고 선택한 모델이 현재 effort를 지원하지 않으면 기본값으로 조정한다. 같은 계정·대화 ID로 이어서 실행하며 작성 중인 메시지와 첨부를 보존한다.
- 작업·질문·예약 메시지 대기 중에는 모델 적용을 제한하고, 적용 중에는 전송을 막는다. 터미널 전환 후에도 이 제한을 유지하며 종료된 세션은 모델을 바꿔 다시 이어갈 수 있다. 자식 세션의 모델을 바꿀 때 부모 설정을 유지한다. SSH·지원하지 않는 도구는 기존 공급자 표시를 사용한다.
- 채팅 이미지의 실제 크기·비율과 메시지의 가용 폭으로 **이미지·테두리·배경 크기를 맞춘다**. 넓은 이미지 옆의 빈 배경과 사용자 말풍선 밖 넘침을 수정한다. 여러 첨부, 세로 이미지, 좁은 창에서도 비율을 유지하고 대화 갱신 시 이미지를 다시 읽지 않는다.
- 대화 전체의 `Artifacts` 목록을 **해당 답변 아래의 파일 목록**으로 바꾼다. 저장·수정이 확인된 파일은 **생성·수정 파일**, 읽거나 언급한 기존 파일은 **관련 파일**로 구분한다. 같은 답변의 중복 경로를 합치고 실패한 수정 요청을 새 결과물로 표시하지 않는다.
- 답변당 파일은 **처음 3개**만 표시한다. **4개부터 전체 보기**를 누르면 검색 가능한 팝업에서 전체 목록·개수·경로를 확인하고 파일을 열 수 있다. Esc·바깥 클릭으로 닫으며 이전 대화를 불러올 때도 현재 답변의 목록과 이미지·초안을 보존한다.

사용 방법: [워크스페이스 동작](workspace-interactions.md).
기존 서명 APK **1.8.1.39/code 21**을 포함하는 EXE 업데이트다.

## English

- Choose the **model and reasoning effort** from the Chat composer for Codex and Claude. Use provider-supported choices and preserve the current effort when supported. Resume the same conversation and account while keeping the draft and attachments.
- Prevent model changes during work, questions or queued messages, and block sends throughout application, including view switches. Allow an exited session to resume with a new model; preserve parent settings when changing a child session.
- Fit **inline images, frames and backgrounds** to natural aspect ratios and the available message width. Fix extra background beside wide previews and overflow from user bubbles, including portrait images, multiple attachments and narrow windows. Retain loaded images across transcript updates.
- Attach file cards **to their own assistant response**. Separate **Created or modified files** from **Related files**, merge duplicate references within an answer and require successful tool results before treating an edit as saved output.
- Show **three files inline** and provide **View all** for four or more. Search names or paths in a scrollable dialog, open previews, close with Esc or an outside click and preserve current file lists when loading older history. Reuse signed mobile APK **1.8.1.39**.

## 검증

- 버전 갱신 후 전체 **180개 파일·1,214개 검사**와 모바일 메타데이터·연결 검사 **24개**를 통과했다. npm 버전은 **1.8.1**, 제품 버전·Android 소스 versionName은 **1.8.1.68**이며 Android versionCode **21**의 기존 서명 APK를 재사용한다.
- 940·390·300px 실제 Electron에서 채팅 모델·effort 변경·전송 제한·키보드 선택·초안 보존과 1440px App의 같은 대화·계정 재실행·영속 설정·상속 처리를 통과했다.
- 1440·390·300px의 다크·라이트 채팅에서 가로·세로 이미지 경계·비율, **150개 파일**의 답변별 연결·3개 인라인·4개부터 팝업·검색·개수·경로·열기·포커스·Esc·목록 갱신과 이전 페이지 병합을 통과했다. 이미지 DOM과 읽기 횟수를 보존하고 새 세션에 목록을 섞지 않는다.
- 기존 데스크톱·Remote 질문·로그인·시작 확인·작업 상태·이미지 뷰어·메시지 재사용·인용과 Remote 모델 선택창 검사도 통과했다. 상세 구현 검사는 [UX 기록](chat-ux-review-2026-10-08.md)을 따른다.

Standard EXE 빌드·패키지 실행·종료·설치 파일·공개 다운로드 검증과
게시 결과는 완료 후 추가한다. 실제 사용자 앱의 설치·재시작은 별도 확인이다.
