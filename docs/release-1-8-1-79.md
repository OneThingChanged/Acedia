---
type: Release
title: Acedia 1.8.1.79
description: "Remote 웹 기능 확장, 완료 상태 표시 수정과 문서·HTML 작업자 분배 기능 제거."
status: stable
last_updated: 2026-10-12
---

# Acedia 1.8.1.79

## 변경 내용

- 문서·HTML 작업자 분배 기능을 제거했다. 설정, 새 세션·프로젝트, 세션 속성에서 작업자 항목을 없애고, 기존 저장값과 Luna/max 자동 위임·실행 지시가 재시작 때 적용되지 않도록 정리했다. 일반 모델·effort·Fast, 사용자 추가 지침과 계정 분산은 계속 사용할 수 있다.
- Remote·Dashboard 채팅에서 현재 모델·effort·Fast 확인과 변경, 기본 모델 설정, 사용자 첨부 이미지와 답변별 관련 파일을 지원한다. 이미지 확대·이동·복사, 수정 파일 요약·diff와 전체 파일 검색창을 제공한다.
- 채팅의 Working 표시와 예약 큐를 대화 스크롤 밖에 고정했다. Codex 작업 중 메시지 전달과 순서대로 보내기, 비동기 질문, 세션 변경 후 큐 보류를 처리한다.
- 웹 사이드바에 프로젝트 접기, Codex·Claude 로고, 분할 화면별 색상, 호버 닫기·항목 메뉴, 경로 검색과 완료 읽음 표시를 반영했다. 새 세션의 도구와 Dangerous 선택을 기억한다.
- 완료 hook 이후 오래된 Working 상태가 남는 오류를 수정했다. 새 작업이 시작되면 다시 Working으로 표시한다. 대화 갱신 시 기존 메시지·이미지 DOM을 유지해 불필요한 이미지 재생성을 줄였다.

기존 서명 APK **1.8.1.39/code 21**을 포함하는 Standard EXE 업데이트다. Android 앱을 새로 빌드하지 않으며, 공용 웹 기능은 업데이트한 호스트가 제공한다.

## English

- Remove Acedia's document/HTML worker routing from settings, creation dialogs, properties, persisted options and CLI launch instructions. Keep normal model, effort, Fast, account routing and user-authored instructions.
- Bring current model controls, default models, user image previews, image zoom/pan/copy, response-specific files, changed-file diffs and searchable file dialogs to Remote and Dashboard chat.
- Keep Working and queued messages outside the conversation scroll area. Support Codex steering, ordered delivery, asynchronous questions and queue holds when the conversation changes.
- Add project folds, provider logos, split-screen colors, hover actions, path search, unread completion and remembered new-session choices to the shared web interface.
- Resolve stale Working after completion and preserve conversation/image nodes across updates.

## 검증

- 배포 전 전체 **186개 파일·1,354개 검사**와 TypeScript·Vite 빌드가 통과했다. 설치 파일명에 남은 이전 버전 표기를 수정하고 전체 검사를 다시 통과했다. 고정 소스의 EXE·packaged 검증도 통과했다.
- 작업자 기능 제거 관련 **13개 파일·188개 검사**, TypeScript·Vite 빌드, 생성창 **18개 화면 조합**과 계정·설정 통합 UI 검사를 통과했다.
- 공용 웹 기능은 Remote·Dashboard 데스크톱·모바일 크기의 격리 Electron 검사로 검증했다. [기능 검증 및 외부 지연 조사](remote-workspace-review-2026-10-12.md)를 참고한다.
- 외부 Remote의 잘못된 UNC 파일 조회와 큰 대화 기록 반복 전송은 원인 조사까지만 진행했으며 이번 릴리스에서 해당 조회·전송 경로를 최적화하지 않았다. 실제 외부 기기·회선 성능 검증은 별도다.
- 제품과 Android 소스 버전은 **1.8.1.79**, npm 호환 버전은 **1.8.1**이다. 포함하는 기존 APK는 **1.8.1.39/code 21**이다.

- 고정 소스 `12f1fdd8b8f80c4ac97f915f5616e1bbc755c886`를 푸시하고 별도 출력 폴더에서 빌드했다. 실제 packaged Git query·기본 모델 IPC·bridge·문서 브라우저·Dashboard와 종료·트레이·보안 lifecycle 검사가 종료 코드 0으로 통과했다.
- 패키지의 런타임·렌더러 **297개 파일**이 빌드 원본과 일치한다. 제거한 작업자 설정 모듈과 IPC가 패키지에도 없으며 PWA cache 버전은 **v94**다. 기존 APK의 인증서·패키지·아키텍처·SHA-256도 다시 확인했다.
- 설치 파일 FileVersion **1.8.1.79**, npm 호환 ProductVersion **1.8.1**, manifest·세 자산의 크기·SHA-256을 확인했다. Authenticode는 기존 EXE 채널과 같은 `NotSigned`다. packaged 검사에서 기존 `AttachConsole failed` 진단이 출력됐지만 필수 성공 marker와 종료 코드 0을 확인했다.

검증 증빙: `output/full-suite-exe-1.8.1.79.log`, `output/release-metadata-exe-1.8.1.79.log`,
`output/build-frontend-1.8.1.79.log`, `output/build-exe-1.8.1.79-isolated.log`,
`output/remote-workspace-exe-1.8.1.79.log`, `output/packaged-smoke-1.8.1.79.log`,
`output/packaged-lifecycle-1.8.1.79.log`, `output/exe-release-1.8.1.79/local-verification.json`,
`output/publish-exe-1.8.1.79.log`, `output/public-update-verification-1.8.1.79.log`.

## 공개 배포

- [GitHub 안정 릴리스 v1.8.1.79](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.79)를 2026-10-12 **23:29:23 KST**에 게시했다. 태그와 빌드 소스는 `12f1fdd8b8f80c4ac97f915f5616e1bbc755c886`다.
- **23:30:34 KST**에 **1.8.1.77·1.8.1.78 → 1.8.1.79** 감지와 공개 설치 파일 전체 다운로드, 세 자산의 크기·SHA-256 검증을 통과했다.
- 사용자 앱·프로필을 변경하거나 설치 파일을 실행하지 않았다. 앱 설정의 **Check → Update**로 적용한다. Remote 웹 기능은 업데이트한 호스트에서 제공하며, 이번 배포는 Microsoft Store 제출과 새 APK 빌드를 포함하지 않는다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.79-x64.exe` | 151360292 | `47f7d8435506a26f92dff11bda43d19372c1a9b9703eedb8917b403fb941e8fa` |
| `Acedia-Setup-1.8.1.79-x64.exe.blockmap` | 159490 | `61a3ae072260e24d051f3c43b9e935a14f77294f1561060aa6d057674b4f8759` |
| `latest-exe.json` | 256 | `e155399e18fdd800aaf96de8d6c976aa25f466f3366ca60b613568914de9f1b7` |
