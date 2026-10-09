---
type: Release
title: Acedia 1.8.1.70
description: "브라우저 작업 기본 백그라운드 처리, 화면·입력 포커스 유지, Chat Working 중복 수정."
status: stable
last_updated: 2026-10-09
---

# Acedia 1.8.1.70

## 변경 내용

- 브라우저 조사·자동화는 **기본적으로 백그라운드**에서 진행한다. 새 탭을 만들 때 우측 분할을 자동 추가하지 않으며, 예전 보조 스크립트의 배치 값도 자동 표시로 처리하지 않는다. **“옆에 열어줘”처럼 표시를 요청할 때만** 기존 탭을 화면에 연결하도록 MCP·스킬 안내를 맞췄다.
- 브라우저를 연결하거나 반복 표시해도 **현재 Screen·세션·입력 포커스**를 유지한다. 다른 Screen이나 창에 배치한 브라우저를 다시 이동하지 않는다. 숨겨진 탭에서도 정상 크기의 화면 캡처와 작업을 계속할 수 있다.
- Chat의 **Working 중복 표시**를 제거했다. 입력창 위의 상태 바 하나에서 현재 작업·경과 시간·작업 내역을 확인한다. 시작·복구·작업 중 질문과 완료 후 상태 전환을 유지한다.

사용 방법: [워크스페이스 동작](workspace-interactions.md).
기존 서명 APK **1.8.1.39/code 21**을 포함하는 EXE 업데이트다.

## English

- Run browser research and automation **in the background by default**, without automatically adding right-hand splits. Ignore legacy placement hints on creation. Display an existing tab **only when the user explicitly asks to see the page**; update the MCP and bundled skill guidance accordingly.
- Preserve the **current Screen, session and input focus** during browser connections and repeated display requests. Retain tabs placed in other Screens or workspace windows. Keep a usable hidden viewport for browser capture and automation.
- Remove the duplicate **Working** indicator in Chat. Keep one status bar above the composer with the current tool, elapsed time and work details, including startup, recovery, asynchronous questions and completion.

## 검증

- 브라우저 배치·MCP·백그라운드 처리 검사 75개와 기본 백그라운드 생성·명시적 표시 검사 24개를 통과했다.
- 격리된 실제 App 렌더러에서 다른 Screen의 최초·반복 연결, 동일 Screen의 다른 분할, 입력 포커스·작성 내용 유지와 명시적 사용자 선택을 확인했다. 레이아웃 800·1202·1920px 검사와 실제 Electron의 숨겨진 1280×800 캡처·창 표시/포커스 없음 검사를 통과했다.
- Chat 질문·Desktop/Remote·모델 선택 검사를 통과했다. Desktop의 작업 중 질문과 1280·420px에서 작업 표시가 하나인 것, 완료 후 숨김과 새 작업의 시간 초기화를 확인했다.
- 버전 갱신 후 전체 **180개 파일·1,236개 검사**와 모바일 설정·연결 검사 **24개**를 모두 통과했다. worker 2개·검사 제한 60초로 실행했고 실패·건너뛴 검사는 없다.
- 재사용하는 APK **1.8.1.39/code 21**의 패키지·아키텍처·서명 인증서·SHA-256을 확인했다. npm 버전 **1.8.1**, 제품 버전·Android 소스 versionName **1.8.1.70**을 맞췄다.
- 푸시한 고정 소스의 TypeScript·Vite·Standard EXE 빌드를 통과했다. `app/electron-dist/exe-1.8.1.70/`의 별도 출력 폴더를 사용하여 기존 실행 앱과 사용자 세션을 유지했다. 기존 큰 번들 경고는 남아 있다.
- 해당 패키지의 bridge·Dashboard·Git·브라우저 설정과 명시적 표시·네이티브 PTY·종료·트레이·보안 검사를 통과했다. renderer·runtime **278개 파일**이 빌드 원본과 일치한다. 콘솔 목록 보조 프로세스의 `AttachConsole failed` 진단 8회는 이전 버전과 같으며 필수 검증은 모두 통과했다.
- 설치 파일 FileVersion **1.8.1.70**, 크기·SHA-256과 같은 빌드의 `latest-exe.json` 일치를 확인했다. Authenticode 상태는 기존 채널과 같은 `NotSigned`다.
- 공개 업데이터의 **1.8.1.68·1.8.1.69 → 1.8.1.70** 감지와 실제 설치 파일 다운로드를 통과했다. EXE·blockmap·manifest의 크기·해시, 최신 안정 릴리스와 소스 태그가 일치한다. 사용자 PC의 업데이트 설치·재시작은 별도 확인 항목이다.

로컬 증빙: `output/full-suite-exe-1.8.1.70.json`,
`output/full-suite-exe-1.8.1.70-summary.json`, `output/mobile-tests-exe-1.8.1.70.log`,
`output/browser-background-default-tests.log`, `output/browser-selection-workspace-smoke.log`,
`output/browser-selection-background-smoke.log`, `output/chat-working-single-question-smoke.log`,
`output/chat-working-single-model-smoke.log`, `output/apk-reuse-verification-1.8.1.70.log`,
`output/build-frontend-1.8.1.70.log`, `output/build-exe-1.8.1.70-isolated.log`,
`output/packaged-smoke-1.8.1.70.log`, `output/packaged-lifecycle-1.8.1.70.log`,
`output/exe-release-1.8.1.70/local-verification.json`,
`output/public-update-verification-1.8.1.70.log`, `.build-tools/public-verified-1.8.1.70.json`.

## 공개 배포

- [GitHub 안정 릴리스 v1.8.1.70](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.70)를 2026-10-09 **13:46:17 KST**에 게시했다.
- 소스·태그는 `3fa974b8b0550795047576c2d2f147bee0fe6423`이다. 설치 파일은 `origin/main`에 푸시한 이 고정 소스에서 만들었다. 기존 서명 APK를 포함하는 EXE 배포이며 Microsoft Store 제출·새 APK 빌드는 실행하지 않았다.
- **13:47:37 KST**에 공개 다운로드·업데이트 검증을 완료했다. 설치 파일을 실행하는 대신 공개 업데이터의 다운로드·무결성 검증 완료 상태를 확인했다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.70-x64.exe` | 151325474 | `ae9d2fb56e2a3bc67c17f871e2e705e61ffecad800fefbb46cc3efc35a570478` |
| `Acedia-Setup-1.8.1.70-x64.exe.blockmap` | 159363 | `24549cd9b5eb2170665bae0dd5559cc57c39f0245da8e5e342334623ff048f20` |
| `latest-exe.json` | 256 | `fdde1b02fd7546a616c66bcd4c00df85dd2f4da47668e42da52ccb98c82f7593` |
