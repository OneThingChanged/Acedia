---
type: Release
title: Acedia 1.8.2.05
status: published
last_updated: 2026-11-06
---

# Acedia 1.8.2.05

- Codex 분산 계정 선택 방식이 수동이면 세션 우클릭의 Restart에서도 계정 선택 창을 표시한다. 실행 중인 세션을 멈추기 전에 기존 선택 창에서 자동 배정 또는 사용 가능한 계정을 선택한다.
- 선택을 취소하면 기존 CLI·대화·스크롤백·화면 배치를 유지한다. 계정을 선택한 뒤 같은 대화를 재개하며 선택한 계정을 다음 실행에 사용한다. 자동 모드와 분산 기능이 꺼진 경우는 기존 계정 정책을 따른다.
- coordinator를 통한 재시작과 모델 변경 후 재시작에도 같은 계정 확인을 적용한다. 모델 설정만 저장한 뒤 계정 선택을 취소하면 기존 CLI는 유지하며 재시작하지 않았음을 반환한다.
- 원격 재시작 요청이 선택 대기 중 만료되면 나중에 계정을 선택해도 CLI를 종료하지 않는다. 수동 선택 창은 데스크톱에 표시되며 공개 API의 요청 결과와 구분한다.
- 기존 서명 APK 1.8.1.39를 재사용한다. 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Show the routed Codex account chooser before restarting a session when account selection is Manual.
- Preserve the existing CLI, conversation, scrollback and pane on cancellation. Resume the same conversation with the chosen account after confirmation.
- Apply the same check to coordinator and model-change restarts. Do not stop a CLI after an external restart request expired while awaiting account selection.

## 검증

- 관련 계정 정책·선택 창·재시작 hook·IPC 계약 4개 파일·46개 검사를 통과했다. 선택 대기 전 CLI 미종료, 취소 보존, 선택 계정과 대화 유지, 중복 재시작 거부, 세션 삭제·분리·요청 만료 시 미실행을 검사했다.
- 전체 223개 파일·1,788개 테스트와 TypeScript/Vite 빌드를 통과했다. 계정 선택 창은 서버 렌더링으로, 재시작 순서는 API 모형으로 검증했다. GUI 자동화나 운영 중인 세션의 재시작은 수행하지 않았다.
- 패키지의 Electron Node 런타임에서 새 요청 유효성 확인 IPC 계약과 Remote/Dashboard 첨부 API·준비 상태 API·서비스 재시작·번들 Git·native PTY 검증을 통과했다.
- EXE의 NSIS CRC `078ee81d`, 압축 파일 전체 검사 및 설치 전 검증 모드의 실제 시작을 통과했다. 설치 파일은 기존 EXE 채널과 같은 미서명(`NotSigned`) 상태다. 기존 설치를 덮어쓰는 작업은 수행하지 않았다.
- 공개 다운로드에서도 SHA-256·NSIS CRC·압축 파일 전체 및 설치 전 검증 모드를 통과했다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.05](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.05).
- 게시: **2026-11-06 04:32:01 KST**. 공개 전체 다운로드 검증: **04:33:01 KST**.
- 제품 소스 커밋: `4b4e62c4660eca4f10f1d42634106cba71420744`.
- 실제 업데이터로 **1.8.2.04 / 1.8.2.03 / 1.8.2.02 → 1.8.2.05** 감지를 확인했다. 공개 세 자산의 크기·SHA-256·태그·manifest가 빌드 원본과 일치한다.
- ASAR 내 소스·렌더러 파일 375개와 Pixel Office 자산·라이선스가 고정 소스와 일치하며 빌드용 minimatch는 런타임 패키지에 없다. 기존 서명 APK 1.8.1.39를 포함한다.
- 앱 업데이트·재시작 후 계정 선택 방식이 수동이면 세션 Restart 전에 계정 선택 창을 표시한다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.05-x64.exe` | 156244343 | `50a2e8c9855b94ce7f536efbbd1126ac738341c22f619c329a1bfbcdaf19be13` |
| `Acedia-Setup-1.8.2.05-x64.exe.blockmap` | 163375 | `399c5711370c561af29b79010ef8b273e7ca9b91faa7518247d897fc0fbcee16` |
| `latest-exe.json` | 256 | `ae4470497ed65ff5f0c7914765db4ffca9e37cd8e8e63f6b4ca4325eb058de69` |
