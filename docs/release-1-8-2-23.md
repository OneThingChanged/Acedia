---
type: Release
title: Acedia 1.8.2.23
status: published
last_updated: 2026-11-16
---

# Acedia 1.8.2.23

- 비활성 Codex·Claude 세션에 지시를 전달할 때 기존 대화의 재개 정보를 유지하고, 새 시작 후크가 아직 없더라도 정확히 일치하는 대화 기록과 현재 입력창을 확인해 준비 상태를 판정한다. 사용자 초안·진행 중인 작업·질문은 계속 전달을 막으며, 같은 요청은 한 번만 알린다.
- 로컬 Codex의 `Hooks need review`에서 Acedia가 설치한 후크 명령과 스크립트를 검증한 경우 **2. Trust all and continue**를 자동 확인한다. 선택 이동 후 실제 화면을 다시 확인하며 외부 후크·변경된 스크립트·확인할 수 없는 플러그인·별도 프로필은 수동 검토를 유지한다.
- 세션 현황 표·전달 표·보드에 **Active만** 토글을 추가한다. Sleeping도 켜면 활성 부모 아래의 sleeping 자식·손자만 함께 표시한다. 활성 자식의 부모 경로를 유지하고 숨긴 행과 빈 프로젝트를 정렬하며, 표시 설정은 재실행 후 복원한다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 포함한다.

## English

- Preserve exact Codex and Claude resume identities when starting an inactive session for message delivery. Determine readiness from the matching conversation and current composer, while retaining draft, active-turn and question guards and preventing duplicate notifications.
- Automatically select **2. Trust all and continue** for local Codex startup hooks only after verifying the commands and script installed by this Acedia host. Re-observe the selection before confirmation; unknown hooks, changed scripts, plugin sources and separate profiles remain manual.
- Add **Active only** to session, handoff and board views. With Sleeping enabled, include sleeping descendants of active parents, preserve ancestor context, compact hidden rows and empty projects, and persist visibility preferences.
- Standard EXE release bundling the existing signed Android APK 1.8.1.39.

## 검증

- 전체 Vitest 269개 파일·2,197개 테스트, 추가 변경의 관련 82개 테스트와 TypeScript/Vite 빌드가 통과했다.
- 격리된 실제 Electron 개발 앱에서 합성 native PTY CLI로 후크 1→2 선택·한 번의 확인, 이미 2번인 경우의 확인, 외부 후크의 자동 입력 차단을 검증했다. 모델을 호출하거나 운영 세션을 변경하지 않았다.
- 동일 세션·동일 대화 재개 후 원문 읽음·작업 시작, 사용자 초안 차단·해제와 중복 알림 방지를 확인했다.
- 활성 부모의 sleeping 자식·손자 표시, 부모 비활성 후 숨김, 순환 관계 처리, 표·보드 공통 필터, 로컬 설정 저장·복원을 확인했다.

## 패키지 검증

- 제품 소스 `d69bc739b6da8c7c4b14ec0c32c6071d49745cfd`를 별도 작업 폴더와 복사한 의존성으로 고정해 빌드했다. ASAR 런타임·렌더러 439개 파일과 Pixel Office 자산·라이선스 20개를 원본과 대조했다.
- 패키지 Electron Node 런타임·인증된 HTTP·native PTY 검사 30개와 이번 수정의 추가 검사 5개가 통과했다. 같은 고정 소스의 실제 개발 앱에서도 후크 선택·확인, 외부 후크 차단, 동일 대화 재개와 한 번의 알림 전달을 확인했다.
- 로컬·공개 EXE의 NSIS CRC `5a6f51f0`, 내부 압축 데이터 전체와 설치 전 검증 모드가 통과했다. Authenticode 상태는 `NotSigned`다. 검증은 설치·레지스트리 변경·기존 앱 종료 전에 끝난다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.23](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.23).
- 게시: **2026-11-16 13:27:04 KST**. 공개 전체 다운로드 검증: **2026-11-16 13:28:02 KST**.
- **1.8.2.22 / 1.8.2.21 → 1.8.2.23** 감지를 실제 업데이터로 확인했다. 태그·manifest·EXE·blockmap의 소스·버전·크기·SHA-256이 빌드 원본과 일치한다.
- 앱 업데이트를 적용한 뒤 새 필터를 사용할 수 있다. 시작·전달·후크 수정은 업데이트된 호스트에서 이후 새로 시작·재개한 CLI에 적용한다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포와 사용자 PC 설치는 수행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.23-x64.exe` | 156389418 | `a9a529e8c4cfb4739a10dfe5668ca4d0b96eea4383d105446ee1fa0468f57a30` |
| `Acedia-Setup-1.8.2.23-x64.exe.blockmap` | 163503 | `6fcdf83b28d4c0a022b6c9020059718814f5257346c11d40d88b2f65c5c34723` |
| `latest-exe.json` | 256 | `32dc8afab4f20cf0b724b3a1bc9fbaa30edac53d54d04b3fe0032d316e53e75f` |
