---
type: Playbook
title: Store 배포 워크프로세스
description: "자연어 요청부터 API 심사 제출·게시 추적까지의 운영 순서와 개인정보 보관 기준."
status: stable
last_updated: 2026-09-09
sources:
  - resource: ../AGENTS.md
    title: 배포 승인 범위
  - resource: ../app/scripts/release-store.mjs
    title: 실행·재개·상태 조회
  - resource: ../app/scripts/setup-store-release.ps1
    title: DPAPI 인증 및 작업 등록
  - resource: ../.gitignore
    title: 비공개 파일 제외 규칙
---

# Store 배포 워크프로세스

## 요청 범위

| 요청 | 실행 범위 |
| --- | --- |
| 스토어 빌드해줘 / 스토어 배포해줘 | 소스 고정 → 버전 결정 → 빌드·검증 → API 업로드 → 인증 제출 → 통과 후 즉시 게시 |
| 지금 뽑은 빌드 기반으로 스토어 빌드해줘 | 해당 빌드의 소스 커밋을 확인하고 Store 규칙에 맞춰 별도 MSIX 생성 |
| 스토어 빌드만 | 로컬 빌드와 검증 |
| 스토어 초안까지만 | API 업로드까지, 인증 제출 제외 |
| 라이브 배포 | GitHub 채널만; Store 별도 요청 필요 |

전체 Store 요청은 최종 제출까지 승인한 것으로 처리한다. 검증이 정상이라면
제출 직전에 다시 승인받지 않는다. 기존 인증 중 제출은 취소하거나 덮어쓰지 않는다.

## 최초 한 번 설정

Partner Center에 Entra 테넌트를 연결하고 제출 권한이 있는 API 앱을 등록한다.
실제 Tenant ID, Client ID, secret 값은 채팅·문서·명령줄 인수에 기록하지 않는다.
프로젝트 루트의 PowerShell에서 다음 명령을 실행하고 프롬프트에 직접 입력한다.

```powershell
pwsh -NoProfile -File app/scripts/setup-store-release.ps1 -ConfigureCredentials
```

Tenant ID와 Client ID는 서로 다른 항목이다. secret은 **secret ID가 아닌 값**을
숨김 입력한다. 저장 성공은 API 인증 성공과 다르므로 온라인 진단까지 확인한다.
같은 Windows 사용자의 관리자 PowerShell에서 Worker/Monitor를 등록한다.

```powershell
pwsh -NoProfile -File app/scripts/setup-store-release.ps1 -InstallTasks
node app/scripts/release-store.mjs doctor --online
```

Worker는 빌드·WACK·업로드를 실행하며 Monitor는 10분마다 제출 상태를 조회한다.
로그인된 Windows 세션이 필요하다. 새 PC/다른 Windows 사용자로 옮기면 인증을
다시 설정한다. 브라우저 로그인은 API의 정상 배포 절차에 필요하지 않다.

## 매번 실행

1. `doctor --online`으로 인증·도구·기존 제출을 확인한다.
2. 대상 소스 커밋과 기존 Store 버전을 확인한다. Store 버전은 기존 게시 버전보다
   큰 `X.Y.Z.0`이어야 한다. 원본 작업 트리와 일반 설치 파일 버전은 보존한다.
3. 실제 변경 사항에 맞는 한국어·영어 릴리스 노트를 JSON으로 만든다.
   개인 경로·계정·로그 없이 사용자에게 보일 내용만 작성한다.
4. `app/`에서 실행한다. 아래 경로는 Git 제외된 로컬 작업 파일의 예다.

```powershell
npm run release:store -- deploy --notes ../.build-tools/store-release-notes.json --background
```

```json
{
  "ko-kr": "이번 버전에 포함된 실제 변경 사항",
  "en-us": "Actual changes included in this release"
}
```

5. 반환된 run ID로 진행 상황을 확인한다. 실행기는 격리 소스에서 의존성 설치,
   전체 테스트, Electron smoke, MSIX 빌드, verifier, packaged/lifecycle smoke,
   WACK을 실행한 후 API 업로드와 commit을 수행한다.
6. 제출 후에는 상태를 조회한다. 공개 설정은 `Immediate`로 유지한다.

```powershell
node app/scripts/release-store.mjs status
node app/scripts/release-store.mjs status --run <RUN_ID>
```

실제 run ID로 `<RUN_ID>`를 치환한다. 실행 중에는 원본 state를 수동 수정하지 않는다.

## 상태 해석과 복구

| API 상태 | 의미 / 다음 행동 |
| --- | --- |
| PendingCommit | 초안. 업로드·제출 완료로 보고하지 않음 |
| CommitStarted / PreProcessing | 제출 요청 접수·패키지 처리 중. 심사 진입과 구분 |
| Certification | 심사 중. 취소·중복 제출 없이 모니터링 |
| Release / Publishing | 게시 처리 중 |
| Published | API 게시 완료. 실제 Store 설치·업데이트 검증은 별도 |
| 실패 또는 알 수 없는 상태 | 오류 확인 후 원인을 해결하고 동일 run 재개 |

```powershell
node app/scripts/release-store.mjs resume --run <RUN_ID> --background
```

재개는 같은 커밋·버전·해시·WACK 증거를 사용한다. 통신 오류 후 create/commit을
무작정 반복하지 않는다. 먼저 서버 상태를 확인하고 불확실하면 중단 상태를 보존한다.
이미 게시한 로컬 실행이나 다른 제출을 재사용하지 않는다.

API 생성 초안은 브라우저에서 저장·수정하지 않는다. 포털은 확인 용도로만 사용한다.
`Acedia`와 관리용 이름의 조회 차이가 발생했던 사례에서는 실제 Product name을
언어별로 확인하고 제출·요청·패키지·스크린샷 해시에 연결한 증거를 남겼다.
이는 특정 실행의 확인 결과이며, 다른 이름 차이를 무조건 무시하는 규칙이 아니다.
자세한 구현과 제약은 [자동화 실행기](store-release-automation.md)를 참고한다.

## 개인정보와 Git 보관 기준

| 위치 / 자료 | 보관 원칙 |
| --- | --- |
| `%LOCALAPPDATA%/Acedia/store-release/credentials.xml` | Git 밖 보관. secret만 DPAPI 암호화, Tenant/Client ID는 파일 안에 평문으로 존재 |
| 같은 폴더의 `runs/`, `backups/` | 계정 정보·개인 경로·원본 응답·스크린샷이 포함될 수 있는 로컬 운영 자료 |
| `.build-tools/`, `.store-release/`, `app/store/private/` | 로컬 작업·비공개 내보내기 전용, Git 제외 |
| `app/electron-dist/` | MSIX, 보고서, state 사본, metadata 등 산출물, Git 제외 |
| `docs/` | 일반 절차와 비식별 검증 결과만. 사용자명 대신 `%LOCALAPPDATA%` 사용 |

암호화된 credentials.xml도 공유하지 않는다. DPAPI는 해당 PC·사용자에 묶여 있으며
Tenant/Client ID나 다른 실행 기록까지 암호화하지 않는다. 토큰·SAS URL이 제거된
API 백업도 개인정보가 완전히 제거된 자료로 간주하지 않는다.

`.gitignore`는 실수로 복사된 credentials XML/JSON, 개인 서명키, Store 응답 파일,
state 사본과 이름 확인 스크린샷을 추가로 제외한다. 공개 제품 ID나 패키지 Identity는
인증 비밀이 아니며 빌드·API 검증에 필요한 코드 값은 유지한다.

커밋 전에는 `git status --short`, `git diff --cached --stat`과 개별 변경 내용을 확인한다.
`git check-ignore -v <경로>`로 제외 규칙을 확인할 수 있다. 이미 추적된 파일에는
ignore가 소급 적용되지 않는다. 과거 커밋·원격 저장소·채팅의 정보도 자동 삭제되지 않는다.
실제 secret 노출이 확인되면 해당 키를 폐기·재발급하고 별도로 기록 정리를 수행한다.

현재 검증된 배포 이력: [1.8.2.0 실행 기록](store-release-1-8-2-0-2026-09-09.md).
