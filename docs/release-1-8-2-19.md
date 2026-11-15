---
type: Release
title: Acedia 1.8.2.19
status: published
last_updated: 2026-11-15
---

# Acedia 1.8.2.19

- 실제 자식 작업을 기다리는 리더 세션에 보라색 상태점과 대기 수, 3.6초마다 회전하는 테두리를 표시한다. 프로젝트 목록·최근 대화·보드에 같은 대기 상태를 사용한다. 동작 줄이기 설정에서는 고정 테두리를 표시한다.
- 현재 작업 시도의 시작 증거 또는 최신 지시의 착수·원문 읽음과 자식의 진행 상태를 확인한다. 리더의 직접 작업 재개·질문·중단과 자식의 응답 종료를 우선하며, 예전 지시를 새 작업의 대기로 오인하지 않는다. 이전 미확인 결과와 읽음 영수증은 보존한다.
- 리더의 실제 작업 대기는 실행 중인 세션에 연결해 관측한다. 사용자 화면의 상태 조회와 조직상의 부모 관계만으로 대기를 만들지 않는다. 사이드바는 본문 없이 대기 수·세션 ID만 가볍게 조회한다.
- 보드에서 숨긴 세션·접은 프로젝트·축소 화면의 실제 카드 크기에 맞춰 자동 정렬한다. 펼친 상태의 높이와 전체 표시 위치를 빈 공간으로 남기지 않는다.
- 전체 표시의 수동 배치는 보존하며 자동 정렬 보기의 드래그는 임시로 적용한다. 다시 모두 펼쳐 상세 표시하면 저장 배치를 복원한다. 기존 보드 위치가 화면 밖에 남지 않도록 보기 위치를 한 번 갱신하며, 찾기로 숨긴 세션을 임시 표시하는 동작과 업무순 정렬도 유지한다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 재사용한다.

## English

- Show a purple status dot, child-task count and a border orbiting every 3.6 seconds while a leader waits for actual delegated work. Honor reduced-motion preferences with a stationary outline.
- Require current task-start evidence or an exactly started and read handoff to a working child. Prioritize resumed foreground work, questions and stopped/completed children without consuming earlier results or changing read receipts.
- Observe authenticated owner waits against the exact running session. Keep UI polling and organizational parent relationships distinct from delegation; poll only concise waiting metadata in the sidebar.
- Repack the board around visible sessions, folded projects and overview headers instead of reserving space for expanded or hidden content.
- Preserve saved full-board placement while allowing temporary dragging in automatic views. Restore saved placement in the fully expanded detailed view and migrate old viewport offsets once.
- Reuse the existing signed 1.8.1.39 Android APK for this Standard EXE release.

## 검증

- 버전 갱신 후 전체 Vitest 261개 파일·2,113개 테스트가 실패·대기 없이 통과했다. 고정 소스의 TypeScript/Vite 프로덕션 빌드·EXE 패키지·공개 다운로드 검사도 통과했다.
- Node 상호작용 검사에서 숨김 전환·임시 드래그·정렬·저장 위치 복원과 실제 화면 맞춤 이후의 보기 버전 갱신을 확인했다. 접힌 카드·축소 화면의 높이와 프로젝트 계층, 원본 설정 보존도 검증했다.
- GUI 자동화, 운영 세션의 입력·중단·재시작과 실제 설치는 수행하지 않았다. 공개 게시와 사용자 PC의 설치·업데이트 확인은 구분한다.

## 패키지 검증

- 제품 소스 `cdf5c60f7239ffa25e07fe286ea01714e35bfb58`를 별도 작업 폴더에 고정하고 독립 복사한 의존성으로 빌드했다. ASAR 런타임·렌더러 426개 파일, Pixel Office 자산·라이선스 20개, 정본 라이선스·제3자 고지를 원본과 대조했다.
- 패키지의 Electron Node 런타임·인증된 HTTP·native PTY로 26개 항목을 확인했다. 리더의 실제 작업 대기, 일반 도구 래퍼를 통한 호출, 정확한 실행 세션 연결, 새 직접 작업 우선, 종료된 작업의 대기 재표시 방지, 이전 결과 보존과 본문 없는 revision 조회가 통과했다.
- 보드 배치 설정 버전 2·3의 수신·복원과 버전 4 거부를 확인했다. 기존 원문·읽음 영수증, Remote·Dashboard 첨부·큐·부모 자식, 보드 종료·재열기 어댑터, 계정 라우팅·내장 스킬과 하위 세션 실행 검사도 통과했다.
- 로컬·공개 EXE의 NSIS CRC `a518f68e`, 내부 압축 데이터 전체와 설치 전 검증 모드가 통과했다. Authenticode 상태는 `NotSigned`다. 설치 파일 실행 검증은 설치·레지스트리 변경·기존 앱 종료 전에 끝나는 전용 검증 모드를 사용했다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.19](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.19).
- 게시: **2026-11-15 23:12:24 KST**. 공개 전체 다운로드 검증: **2026-11-15 23:13:12 KST**.
- **`1.8.2.18` / `1.8.2.17` → 1.8.2.19** 감지를 실제 업데이터로 확인했다. 태그·manifest·EXE·blockmap의 버전·크기·SHA-256이 빌드 원본과 일치한다.
- 기존 설치본은 앱 업데이트를 적용해야 한다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포는 수행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.19-x64.exe` | 156365684 | `e5c9d8d210743ea811e162d15a5bfda82d3a6e9ed508d001a3ccf58214cbdce3` |
| `Acedia-Setup-1.8.2.19-x64.exe.blockmap` | 163380 | `a0d17be72331175bb81c73aec6642dcbeeaf2ecc44b860a85407aeb33d5736d2` |
| `latest-exe.json` | 256 | `f0264e0780f63d3ddaa53071271e41346a4c50f2fd2a4112d959bad8330f79b5` |
