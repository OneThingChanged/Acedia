---
type: Architecture
title: EXE와 Store 공통 사용자 데이터
description: "배포 채널을 유지하면서 사용자 프로필을 공유하고 기존 데이터를 보존하는 방법."
status: stable
last_updated: 2026-09-10
sources:
  - resource: ../app/electron/services/shared-profile.mjs
    title: 공통 경로·최초 이전·프로세스 잠금
  - resource: ../app/electron/main.mjs
    title: Chromium 및 앱 데이터 연결
  - resource: ../app/scripts/electron-shared-profile-smoke.mjs
    title: 채널 전환과 실행 중 이전 차단 검사
---

# EXE와 Store 공통 사용자 데이터

소스 1.8.0.4부터 EXE와 Store는 설치 ID와 업데이트 채널을 분리하고,
같은 Windows 사용자의 데이터를 공유한다. 이전 문서의 채널별 데이터 분리 정책은
이 문서로 대체한다. 이미 배포된 EXE 1.8.0.3과 기존 Store 빌드는 이 변경을 포함하지 않는다.
양쪽 모두 이 구현을 포함한 새 빌드로 갱신해야 한다.

## 저장과 실행

공통 루트는 사용자 홈의 `.acedia/shared-v1`이다. `profile`에는 프로젝트·세션 목록,
사용자 설정, 추가 계정, SSH 암호화 저장소, 브라우저 로그인 및 실행 복구 정보가 들어간다.
`local`에는 기본 대화 보관 DB, 사용량 DB, hook 및 서비스 설정이 들어간다.
사용자가 지정한 외부 대화 저장 위치는 유지한다.

Chromium의 `userData`와 `sessionData`를 모두 공통 프로필로 지정한다. 프로젝트와
설정은 별도의 동기화 복사본을 주고받는 방식이 아니라 같은 실제 프로필을 사용한다.
EXE 업데이트는 GitHub, Store 업데이트는 Microsoft Store가 계속 담당한다.

공통 프로필당 한 프로세스만 실행한다. 다른 채널이 실행되면 Windows named pipe로
먼저 열린 앱을 활성화하고 새 프로세스는 DB를 열기 전에 종료한다. 채널을 전환하려면
먼저 열린 앱을 트레이까지 완전히 종료한다. 실행 중인 터미널을 다른 프로세스로 넘기지는 않는다.
Company는 분리하며, `MULTIAGENT_ELECTRON_USER_DATA` 또는 `MULTIAGENT_LOCAL_DATA`가
지정된 개발·검증 실행도 공통 프로필을 사용하지 않는다.

AppData 밖을 사용하는 이유는 MSIX의 AppData 쓰기 가상화로 EXE와 Store가 다른 파일을
볼 수 있기 때문이다. Microsoft의 [가상화 설명](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization)에 따르면
사용자에게 쓰기 권한이 있는 AppData 외부의 사용자 프로필 위치는 사용할 수 있다.
Store의 실제 설치 환경에서 공유 경로와 업데이트 후 유지 여부를 확인하는 검사는 별도로 필요하다.

## 최초 이전

1. 기존 EXE/Store 프로필과 Store의 실제 LocalCache 프로필을 찾는다.
2. Chromium/DB 관련 파일을 Windows에서 독점 열기로 검사한다. 사용 중이거나 확인할 수 없으면 이전하지 않는다.
3. 최근 수정된 프로필을 기본 설정·브라우저·대화 DB의 기준으로 복사한다. 프로젝트·세션 카탈로그는 ID별 합집합으로 만들고, 같은 ID는 기준 프로필 값이 우선한다.
4. 추가 Codex 계정과 SSH 암호화 항목을 합친다. 충돌하는 값은 기준 프로필을 우선한다. 계정 데이터는 로컬 파일로만 복사하며 로그나 렌더러로 출력하지 않는다.
5. 다른 프로필의 설정과 별도 대화 DB는 `legacy`에 복사해 보존한다. 서로 다른 SQLite 대화 DB의 내용은 자동 병합하지 않는다. 처음 시작할 때 이 제한과 보존 폴더 열기를 안내한다.
6. 복사한 기본 사용량·대화 DB의 SQLite 무결성을 검사하고, 완료 기록과 함께 staging 폴더를 공통 루트로 바꾼다. 다음 시작부터 이전을 반복하지 않으므로 삭제한 프로젝트가 과거 목록에서 다시 생기지 않는다.

원본 파일은 삭제하거나 수정하지 않는다. 실패한 staging 사본은 복구용으로 남기며
완료되지 않은 루트를 활성 프로필로 사용하지 않는다. 기존 카탈로그 JSON이 손상됐으면
빈 목록으로 대체하지 않고 오류를 표시한다. 대화 목록용 메타데이터 캐시는 이전 후 새 계정 경로에서 재생성한다.

이전 뒤 구버전을 계속 사용하면 구버전의 변경은 예전 저장 위치에만 남는다.
구버전과 새 버전 사이의 실시간 양방향 동기화는 지원하지 않는다.

## 개인정보와 검증

공통 데이터, 계정 파일, 이전 보고서에는 개인정보가 포함될 수 있다. 사용자 홈에만
저장하며 저장소에 복사하거나 커밋하지 않는다. 실수로 프로젝트 루트에 복사한 `.acedia`도
Git ignore 대상이다. 문서와 테스트에는 실제 계정·경로·대화 내용을 넣지 않는다.

검사 명령은 `app/`에서 실행한다.

```powershell
npx vitest run electron/services/shared-profile.test.mjs
npm run electron:shared-profile-smoke
```

실행 검사는 임시 프로필에서 서로 다른 EXE/Store 역할의 Chromium 파일 경로를 사용해
프로젝트와 설정을 이어 읽고, 두 번째 프로세스 및 실행 중인 데이터 이전을 차단한다.
이 검사는 실제 Store 배포·설치 완료를 뜻하지 않는다.
