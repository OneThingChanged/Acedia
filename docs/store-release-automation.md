---
type: Playbook
title: Store 자동 배포 실행기
description: "Acedia Store 요청의 승인 범위, Windows 최초 설정, 소스 스냅샷, API 제출 및 재개 절차."
status: draft
last_updated: 2026-09-08
sources:
  - resource: ../AGENTS.md
    title: Store 요청 승인과 채널 범위
  - resource: ../app/scripts/release-store.mjs
    title: 배포 실행기
  - resource: ../app/scripts/store-submission-api.mjs
    title: Microsoft Submission API 클라이언트
  - resource: ../app/scripts/setup-store-release.ps1
    title: 최초 인증 및 Windows 작업 등록
  - resource: ../app/scripts/store-release.test.mjs
    title: 자동화 검증 테스트
  - resource: https://learn.microsoft.com/en-us/windows/uwp/monetize/manage-app-submissions
    title: Microsoft Submission API
---

# Store 자동 배포

“스토어 빌드해줘”는 빌드·업로드·인증 제출·통과 후 즉시 게시 요청이다.
검증 통과 후 제출 승인을 다시 묻지 않는다. “빌드만”, “초안까지만”은 범위를
제한한다. 자동화 구현 요청 자체로 제품을 제출하지는 않는다.

## 최초 설정

현재 구현은 Microsoft Submission API를 직접 호출하며 `msstore` 설치는 필요하지
않다. 웹 브라우저의 개인 Microsoft 계정 로그인과 API 인증은 별개다.

1. Partner Center 계정에 Microsoft Entra 디렉터리를 연결한다.
2. Entra 앱을 등록하고 Partner Center 사용자 관리에서 해당 앱에 제출 가능한
   Manager 역할을 부여한다. Tenant ID, Application Client ID, Client secret
   **값**을 확보한다. 제품은 최초 게시와 연령 등급 설정이 완료되어 있어야 한다.
3. 평소 작업하는 Windows 사용자로 다음 명령을 실행한다. 비밀값은 숨김 입력이며
   Windows DPAPI로 암호화되어 `%LOCALAPPDATA%/Acedia/store-release/credentials.xml`에
   저장된다. Git이나 채팅으로 전달하지 않는다.

   ```powershell
   pwsh -NoProfile -File app/scripts/setup-store-release.ps1 -ConfigureCredentials
   ```

4. **같은 Windows 사용자**의 관리자 PowerShell에서 작업을 등록한다.

   ```powershell
   pwsh -NoProfile -File app/scripts/setup-store-release.ps1 -InstallTasks
   ```

   Worker는 요청 시/로그인 시 실행하며 WACK과 GUI smoke를 위해 높은 권한의
   interactive token을 쓴다. Monitor는 10분마다 조회하며 일반 권한으로 실행한다.
   로그아웃 중에는 실행되지 않고 로그인 후 다시 이어진다. 다른 관리자 계정으로
   등록하면 사용자별 DPAPI와 작업 경로가 달라지므로 사용하지 않는다.

5. 다음 명령으로 실제 제품 조회를 검증한다.

   ```powershell
   node app/scripts/release-store.mjs doctor --online
   ```

API는 `ACEDIA_STORE_TENANT_ID`, `ACEDIA_STORE_CLIENT_ID`,
`ACEDIA_STORE_CLIENT_SECRET` 환경 변수도 지원한다. 예약 작업에서는 현재 셸의
임시 환경 변수가 전달된다고 가정하지 말고 DPAPI 설정을 사용한다.
지원 근거: [Microsoft API 사전 조건](https://learn.microsoft.com/en-us/windows/uwp/monetize/create-and-manage-submissions-using-windows-store-services).

## 명령

아래 npm 명령은 `app/`에서 실행한다.

| 명령 | 범위 |
| --- | --- |
| `npm run release:store -- doctor --online` | 도구/인증 진단과 제출 metadata 백업 |
| `npm run release:store -- backup` | 현재/공개 제출 metadata 백업 |
| `npm run release:store -- local --background` | Store 로컬 빌드와 모든 로컬 검증 |
| `npm run release:store -- draft --notes <JSON> --background` | 빌드·검증·업로드, 인증 제출 없음 |
| `npm run release:store -- deploy --notes <JSON> --background` | 전체 배포 요청 |
| `npm run release:store -- resume --run <ID> --background` | 동일 소스/버전으로 실패 지점부터 재개 |
| `npm run release:store -- resume --run <ID> --submit` | 완료된 draft 실행을 인증 제출까지 진행 |
| `npm run release:store -- resume --run <ID> --submit --notes <JSON> --background` | 검증이 완료된 local 실행을 재빌드 없이 제출로 전환 |
| `npm run release:store -- status --run <ID>` | 실행 기록/해당 제출의 최신 상태 |
| `npm run release:store -- status` | 제품의 현재 제출과 로컬 실행 목록 |

`--background`가 없으면 현재 프로세스에서 실행한다. 이 경우 WACK을 위해 관리자
PowerShell이 필요하다. `resume`도 `--background`가 없으면 현재 프로세스에서 실행한다.

릴리스 노트 JSON은 agent가 실제 변경 내용을 검토해 작성한다.

```json
{
  "ko-kr": "이번 버전에 포함된 실제 변경 사항",
  "en-us": "Actual changes included in this release"
}
```

## 소스와 버전

Git이 추적하는 파일과 ignore되지 않은 새 파일을 별도 실행 디렉터리에 복사한다.
삭제된 파일은 제외한다. 복사 전후 해시를 확인하고 변경 중이면 중단한다.
추적된 credential 형태 파일과 symlink/미분류 submodule은 자동 포함하지 않고 오류로
보고한다. 공개 예제 `.env.example`은 소스에 포함한다. 앱 빌드에 사용하지 않는
`MultiagentSite` 서브모듈은 Git commit만 manifest에 기록하고 복사하지 않는다.
원본 checkout의 index, dirty 파일, 버전, 커밋을 변경하지 않는다.

Store 버전은 `X.Y.Z.0`이며 원본보다 낮아지지 않고 서버의 기존 패키지보다 커야
한다. 원본 `1.8.0.3`은 `1.8.1.0`으로 승격한다. 서버에 더 높은 버전이 있으면
그보다 높은 버전을 선택한다. `--version`으로 지정해도 같은 제약을 검증한다.
로컬 전용 모드는 서버를 조회하지 않으므로 서버 버전 충돌을 보장하지 않는다.

별도 소스 사본의 desktop/mobile metadata와 npm lockfile을 동기화하고 버전 변경을
포함한 로컬 Git 커밋을 생성한다. 이 커밋과 원본 HEAD, 소스 manifest를 기록한다.
APK를 만들지 않으므로 Android versionCode는 증가시키지 않는다. Store 릴리스가
원본 checkout의 버전을 자동 갱신하거나 GitHub 태그/릴리스를 만드는 것은 아니다.
다음 릴리스는 API의 최신 버전을 기준으로 충돌을 방지한다.

## 검증과 제출

실행 순서는 npm ci → 테스트 → Electron smoke → Store build → verifier →
Store packaged smoke → lifecycle smoke → WACK이다. Store builder 자체가
TypeScript/Vite build를 실행한다. WACK은 정확한 버전·Identity, 전체 PASS,
신규 보고서 시각, 보고서/패키지 해시를 결합해 기록한다.

제품 `9NVBSGNRTPLR`과 Identity `jintaenate.MultiAgent`를 고정한다. 서버에서 조회한
기존 listing, 이미지 참조, 가격/시장, 선언과 미지 필드를 유지하고 패키지와
한국어/영어 release notes 및 즉시 게시 모드를 갱신한다. 제출 전 저장된 metadata를
다시 조회해 비교한다. Store는 API commit 이후 패키지 처리를 진행하므로 업로드
완료를 Partner Center의 `Validated`와 동일하게 보고하지 않는다.

기존 pending 제출이 인증 중이면 새 빌드/제출을 시작하지 않는다. 편집 가능한
초안은 준비 당시 fingerprint가 같은 경우에만 재사용한다. API가 UI 생성 초안
수정을 거부하면 중단하고 오류를 보고한다. 자동 삭제·초안 재생성·인증 취소는
구현하지 않았다. API 관리 제출을 웹에서 수정하면 이후 API 변경/commit이
불가능해질 수 있으므로 API로 일관되게 관리한다.
[공식 제출 절차 및 제약](https://learn.microsoft.com/en-us/windows/uwp/monetize/manage-app-submissions)

## 기록과 재개

실행 정보는 `%LOCALAPPDATA%/Acedia/store-release/runs/<ID>/`에 남는다.

- `state.json`: 단계, 소스 커밋, 버전, 패키지 해시, 제출 ID, 오류와 상태
- `source/`: 빌드한 정확한 소스 커밋과 산출물
- `source-manifest.json`: 원본 파일 해시와 원본/스냅샷 대응 정보
- 단계별 `.log`, WACK XML, `submission-before.json`, `submission-after.json`
- `submission-request.json`, `upload.zip`: 재개 시 동일 요청/산출물을 사용

GET과 Blob block upload만 제한적으로 재시도한다. POST create/commit은 응답이
불확실하면 자동 반복하지 않는다. 이미 commit을 시도한 실행은 서버 상태를 먼저
조회한다. 서버가 계속 PendingCommit이거나 생성 결과가 불확실하면 원인 확인이
필요하며 새 제출을 무작정 만들지 않는다. 알려진 살아 있는 프로세스의 lock은
해제하지 않는다. 죽은 프로세스의 lock만 정확한 파일 하나를 제거해 복구한다.

백업은 제출 metadata와 이미지 **참조**를 보존하며 이미지 바이너리 전체의
복원용 export는 아니다. SAS/토큰은 백업·상태 출력에서 제거한다. 인증 실패 보고서
URL의 토큰도 제거하므로 원문 접근은 인증된 API/Partner Center에서 다시 조회한다.

## 현재 검증 범위와 남은 연결

2026-09-08 로컬 진단에서 SDK, Identity, WACK 설치를 확인했다. 후속 실제 빌드
테스트에서 Worker와 Monitor 작업의 등록 완료를 확인했다. API 인증은 아직 연결
전이다. 자동화 테스트는 버전 승격, 소스 격리, metadata
보존, 토큰 제거, 해시 거부, HTTP 재시도 경계를 검증한다.

검증 결과: 전체 테스트 458개(82개 파일), 앱 TypeScript/Vite build, PowerShell
구문 검사, WACK XML 버전 거부/ZIP 생성 검사, OKF 검증(오류 0·경고 0)이 통과했다.
자동화 전용 테스트 15개에는 모의 Store를 통한 전체 제출 순서, 초안 범위 유지,
이미 업로드한 초안의 제출 승격, 필수 검사 누락 차단, 불확실한 commit 중복 방지가
포함된다. 빌드는 기존 큰 JavaScript chunk 경고를 표시하지만 성공했다.

Partner Center를 새로고침해 Submission 4가 현재 Store에 게시된 것을 확인했다.
초기 브라우저 화면의 인증 중 표시는 새로고침 후 게시 완료로 바뀌었다. 기존
인계 문서의 초안 상태는 현재 상태로 사용하지 않는다.

실제 Entra 인증, Store upload/commit 및 새 MSIX/WACK 실행은 아직 검증되지 않았다.
실제품은 이 자동화 구현 과정에서 제출하지 않았다. `Published`는 API 게시 상태이며
Store 설치/업데이트, 사용자 데이터 보존 검증은 별도 Windows 테스트 환경에서
수행해야 한다. 현재 실행기는 이 항목을 `installVerification: pending`으로 남긴다.

작업 제거는 관리자 PowerShell의
`pwsh -NoProfile -File app/scripts/setup-store-release.ps1 -UninstallTasks`로 한다.
이 명령은 자격 증명, 실행 기록, 원본 소스나 Store 제출을 삭제하지 않는다.
