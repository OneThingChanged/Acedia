---
type: Release
title: Acedia 1.8.1.53 project board and Codex questions
description: Connect project parents and folder references on a movable board and retain Codex async questions during ongoing work.
status: draft
last_updated: 2026-10-05
sources:
  - resource: session-organization.md
  - resource: remote-service.md
  - resource: exe-release-workflow.md
  - resource: ../app/src/components/ProjectBoard.tsx
  - resource: ../app/src/lib/projectHierarchy.ts
  - resource: ../app/electron/services/chat-transcript.mjs
  - resource: ../app/electron/services/question-responder.mjs
---

# Acedia 1.8.1.53

## 변경 사항

- **프로젝트 관계 보드**: Organization에서 실제 등록 프로젝트를 보드로 표시한다. 프로젝트 간 부모·자식 연결과 해제, 다른 가지의 폴더 참조를 지원하며 기존 세션 트리도 열 수 있다. 자기 연결·순환 연결·다른 실행 환경의 부모 연결을 차단한다.
- **폴더와 설정 상속**: 공통 지침을 상속하고 작업 폴더·모델 상속은 선택한다. 참조할 프로젝트의 루트 또는 하위 폴더와 지침·코드·문서 용도를 지정한다. 관계 변경은 다음 실행에 적용하며 폴더를 실제로 이동하거나 실행 중인 세션을 재시작하지 않는다.
- **보드 조작과 저장**: 카드 드래그, 빈 영역·Space·가운데 버튼으로 보드 이동, 휠 확대·축소, 전체 보기, 미니맵, 정렬, 검색 이동과 실행 취소·다시 실행을 제공한다. 관계·위치를 저장하고 다른 창의 변경과 동기화한다.
- **Codex 질문 표시 수정**: 작업 중 나온 비동기 질문의 선택지·직접 입력 항목을 데스크톱과 Remote 채팅에 표시한다. 질문 접수 결과 뒤에도 유지하고 실제 답변의 질문 ID로 해제한다. 계속 진행 중인 작업 상태와 일반 메시지 큐를 유지한다.
- **질문 답변과 대화 복원**: 답변 전 터미널의 대기 질문과 실제 입력 폼을 확인한다. 지원하지 않거나 바뀐 질문은 터미널에서 답변할 수 있다. 상속 폴더에서 시작한 세션은 이후 폴더 설정이 바뀌어도 소유한 대화의 원래 조회 경로를 보존한다.
- 제품·설치 파일·Android 소스 버전은 **1.8.1.53**, npm 호환 버전은 **1.8.1**이다. EXE에는 기존 서명 APK **1.8.1.39 / versionCode 21**을 재사용한다.

## Changes

- Add an Organization board for real projects, with parent connection/detachment, cross-branch folder references and access to existing session trees. Reject self-links, cycles and incompatible execution environments.
- Inherit common instructions and optionally folders/models; choose reference roots or subfolders for instructions, code and documentation. Apply changes on the next launch while keeping each session's execution and conversation independent.
- Support draggable cards, board panning, wheel zoom, fit, minimap, snap, search navigation and undo/redo. Persist relationships and positions with cross-window synchronization.
- Keep Codex async questions visible in desktop and Remote chat during ongoing work. Decode string choices and free-text forms, retain questions after acceptance and resolve them by the actual reply identity.
- Verify the queued native form before submitting answers and retain terminal answering for unsupported or changed forms. Preserve the original conversation lookup folder for sessions launched through project inheritance.

## 검증

- 전체 **161개 파일·1,048개 테스트**를 통과했다. Windows Store/process 검사는 별도로 실행했고, 마지막 대화 답변 표시 변경은 해당 전체 파일의 검사로 확인했다.
- TypeScript/Vite 빌드와 실제 Electron 보드 조작을 확인했다. 카드 드래그·보드 이동·휠·미니맵·연결선·실행 취소·다시 실행, 저장·재로드·다른 창 동기화와 1600×1000·1280×900·800×640 배치를 검증했다.
- 기존 세션 생성·상속·모델 재정의·대화 복원·순환 차단·탐색을 확인했다. 참조 경로와 CLI 추가 작업 폴더, 계정 분산 설정과 대화 소유자 경로의 회귀 검사를 통과했다.
- 데스크톱 채팅과 Remote 1024px·390px에서 진행 중 비동기 질문, 선택지·직접 입력, 로딩·지원하지 않는 질문·실패한 쓰기·터미널 이동을 확인했다. 실사용 세션이나 외부 모델에 질문을 전송하지 않았다.
- 제품 버전 검사, 프로젝트·세션 생성 창의 실제 Electron 상호작용과 22개 화면 배치, native PTY 검증을 통과했다.
- Standard EXE 생성과 packaged bridge·Dashboard·내장 Git·종료·트레이·보안 lifecycle 검증을 통과했다. 패키지의 변경된 Electron 소스 8개와 renderer 파일 3개가 빌드 원본과 일치하며 보드·비동기 질문 코드와 재사용 APK가 포함됐다.
- 설치 파일 FileVersion **1.8.1.53**, manifest 버전·크기·SHA-256과 blockmap을 확인했다. `publish-github-exe.ps1 -VerifyOnly`를 통과했으며 Authenticode는 기존 채널과 같은 **NotSigned**다.

## 배포 상태

Standard EXE 빌드·패키지 검증을 완료했다. 검증한 소스 커밋을 기준으로 EXE·blockmap·`latest-exe.json`을 공개하고 실제 업데이터 감지·다운로드를 확인한다. 사용자 설치는 별도다.

## 지원 범위

참조는 지정한 대상의 한 단계 관계를 사용한다. 읽기 안내는 AI에 전달하는 지침이며 파일 시스템 권한 강제 기능이 아니다. 실제 쓰기 권한은 CLI의 승인·sandbox 설정에 따른다. 로컬 쓰기 참조는 경로를 확인하고 추가 작업 폴더로 전달하며 SSH 쓰기 참조는 지원하지 않는다. 자세한 규칙은 [프로젝트·세션 조직도](session-organization.md)를 따른다.
