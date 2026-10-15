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
- 고정 소스 커밋에서 Standard EXE를 생성했다. 네이티브 PTY, 패키지 실행·Git·Dashboard와 종료·트레이·보안 검사가 통과했다. 패키지의 런타임·렌더러 파일 **314개**가 소스와 일치했다.
- 설치 파일의 네 자리 FileVersion **1.8.1.83**, 세 자리 ProductVersion **1.8.1**, 같은 빌드의 manifest·크기·SHA-256을 확인했다. Authenticode 상태는 `NotSigned`다.
- 공개 GitHub에서 **1.8.1.81·1.8.1.82 → 1.8.1.83** 업데이트 감지를 확인했다. 실제 업데이터로 EXE를 전부 내려받고 공개 자산 세 개의 크기·해시·다운로드 URL과 소스 태그를 다시 검증했다.

사용 중인 실제 세션에 메시지를 보내거나 재시작하지 않았다. 외부 모델 API는 호출하지 않았으며 Android 실기기·외부망 동영상 재생은 별도 검증 대상이다.

동작 규칙은 [Remote service](remote-service.md), [Workspace interactions](workspace-interactions.md), [알림 조건과 절전](notifications-and-power.md)에 기록했다.

## 배포 기록

- 공개 게시: **2026-10-15 21:41:21 KST**. [GitHub Release v1.8.1.83](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.83).
- 고정 소스·태그: `1cc981e60f700df08b1b404746f7db59a4086cc7`.
- 공개 다운로드 검증 완료: **2026-10-15 21:42:00 KST**.
- 소스 제품 버전·Android 소스 versionName: **1.8.1.83**. npm 호환 버전: **1.8.1**.
- 기존 서명 APK **1.8.1.39/code 21** 재사용. SHA-256: `f04502319e96f1cf3e2fb1a949ec6ae81dcefad4443877f31ca36c8c15190957`.

| 공개 자산 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Acedia-Setup-1.8.1.83-x64.exe | 151392941 | `0352c87aabb98930e1b7c5781ba966b573dc753a95928310e2dc14f6e92b170d` |
| Acedia-Setup-1.8.1.83-x64.exe.blockmap | 159454 | `a45361f0956d00e4ae9d50e9027c365eb697c15bcd649b934bb1e579a68faf33` |
| latest-exe.json | 256 | `761da1db4efb2cb22a3fc2cd75242a1021a9cd0b027d191ae3b688597d2537d4` |

검증 증빙: `output/exe-83-tests.log`, `output/exe-83-build.log`,
`output/exe-83-pty-smoke.log`, `output/exe-83-packaged-smoke.log`,
`output/exe-83-packaged-lifecycle-smoke.log`,
`output/exe-release-1.8.1.83/local-verification.json`,
`.build-tools/public-verified-1.8.1.83.json`.

패키지 검사 중 기존 node-pty 종료 보조 프로세스의 `AttachConsole failed`가 출력됐지만
필수 bridge·Git·Dashboard 성공 marker와 종료 코드 0을 확인했다.

설정 **Check → Update** 또는 앱 재실행 시 업데이트 안내로 적용한다. 업데이트 후 기존
Qwen 세션을 Restart하면 새 관리 훅을 읽는다. 공개 게시·다운로드 검증 완료와 사용자 PC의
설치 완료는 별개이며, 이 배포 작업에서 설치 프로그램을 실행하지 않았다.
