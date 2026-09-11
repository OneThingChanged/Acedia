---
type: Feature
title: 저장 명령과 프로젝트 시작 설정
description: 전역·프로젝트 명령을 관리하고 지정한 폴더와 호스트의 새 셸에서 실행한다.
status: stable
sources:
  - resource: ../app/src/components/SavedCommandsPanel.tsx
  - resource: ../app/electron/services/saved-commands.mjs
  - resource: ../app/electron/services/saved-commands-smoke.mjs
  - resource: ../app/src/lib/spawn.ts
  - resource: ../app/src/App.tsx
---

# 저장 명령과 프로젝트 시작 설정

설정 → 명령 및 시작 또는 프로젝트 속성에서 명령을 추가·수정·삭제한다. 전역 명령은
모든 프로젝트에서, 프로젝트 명령은 해당 프로젝트에서만 선택할 수 있다.
명령 저장은 명시적 버튼으로 수행하며 다른 창의 변경과 충돌하면 다시 불러온다.

대상 프로젝트를 선택하면 로컬 실행 폴더 또는 SSH 호스트와 원격 폴더를 표시한다.
‘새 셸에서 실행’은 그 위치에서 독립된 Shell 세션을 만든다. 명령은 대상 셸 문법으로
작성해야 한다. 로컬 폴더가 없거나 SSH 호스트를 찾을 수 없으면 실행을 거부한다.
SSH 호스트가 없다고 로컬 컴퓨터에서 대신 실행하지 않는다.

프로젝트 시작 명령을 지정하고 자동 실행을 켜면 사용자가 프로젝트를 클릭할 때
앱 실행당 한 번 실행한다. 기본값은 꺼짐이며 앱 시작·화면 복원만으로 실행하지 않는다.
같은 앱의 여러 창에서도 한 번만 실행한다. 실행 실패 시 자동 재시도하지 않으며
‘새 셸에서 실행’으로 직접 재시도할 수 있다. 시작 명령 삭제 시 연결도 제거한다.

명령 세션에는 생성 시 명령을 복사한다. 저장 목록의 변경이 기존 세션을 수정하지 않는다.
해당 Shell 세션을 다시 시작하면 복사된 명령이 다시 실행된다. 시작 설정 변경은
실행 중인 프로세스에 영향을 주지 않는다. 저장 위치는 앱 프로필의 `saved-commands.json`이다.

## 검증

단위 테스트로 범위 제한, 저장·재읽기, 잘못된 입력, 중복 시작 방지와 SSH 대상 전달을
확인한다. 숨김 Electron에서 실제 IPC·ConPTY로 임시 폴더에 명령을 실행해 작업 위치를
검증했다. 설정 화면에서 명령 작성·저장·실행 요청·시작 명령 선택과 자동 실행 토글을
확인했다. 실제 SSH 서버 실행은 별도 확인 대상이다.

명령: `npm test`, `npm run build`, `npm run electron:bridge-smoke`,
`npm run electron:settings-search-smoke` (`app/`에서 실행).
