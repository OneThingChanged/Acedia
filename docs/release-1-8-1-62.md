---
type: Release
title: Acedia 1.8.1.62
description: "연결 코드 유지·접속 IP, 분산 상태 표시, 파일 링크와 이미지 확대·이동·복사 개선."
status: stable
last_updated: 2026-10-07
---

# Acedia 1.8.1.62

## 변경 내용

- Dashboard LAN 연결 코드를 별도 파일에 저장하고 앱·서버 재시작과 허용 대역 추가 시 유지한다. 코드 갱신 버튼을 누를 때 새 코드를 발급한다. 허용 규칙 변경 시 접근이 금지된 세션만 해제하며, 코드 갱신·로그아웃·LAN 종료의 인증 해제는 유지한다. 서버 재시작 후에는 같은 코드로 다시 인증한다.
- LAN 설정에 인증된 접속 IP와 연결 중·최근 접속 상태, 마지막 요청 시각을 표시한다. 실제 소켓 IP를 사용하며 공개 터널 접속자 목록과 구분한다. 추가 허용 네트워크의 단일 IP는 `/32`로 지정한다.
- 계정 관리·분산 상단에 **꺼짐 / 켜짐·요청 대기 / 켜짐·처리 중**과 서버 미준비·사용 가능한 계정 없음 상태를 표시한다. 소유자에게 참여·사용 가능 계정 수와 처리 중 요청 수를 보여주고, 실제 처리 중인 계정 카드를 강조한다. 일반 접속자에게는 계정 정보 없이 켜짐 여부만 표시한다.
- 데스크톱 채팅의 코드 형태 파일·폴더 경로와 Windows Markdown 링크를 클릭해서 열 수 있다. 짧은 상대 경로는 프로젝트의 `output/`도 확인하며, 직접 프로젝트 경로가 우선한다. 코드 블록과 외부 URL의 기존 처리를 유지한다.
- 데스크톱 이미지 뷰어에 버튼·휠 확대/축소, 드래그 이동, 배율 버튼·더블클릭·`0` 화면 맞춤과 우측 상단 이미지 복사 아이콘을 추가한다. 복사는 확대·자르기와 무관한 전체 이미지 PNG이며 결과를 표시한다.
- 터미널의 `Viewed image 파일명.png` 링크는 최근 최대 5,000개 채팅 블록의 직접 `view_image` 호출에서 원래 경로를 찾는다. 같은 파일명이 여러 경로에 있으면 전체 경로를 요청한다. 뷰어에 열린 파일의 전체 경로를 표시한다. 원래 전체 URL이 포함된 OSC 8 링크는 그 URL을 사용한다.
- Remote/Dashboard의 결과 폴더 링크는 읽기 전용 목록, 하위·상위 폴더 이동과 지원 파일 미리보기를 제공한다. PC 소유자는 명시적 절대 경로의 외부 결과 파일도 열 수 있다. 일반 승인 사용자와 LAN 코드 접속자는 기존 프로젝트 범위를 유지하며, 삭제 범위는 확대하지 않는다. FBX 등 미지원 형식은 파일명만 표시한다.
- Remote/Dashboard 이미지 뷰어에 버튼·휠 확대/축소, 드래그 이동, 모바일 두 손가락 확대/이동과 화면 맞춤을 추가한다. 줌은 5%–1600% 범위이며 새 이미지·다른 미리보기로 전환할 때 초기화한다. PWA 캐시를 v92로 갱신한다.

사용 방법: [LAN 설정](local-dashboard.md), [분산 상태](account-pool.md),
[데스크톱 파일·이미지](workspace-interactions.md), [Remote 미리보기](remote-service.md).

## English

- Keep Dashboard LAN pairing codes across network additions and restarts; rotate explicitly and revoke only clients excluded by changed network rules. Show authenticated direct IPs and recent activity.
- Distinguish routing disabled, enabled/idle, processing and unavailable states; show eligible accounts and in-flight request counts to the owner.
- Open inline-code desktop file/folder paths and Windows Markdown links. Resolve short generated paths from project output folders and recover basename image links from recent direct view_image tool records without choosing ambiguous files.
- Add desktop image zoom, wheel, drag, fit reset, full-path display and a top-right copy-image icon that copies the complete PNG bitmap.
- Browse result folders read-only in Remote/Dashboard. Allow the authenticated PC owner to open explicit external absolute result paths while retaining non-owner and deletion boundaries.
- Add Remote image button/wheel zoom, drag and two-finger pinch/pan; reset on new previews and refresh the PWA cache to v92.
- Reuse the signed mobile APK 1.8.1.39; no Microsoft Store submission or new APK build.

## 검증

- 전체 **171개 파일·1,147개 검사**와 TypeScript·Vite 빌드를 통과했다. 최초 전체 실행에서 Git 경로 누락으로 실패한 모의 Store 실행기 6건은 환경을 보완한 뒤 해당 파일 19건 전체를 재검증해 통과했다. 실제 Store 빌드·제출은 실행하지 않았다.
- Electron LAN 검증에서 허용 대역 추가 후 코드·기존 인증 유지, 접속 IP 표시, 1024/390px 로그인·Chat·문서·로그아웃과 코드 갱신·LAN 종료를 확인했다.
- 실제 Electron 계정 관리 1280/390px 한국어·영어 화면에서 분산 대기·처리 중 배지와 기존 등록·로그인·한도 조회를 모의 계정으로 검증했다.
- 데스크톱 1280/640px에서 파일 링크, 확대·휠·드래그·화면 맞춤·복사 데이터와 실패 안내를 확인했다. 복사 요청은 fixture로 검증했으며 OS 클립보드 붙여넣기는 별도다.
- Remote 375/844/1280px에서 외부 폴더·하위 폴더·상위 이동·이미지, 줌 버튼·휠·드래그·실제 생성한 터치 이벤트의 두 손가락 줌과 초기화를 확인했다. 기존 대용량 HTML·격리·다운로드·취소 검증도 통과했다.
- 터미널 전체 파일 URL·OSC 8·줄바꿈·색상 경로의 실제 클릭·셀 판별 검증을 통과했다. basename 복원·동명 충돌은 단위 검사로 확인했다.
- native PTY 실행 검증을 통과했다.

- 고정 소스의 Standard EXE 빌드, 패키지 bridge·Dashboard·수명 주기 실행 검증을 통과했다. 패키지 내 runtime·Remote PWA·renderer 파일 17개가 빌드 원본과 일치한다.
- 설치 파일의 제품 버전 1.8.1.62, 크기·SHA-256과 `latest-exe.json` 일치를 확인했다. EXE Authenticode 상태는 기존 채널과 같은 `NotSigned`다. 서명된 APK 1.8.1.39/code 21을 재사용했다.

실제 사용자 앱 설치·재시작, 실제 상용 계정 요청과 실제 Android 기기 동작은 별도 검증이다.

## 공개 배포

- [GitHub 안정 릴리스 v1.8.1.62](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.62)를 2026-10-07 **19:37:57 KST**에 게시했다.
- 소스·태그는 `32fc831a802e0dec31d582aa23f43f18f1555323`이며 `origin/main` 푸시 후 빌드했다. Microsoft Store 제출과 신규 APK 빌드는 실행하지 않았다.
- **19:38:40 KST**에 운영 EXE 업데이터가 1.8.1.60·1.8.1.61에서 1.8.1.62를 감지하는지 확인했다. 실제 공개 설치 파일을 내려받아 업데이터의 설치 파일 검증을 통과했고, 아래 세 자산의 크기·SHA-256, 최신 안정 릴리스와 소스 태그를 확인했다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.1.62-x64.exe` | 151289203 | `2542ceac0946bafbdca2fb290122271758beccf51e132ca66ffc35c7f7d0cb66` |
| `Acedia-Setup-1.8.1.62-x64.exe.blockmap` | 159076 | `1949f754ddb6ad6fc1731d553374f60f8d5393b5b659c50f0d98ea08e25f8a19` |
| `latest-exe.json` | 256 | `9d05d9f4a6db92e9c898b3c39628cad20cd775b5142652734f22a10847ed984f` |

로컬 증빙: `output/build-exe-1.8.1.62.log`, `output/packaged-smoke-1.8.1.62.log`, `output/packaged-lifecycle-1.8.1.62.log`, `output/exe-release-1.8.1.62/verification.json`.
