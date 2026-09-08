---
okf_version: "0.2"
title: "Acedia 1.8.x release handoff"
description: "2026-09-08 current release state, Microsoft Store draft, unfinished language/settings work, and next-session procedure."
type: "Handoff"
status: "draft"
last_updated: "2026-09-08"
sources:
  - id: release-metadata
    resource: ../app/package.json
    title: Desktop release metadata
  - id: release-guide
    resource: microsoft-store-release-guide.md
    title: Microsoft Store release guide
  - id: release-playbook
    resource: release-playbook.md
    title: Release channel and updater policy
  - id: store-record
    resource: microsoft-store-msix-plan.md
    title: Microsoft Store delivery and certification record
  - id: github-release
    resource: https://github.com/OneThingChanged/Multiagent/releases/tag/v1.8.0.0
    title: Acedia 1.8.0.0 GitHub release
---

# Acedia 1.8.x 릴리스 인수인계

> 후속 자동화 정책: [Store 자동 배포 실행기](store-release-automation.md)와
> `AGENTS.md`의 Store 요청 규칙을 우선한다. 아래 초안/최종 확인 절차는 인계 당시
> 기록이며 현재 상태가 아니다. “스토어 빌드해줘” 요청은 정상 검증 후 인증 제출과
> 자동 게시까지 승인한다. 실제 제출 상태는 매번 Partner Center/API로 조회한다.
>
> 2026-09-08 후속 실시간 확인: Partner Center 개요를 새로고침한 결과
> “Your latest product is now available on Microsoft Store”와
> “Store presence (Submission 4)”가 표시되었다. Submission 4는 게시 완료 상태다.
> 이 확인 과정에서는 제출·취소·패키지 변경을 실행하지 않았다. 아래의 초안 상태는
> 과거 기록으로 보존한다.

이 문서는 2026-09-08 세션 종료 시점의 실제 상태와 다음 세션의 시작 절차를
기록한다. 기존 [Microsoft Store 배포 운영 가이드](microsoft-store-release-guide.md)의
일반 절차는 계속 유효하지만, 그 문서의 오래된 **현재 상태**보다 이 문서의 상태
기록을 우선한다.

## 다음 세션에서 가장 먼저 할 일

1. `AGENTS.md`와 이 문서를 읽는다.
2. `git status --short`로 작업 트리를 확인하고 기존 변경을 보존한다.
3. 아래의 **릴리스 선택**을 사용자와 확정한다.
   - 현재 Store 초안 `1.8.0.0`을 그대로 인증 제출한다.
   - 언어·설정 UX 변경을 마무리해 `1.8.1.0`으로 교체한 뒤 인증 제출한다.
4. 사용자가 선택하기 전에는 Partner Center의 **Submit for certification**을
   누르지 않는다.
5. `1.8.1.0`을 선택하면 현재의 미커밋 변경을 먼저 감사하고 테스트를 통과시킨다.
   기존 Store 초안을 그대로 제출하거나 새 패키지를 업로드하지 않는다.

## 현재 제품과 배포 채널

| 항목 | 현재 값 |
| --- | --- |
| 제품 표시 이름 | Acedia |
| 제품 버전 | `1.8.0.0` |
| npm 호환 버전 | `1.8.0` |
| 현재 커밋 | `b38f7bd feat: rebrand MultiAgent as Acedia 1.8.0.0` |
| GitHub 릴리스 | `v1.8.0.0`, 공개 완료 |
| GitHub 릴리스 URL | `https://github.com/OneThingChanged/Multiagent/releases/tag/v1.8.0.0` |
| Microsoft Store 제품 ID | `9NVBSGNRTPLR` |
| Store 패키지 Identity | `jintaenate.MultiAgent` 유지 |
| 딥 링크 | `multiagent://` 유지 |
| 지원/Q&A | `https://github.com/OneThingChanged/MultiagentSite/issues` |
| 새 질문 | `https://github.com/OneThingChanged/MultiagentSite/issues/new/choose` |
| 공개 제품 사이트 | `https://onethingchanged.github.io/MultiagentSite/` |
| 개인정보처리방침 | `https://github.com/OneThingChanged/MultiagentSite/blob/main/PRIVACY.md` |

`Acedia`는 표시 이름과 산출물 이름이다. Store 업데이트 연속성, 설치 인식,
사용자 데이터 호환성을 위해 내부 패키지 Identity와 딥 링크는 의도적으로
`MultiAgent` 값을 유지한다.

2026-09-08 확인 결과 `OneThingChanged/Multiagent`와
`OneThingChanged/MultiagentSite` 저장소는 둘 다 아직 **PUBLIC**이다. 메인 소스
저장소를 비공개로 전환한다는 결정은 문서에는 반영되어 있지만 실제 GitHub
가시성 변경은 아직 완료되지 않았다. 비공개 전환은 릴리스 다운로드와 Company
업데이터에 미치는 영향을 다시 확인한 뒤 별도로 실행한다.

## Microsoft Store 현재 상태

Partner Center 제품 개요:

`https://partner.microsoft.com/en-us/dashboard/products/9NVBSGNRTPLR/overview`

현재 작업 대상은 **Submission 4**, 제출 ID
`1152921505701830571`이다. 아직 인증 제출하지 않은 **In draft** 상태다.

| 제출 항목 | 마지막 확인 상태 |
| --- | --- |
| Pricing and availability | `Unchanged` |
| Properties | `Unchanged` |
| Age ratings | `Complete` |
| Packages | `Updated`, 새 Acedia 패키지 `Validated` |
| Store listings | `Updated` |
| Submission options | `Unchanged` |
| Submit for certification | 활성화되어 있으나 누르지 않음 |

Submission options는 인증 통과 후 즉시 게시하도록 저장되어 있다. 따라서 최종
제출을 누르면 인증 통과 뒤 자동으로 공개될 수 있다.

### 현재 초안에 저장된 패키지

| 항목 | 값 |
| --- | --- |
| 파일 | `app/electron-dist/store/Acedia-Store-Release-1.8.0.0-x64.msix` |
| 크기 | `157645150` bytes |
| SHA-256 | `D186FA54065E973792833F3DBCCAED22294B83EA1020F94C43F11F91949CB478` |
| Partner Center 상태 | `Validated` |

새 `1.8.0.0` 패키지를 저장하면서 이전
`MultiAgent-Store-Release-1.7.2.0-x64.msix`는 상위 버전 패키지가 있다는 이유로
초안에서 제거되었다. Packages 화면에서 정확한 Acedia 파일명과 버전을 다시
확인한 뒤에만 제출한다.

### Store listing 변경 사항

- 한국어와 영어 제품 이름을 `Acedia`로 선택하고 저장했다.
- 한국어와 영어 설명에서 `MultiAgent` 표기를 `Acedia`로 교체했다.
- 릴리스 노트와 Short title을 Acedia 기준으로 갱신했다.
- 두 언어의 Desktop 스크린샷을 갱신하고 각 listing을 저장했다.

현재 이미지 자산:

- `app/store/listing/screenshots/acedia-store-primary.png`
- `app/store/listing/screenshots/acedia-store-en.png`
  - 1701×925 PNG
  - SHA-256: `51D6DE9CA46FEAF59CF1BFB96A30AAC23AD594E0D886289FA354D6CA311178E3`
- `app/store/listing/screenshots/multiagent-store-primary.png`은 이전 이름의 보관본이다.

`acedia-store-en.png`은 현재 Git에서 추적되지 않은 파일이므로 `1.8.1.0` 커밋을
만들 때 포함 여부를 명시적으로 결정한다.

## 완료된 `1.8.0.0` GitHub 배포

GitHub Release `v1.8.0.0`은 공개 완료되었으며 다음 핵심 산출물을 포함한다.

- `Acedia-Setup-1.8.0.0-x64.exe`
- `Acedia-Setup-1.8.0.0-x64.exe.blockmap`
- `latest.yml`
- `Acedia-Mobile.apk`
- `Acedia-Mobile.metadata.json`
- `github-release.metadata.json`

이 릴리스는 Acedia 전환 시점의 배포 기록이다. 현재 진행 중인 언어·설정 UX
변경은 포함하지 않는다.

## 미완료 `1.8.1.0` 언어·설정 UX 작업

사용자는 다음 Store 제출에 언어 기능과 설정 UX 개선을 포함하고 싶다고 했다.
현재 작업 트리에는 이 작업과 관련된 다수의 **미커밋 변경**이 있다.

확인된 방향:

- 설정에 독립된 Language 페이지 추가
- 한국어·영어 외에 중국어 간체, 중국어 번체(대만), 일본어, 스페인어 추가
- 에이전트 계정과 실행 기본값을 포함한 Agents 설정 재구성
- 설정 내비게이션, 검색, 모달과 공통 UI의 번역 적용 범위 확대
- locale 카탈로그와 번역 테스트 추가

관련 변경은 최소한 다음 영역에 걸쳐 있다.

- `app/src/components/SettingsModal.tsx`
- `app/src/components/AgentsSettings.tsx`
- `app/src/lib/appLanguage.tsx`
- `app/src/lib/locales/`
- `app/src/lib/agentDefaults.ts`
- 여러 설정·모달·사용량 UI와 테스트 파일
- `docs/workspace-interactions.md`, `docs/codex-accounts.md`, `docs/log.md`

중요한 상태:

- 앱 메타데이터는 여전히 `1.8.0.0`이다.
- `1.8.1.0` 커밋, 태그, GitHub Release, Store MSIX는 아직 만들지 않았다.
- 현재 변경 전체가 하나의 릴리스로 통과했다는 최종 검증 기록도 아직 없다.
- 다른 작업자의 변경일 수 있으므로 현재 dirty 파일을 되돌리거나 덮어쓰지 않는다.

### `1.8.1.0`으로 진행할 때

제품 버전은 세 자리 `1.8.1`이 아니라 네 자리 **`1.8.1.0`**으로 맞춘다.

1. 현재 diff를 기능별로 검토하고 미완성 코드와 실패 테스트를 찾는다.
2. 번역 fallback, 저장 후 재시작 유지, 설정 검색, 기존 사용자 설정 호환성을
   확인한다.
3. 앱의 기본 검증을 실행한다.

   ```powershell
   cd "K:\AI\MultiAgent\app"
   npm test
   npm run build
   npm run electron:smoke
   ```

4. 버전을 한 커밋 안에서 동기화한다.
   - `app/package.json`: npm `1.8.1`, 제품 `1.8.1.0`
   - `app/package-lock.json`: npm `1.8.1`
   - 설치 파일명과 제거 프로그램 표시 이름: `1.8.1.0`
   - `mobile/package.json`: npm `1.8.1`, 제품 `1.8.1.0`
   - `mobile/app.json`: `version`을 `1.8.1.0`, APK도 배포하면 `versionCode` 증가
5. GitHub와 Store 채널을 각각 별도로 빌드하고 검증한다.
6. Store를 `1.8.1.0`으로 제출할 경우 Submission 4의 Packages에서
   `1.8.1.0` MSIX를 업로드하고 저장한 뒤, `1.8.0.0`이 제거되었는지 확인한다.
7. Store listing의 릴리스 노트를 `1.8.1.0` 기능에 맞게 수정한다.
8. 모든 항목과 정확한 패키지 파일명을 다시 확인하고 사용자 승인 후 인증
   제출한다.

## 배포 채널 분리 규칙

| 채널 | 용도 | 업데이트 방식 | 실행 조건 |
| --- | --- | --- | --- |
| Standard 개발자 빌드 | 소유자 로컬 사용 | 설정한 로컬 output 폴더에서 최신 네 자리 버전 installer 탐색 | 로컬 빌드 요청 |
| Company | 비공개 배포 | 전용 GitHub updater | Company 배포 명시 |
| Microsoft Store | 일반 사용자 | Microsoft Store가 설치와 업데이트 관리 | 사용자가 Store 배포를 명시 |

사용자가 **라이브 배포**라고만 하면 Git 저장소와 GitHub Release 채널만
대상이다. Store MSIX 빌드, Partner Center 업로드와 인증 제출은 자동으로
포함하지 않는다. 두 채널을 함께 요청해도 각각 독립적으로 검증한다.

Standard 개발자 빌드는 `1.7.2.0` 이후 GitHub updater가 아니라 사용자가
지정한 로컬 `app/electron-dist/` 계열 output 폴더에서 최신 installer를 찾는다.
Store 빌드는 Electron updater를 사용하지 않는다.

## Store 빌드와 제출 절차

### 1. 소스와 버전 확인

```powershell
cd "K:\AI\MultiAgent"
git status --short
git diff --check
git log -5 --oneline --decorate
```

제출할 커밋, 네 자리 제품 버전, `app/package.json`의
`multiAgentReleaseVersion`, Partner Center의 기존 최고 버전을 서로 대조한다.

### 2. Store MSIX 빌드와 검증

```powershell
cd "K:\AI\MultiAgent\app"
npm run release:build:store
npm run release:verify:store
```

metadata에 기록된 파일명, 버전, 크기, SHA-256과 실제 MSIX를 대조한다. 같은
폴더에 이전 산출물이 남아 있을 수 있으므로 최신 수정 시각만 믿지 않는다.

### 3. WACK

관리자 PowerShell에서 목표 metadata를 명시한다.

```powershell
cd "K:\AI\MultiAgent\app"
pwsh -NoLogo -NoProfile -File .\scripts\test-electron-store-wack.ps1 `
  -MetadataPath .\electron-dist\store\Acedia-Store-Release.metadata.json
```

`app/electron-dist/store/wack-report.xml`의 수정 시각이 목표 MSIX보다 늦고,
보고서가 정확한 목표 패키지를 검사했는지 확인한다.

### 4. Partner Center 패키지 업로드

1. 새 업데이트를 하나만 만든다.
2. Packages에서 검증된 MSIX 하나만 올린다.
3. `Validated`와 정확한 파일명·버전·크기를 확인한다.
4. Windows 10/11 Desktop만 대상으로 유지한다.
5. 페이지 아래 **Save**를 누른다.
6. Overview에 돌아와 Packages가 `Updated`인지 확인한다.

내장 브라우저는 DOM 버튼, 텍스트, 라디오, 체크박스와 일부 드롭다운은
자동화할 수 있지만 Windows 네이티브 파일 선택기는 제어하지 못한다. 파일
업로드는 일반 Chrome에서 Partner Center URL을 열고 직접 수행한다.

실무 절차:

1. 업로드할 정확한 경로를 클립보드에 복사한다.
2. `browse your files` 또는 이미지 `+`를 누른다.
3. 파일 선택 창의 파일명 칸에 `Ctrl+V`, `Enter`를 누른다.
4. 분석 완료까지 기다린다.

`Paused`, `null Bytes`, 중복 오류가 생기면 실패한 행의 **Delete**만 누르고
페이지 아래 **Save**로 삭제를 확정한다. 정상적으로 크기와 버전이 표시된
`Validated` 행은 삭제하지 않는다.

### 5. 공개와 listing 확인

- Markets: All worldwide markets
- Audience: Public audience
- Discoverability: available and discoverable in Microsoft Store
- 가격: 무료
- Release: as soon as possible
- Stop acquisition: never
- 한국어와 영어 이름, 설명, 기능, 릴리스 노트, 스크린샷을 언어별로 열어 저장
- Submission options: 인증 통과 후 즉시 게시

Partner Center의 Overview 표시는 늦게 갱신될 수 있다. `Updated`만 믿지 말고
Packages와 각 Store listing을 직접 열어 저장된 값을 확인한다.

### 6. 최종 제출

다음을 모두 만족할 때만 사용자에게 최종 확인을 받고 **Submit for
certification**을 누른다.

- 정확한 버전의 패키지 하나가 `Validated`
- 필수 제출 항목이 `Complete`, `Updated` 또는 의도한 `Unchanged`
- 한국어와 영어 listing 저장 완료
- 공개 범위와 자동 게시 설정 확인
- 배포 기록에 커밋, 패키지 크기, SHA-256 기록

접수 후 `Update in certification`과 제출 번호가 보이는지 확인한다. 인증 중에는
구체적인 오류나 Microsoft 요청이 없는 한 취소하지 않는다.

## `runFullTrust` 처리 원칙

`runFullTrust`는 악성 코드나 관리자 권한 상승을 뜻하지 않는다. Electron 기반
Acedia가 UWP 샌드박스 밖에서 사용자가 선택한 PowerShell, Command Prompt,
Git, CLI 에이전트와 PTY를 실행하기 위한 packaged desktop app capability다.
앱은 `allowElevation`을 선언하지 않고 드라이버나 서비스를 설치하지 않는다.

Submission 4에서는 기존 승인 또는 제출 값이 이어져 restricted capability
설명란이 다시 나타나지 않았다. 경고 문구 자체는 정상이며 패키지 검증 실패가
아니다. Microsoft가 다시 설명을 요구하면
`docs/microsoft-store-release-guide.md`의 **runFullTrust 설명**을 그대로 사용한다.
핵심 기능을 깨뜨리므로 구체적인 인증 거절 사유 없이 capability를 제거하지
않는다.

## 다음 세션용 완료 기준

### `1.8.0.0` 초안을 제출하는 경우

- Submission 4의 Acedia 패키지와 listing을 최종 재확인한다.
- 사용자에게 자동 공개 조건을 알리고 최종 승인을 받는다.
- 인증 제출 후 제출 번호와 상태를 기록한다.
- 언어·설정 UX 변경은 별도 `1.8.1.0` 작업으로 계속한다.

### `1.8.1.0`으로 교체하는 경우

- dirty tree 변경을 감사하고 모든 테스트·빌드를 통과시킨다.
- 네 자리 버전과 Android versionCode를 동기화한다.
- 커밋과 요청된 채널만 배포한다.
- 새 Store MSIX를 빌드·검증·WACK하고 Submission 4에 교체한다.
- listing과 릴리스 노트를 갱신한 뒤 사용자 승인으로 인증 제출한다.

## 다음 세션 시작 프롬프트

다음 문장을 새 세션 첫 요청으로 사용할 수 있다.

> `AGENTS.md`와 `docs/acedia-release-handoff-2026-09-08.md`를 먼저 읽어줘.
> 기존 dirty worktree를 절대 되돌리지 말고 언어·설정 UX 변경 상태부터
> 감사해줘. 현재 Partner Center Submission 4는 Acedia 1.8.0.0 초안이며 아직
> 인증 제출하지 않았다. 1.8.0.0을 그대로 제출할지, 변경을 마무리해 1.8.1.0
> 패키지로 교체할지 먼저 판단 근거와 함께 보고하고 내 확인 전에는 Submit for
> certification을 누르지 마.
