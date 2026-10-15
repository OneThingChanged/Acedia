---
type: Release
title: Acedia 1.8.1.83
description: "Qwen 채팅 지원, Claude 질문 답변, Remote ZIP 다운로드와 동영상 링크 수정."
status: stable
last_updated: 2026-10-15
---

# Acedia 1.8.1.83

## 변경 내용

- Qwen 세션도 데스크톱·Remote·Dashboard의 채팅 모드에서 대화, 생각 과정, 도구 호출과 결과, 이미지와 관련 파일을 확인하고 메시지를 보낼 수 있다. 최근 대화부터 읽고 위로 스크롤하면 이전 대화를 추가한다. 병렬 도구 호출의 결과는 각 호출 ID에 맞춰 표시한다.
- Qwen 관리 훅이 중첩 PowerShell 실행 때문에 세션 시작·작업 이벤트를 보내지 못하던 문제를 수정했다. 기존 사용자 설정과 훅을 보존하며 정확한 세션 ID로 대화를 연결한다. 답변 완료 뒤 백그라운드 메모리 추출 때문에 Working으로 남는 문제도 수정했다. 업데이트 후 기존 Qwen 세션은 Restart해야 새 훅을 읽는다.
- 로컬 Claude의 `AskUserQuestion`을 채팅에서 답할 수 있다. 여러 질문, 체크박스 복수 선택, 직접 입력을 지원하며 실제 터미널 질문·선택과 최종 검토를 확인해 전송한다. 바뀐 질문과 불확실한 부분 전송은 자동 재시도하지 않는다. Qwen 선택형 질문 답변과 지원하지 않는 CLI 화면은 터미널에서 답한다.
- Remote·Dashboard의 ZIP 링크와 관련 파일 카드를 누르면 원본 파일을 다운로드한다. 결과 폴더와 Markdown 문서의 상대 링크, Windows 전체 경로, 한글·공백 파일명도 지원한다. 기존 인증·프로젝트 경계를 유지하고 서버에서 압축을 풀지 않는다.
- 답변에 파일명만 있는 동영상 링크를 같은 답변의 관련 파일 경로로 연결한다. 중복 파일명은 추측하지 않는다. 재생 전 파일 접근을 확인해 파일 없음·권한·네트워크·재생 형식 오류를 구분하고, 닫은 미리보기가 늦게 다시 열리지 않도록 했다.

Standard EXE 업데이트다. 기존 서명 APK **1.8.1.39/code 21**을 재사용하며 Remote 웹 변경은 호스트 업데이트로 제공한다. PWA 캐시는 **v100**이다.

## English

- Add Qwen Chat to desktop, Remote and Dashboard, including messages, reasoning, tool calls/results, images, related files and message submission. Load recent history first and older history on upward scroll; match parallel tool results by call ID.
- Fix managed Qwen hook delivery and bind transcripts to the exact session identity. Prevent background memory extraction from leaving completed chat in Working. Restart existing Qwen sessions after updating the host to load the new hooks.
- Answer local Claude `AskUserQuestion` forms from Chat, including multiple questions, checkbox choices and custom text. Verify the native form, selection and final review; do not replay uncertain partial answers. Qwen structured answers and unsupported layouts retain the terminal action.
- Download original ZIP files from Remote/Dashboard chat links, file cards, result folders and Markdown documents while retaining existing authentication and project boundaries.
- Resolve filename-only video links from the same answer's recorded file paths. Check access before playback, distinguish missing/access/network/decoder errors, and cancel stale preview loads.

## 검증

- 배포 버전으로 전체 검사를 다시 실행해 **195개 파일·1,424개 테스트**가 모두 통과했다. TypeScript·Vite 프로덕션 빌드와 관련 문서 4개의 상대 참조 179개도 확인했다.
- 실제 설치된 Qwen **0.25.1**과 격리된 로컬 모의 API에서 세션 시작 훅, 대화 수집과 완료 상태를 확인했다. Remote·Dashboard 각각 PC 1100px·모바일 390px에서 메시지·이미지·파일·병렬 도구 결과·이전 대화·전송·터미널 전환을 검증했다.
- 실제 설치된 Claude **2.1.292**와 로컬 모의 API에서 세 질문과 한국어 직접 입력, 복수 선택과 직접 입력, 단일 질문 즉시 제출 후 작업 재개를 확인했다. 데스크톱·Remote·Dashboard의 질문 UI도 검증했다.
- ZIP 회귀 검사 59개와 실제 브라우저 다운로드 24건을 검증했다. Remote·Dashboard의 PC·모바일 화면에서 원본 바이트와 UTF-8 파일명을 확인했다.
- 동영상·파일 링크 검사 76개와 Remote·Dashboard PC·모바일 4개 사례를 검증했다. 격리된 MP4 복사본의 재생·탐색, 없는 파일, 잘못된 영상, 접근 확인 중 닫기와 Documents WebM을 확인했다.

사용 중인 실제 세션에 메시지를 보내거나 재시작하지 않았다. 외부 모델 API는 호출하지 않았으며 Android 실기기·외부망 동영상 재생은 별도 검증 대상이다.

동작 규칙은 [Remote service](remote-service.md), [Workspace interactions](workspace-interactions.md), [알림 조건과 절전](notifications-and-power.md)에 기록했다.

## 배포 기록

소스 버전과 문서를 1.8.1.83으로 고정했다. 커밋·푸시 후 EXE 패키지 검증, 공개 게시와 다운로드 검증 결과를 이 문서에 추가한다. 사용자 PC의 설치 완료와 공개 게시 완료는 별개다.
