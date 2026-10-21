---
type: Feature
title: 에이전트 고급 실행 설정
description: 로컬 세션의 기본 모델·effort·Fast와 CLI 실행 파일, 추가 인수, 환경변수의 적용 범위.
tags: [settings, agents, sessions]
status: stable
last_updated: 2026-10-22
sources:
  - resource: ../app/src/components/AdvancedLaunchOptions.tsx
  - resource: ../app/src/components/AgentsSettings.tsx
  - resource: ../app/src/components/SessionPropertiesModal.tsx
  - resource: ../app/src/lib/agentDefaults.ts
  - resource: ../app/src/lib/newSessionPreferences.ts
  - resource: ../app/src/lib/spawn.ts
  - resource: ../app/electron/shared/launch-options.mjs
  - resource: ../app/electron/services/agent-launch.mjs
  - resource: ../app/scripts/electron-advanced-launch-smoke.mjs
  - resource: ../app/src/components/ChatModelPicker.tsx
  - resource: ../app/src/lib/chatSessionModel.ts
  - resource: ../app/electron/services/session-model-service.mjs
  - resource: ../app/electron/services/session-model-memory.mjs
  - resource: ../app/electron/services/session-model-defaults.mjs
  - resource: ../app/src/components/DefaultSessionModelSettings.tsx
  - resource: ../app/scripts/codex-session-settings-smoke.mjs
  - resource: ../app/scripts/electron-chat-model-smoke.mjs
---

# 에이전트 고급 실행 설정

설정 → 에이전트 → 도구 탭의 **고급 실행 설정**에서 로컬 Codex, Claude,
Qwen, Cline의 실행 환경을 편집한다. 기존 계정 선택, 권한 확인 생략,
Alt-screen, 작업자 프리셋은 기존 실행 옵션에서 설정한다.

| 항목 | 사용 방법 |
|---|---|
| CLI 실행 경로 | 자동 감지 또는 직접 지정. 직접 지정은 전체 경로를 입력하거나 찾아보기로 실행 파일을 선택한다. |
| 추가 실행 인수 | 한 행에 인수 하나를 입력한다. 공백이 있어도 둘러싸는 따옴표를 추가하지 않는다. 빈 행은 전달하지 않는다. |
| 환경변수 | 이름과 값을 입력한다. 값은 기본적으로 가려지며 표시/숨김으로 확인한다. 값이 비어 있으면 빈 문자열을 전달한다. |
| 고급 설정 초기화 | 이 편집기의 경로·인수·환경변수만 초기화한다. 계정 및 기존 실행 옵션은 유지한다. |

도구 기본값의 경로·인수·환경변수는 포커스를 옮기거나 Enter를 누르면 저장한다.
기본값의 선택·행 삭제·초기화는 바로 반영한다. 기존 세션 속성에서는 입력을 초안으로
유지하고 **변경 저장**을 눌러 반영한다. 잘못된 경로 형식, 중복 변수, 보호된 변수, 제어 문자는 오류로 표시하며
유효하지 않은 초안은 저장하지 않는다. 새 프로젝트·세션 생성도 유효한 입력이 필요하다.
파일 선택 취소는 값을 바꾸지 않는다. 저장 실패는 설정 화면에서 표시한다.

## 적용 범위

* 도구별 기본값은 기존 로컬 저장소 키 `multiagent.agentDefaults.v1`에 저장한다.
  다른 창의 변경은 설정 화면에 동기화된다.
* **새 세션**은 마지막으로 생성한 세션의 AI 도구와 도구별 Dangerous 모드 켜짐·꺼짐을
  `multiagent.newSessionPreferences.v1`에 별도로 기억한다. 생성창을 다시 열거나 앱을
  재시작해도 복원하며, 취소하거나 생성에 실패한 선택은 저장하지 않는다. 기억한 도구가
  비활성화·제거되면 사용 가능한 도구를 선택한다. 자식 세션은 사용 가능한 부모 도구를
  우선한다. 계정·Alt-screen·worker·고급 옵션은 계속 설정 화면의 기본값을 사용한다.
* 새 로컬 프로젝트의 첫 세션과 새 세션은 생성 시 기본값을 복사한다. 생성 창에서
  고급 설정을 변경하거나 초기화하면 해당 세션에만 적용한다.
* 기존 세션은 세션 속성 → 실행 옵션에서 직접 편집한다. **현재 기본값 불러오기**는
  현재 도구 기본값을 세션 편집 초안에 복사한다. **변경 저장** 후 그 세션에 적용하며
  이후 기본값을 바꿔도 기존 세션은 변하지 않는다. 탭 이동·취소·충돌 처리는
  [세션 속성](properties-and-usage.md)을 따른다.
* 변경은 다음 실행부터 반영된다. 실행 중이면 비활성화한 뒤 다시 열어 적용한다.
  설정 변경만으로 프로세스를 종료하거나 대기 세션을 시작하지 않는다.
* 공개 로컬 API와 `acedia_session_settings` MCP로 기존 로컬 세션의 Dangerous 값을
  조회·저장할 수 있다. OFFLINE 대상도 지원하며 디스크 저장 확인 후 다음 실행에 적용한다.
  세션을 선택하거나 포커스를 옮기지 않는다. [요청·응답과 적용 범위](workspace-mcp.md#기존-세션-dangerous-설정)를 따른다.
* 설정이 없던 기존 세션은 기존 실행 방식을 유지한다. 앱 재시작과 창 이동 시 세션에
  저장된 설정을 복원한다.
* SSH에는 로컬 고급 기본값을 복사하거나 전달하지 않는다. SSH의 추가 옵션은 SSH 연결
  인수이며 이 기능과 별개다. 원격 CLI 경로·인수·환경변수 편집은 후속 범위다.

환경변수 값은 다른 실행 설정과 함께 로컬 프로필에 저장된다. 화면의 값 가리기는
표시 기능이며 별도의 자격 증명 저장소가 아니다. 계정 로그인 정보는
[Codex 계정](codex-accounts.md)과 [Claude 계정](claude-accounts.md) 기능에서 관리한다.

## 실행 규칙

데스크톱 채팅 입력창 아래의 **모델 버튼 하나**에서 모델과 effort를 함께 변경한다.
모델과 추론 강도를 선택하고 **적용**을 누르면 같은 계정·대화 ID를 유지한 채 CLI를
다시 시작해 다음 메시지부터 사용한다. 진행 중인 작업, 질문·로그인 확인, 예약 메시지가
있으면 적용할 수 없다. 적용 중에는 전송과 대기열 처리를 잠시 막으며 작성한 메시지와
첨부를 유지한다. 터미널로 전환했다 돌아와도 적용 중 전송 차단을 유지한다.
종료된 세션도 기존 대화 파일이 확인되면 다른 모델을 선택해 다시 시작할 수 있다.
자식 세션에서 변경하면 모델 상속을 끄고 해당 세션에만 저장하며 부모 설정은 유지한다.
보조 작업창은 설정 확인을 지원하고 변경은 기본 작업창에서 진행한다. Company에서도
로컬 채팅 설정을 변경할 수 있으며 Remote·Tunnel 기능은 기존 비활성 상태를 유지한다.

Remote와 로컬 Dashboard에서는 Codex·Claude 세션을 우클릭한 뒤 **모델 / effort 변경**을
선택한다. 모바일은 세션 상단 **모델 / effort** 버튼을 사용한다. 선택창에 프로젝트·세션명,
최근 대화 또는 실행 시 확인된 모델, 저장된 다음 실행 설정과 계정 이름을 표시한다.

**저장 (다음 시작)**은 실행 중인 작업을 유지한다. **저장 후 재시작**은 작업이 끝난 세션에서
기존 대화 ID와 계정을 확인한 뒤 같은 대화를 복원한다. 새 CLI의 시작 hook 또는
Codex의 비어 있는 실제 입력창을 확인해야 재시작 성공을 표시한다. hook이 없는 Codex도
입력이 안정된 뒤 작업·질문·초안·대기열이 없는 입력 대기를 확인하면 적용할 수 있다.
현재 값과 같은 설정에는 이미 적용되었다는 안내를 표시한다.
대화 파일·계정·새 CLI 준비 확인에 실패하면 오류를 표시하며 저장된 설정은
유지한다. SSH와 다른 도구는 현재 지원하지 않는다. 기본 CLI 설정 파일은 변경하지 않는다.

Codex는 해당 세션의 실제 로그인 또는 분산 계정에서 `model/list`를 조회하고, 모델별로
지원하는 effort만 제공한다. Claude는 설치된 `claude --help`에서 모델 별칭과 effort 옵션을
읽는다. 이 목록은 계정 권한 목록이 아니며 실제 접근 권한과 모델별 effort 지원은 Claude가
실행 시 검증한다. 기존 Claude 대화에서 사용한 전체 모델 ID도 선택할 수 있다.
고급 실행의 `--model`·`--effort` 또는 Codex `model`·`model_reasoning_effort` 설정과 충돌하면
적용하지 않고 해당 옵션을 제거하도록 안내한다.

### Acedia 기본 모델

1.8.1.77에서 **설정 → 에이전트 → Codex / Claude → 기본 모델**을
추가했다. 모델·effort를 선택하고 **기본 모델 저장**을 누른다. Codex는 Fast의 기본
켜짐·꺼짐도 지정할 수 있다. 기본 모델 목록은 선택한 기본 계정 또는 분산 계정에서
조회하며, Claude 목록은 설치된 CLI의 옵션을 사용한다.

| 도구 | 초기 모델 | 초기 effort | 초기 Fast |
|---|---|---|---|
| Codex | `gpt-6.1-sol` | `xhigh` | 꺼짐 (`default`) |
| Claude | `sonnet` | `medium` | 제공하지 않음 |

세션에 명시적으로 지정하거나 마지막으로 기억한 모델이 우선한다. 모델 설정이 없는
로컬 세션의 실행에만 Acedia 기본값을 적용한다. 기본값으로 한 번 시작한 세션도 이후
확인한 모델·effort·Fast를 세션별로 기억하므로 전역 기본값을 바꿔도 해당 선택은 유지된다.
effort의 **모델 기본값**은 그 모델의 CLI 기본 effort를 사용한다. 모델 설정이 존재하지만
effort를 생략한 세션에 전역 effort를 덧붙이지 않는다. SSH와 다른 CLI 도구는 제외한다.
호스트가 적용하므로 Remote에서 시작하는 로컬 세션에도 같은 규칙을 사용한다.
고급 실행에서 모델·effort 또는 서비스 티어를 직접 지정하면 기존 충돌 처리 규칙을 유지한다.

앱 프로필의 `session-model-defaults.json`에 저장하며 CLI 설정 파일은 변경하지 않는다.
계정에서 제공하지 않는 모델·effort, 다른 창의 저장 이후 오래된 값은 저장을 거절한다.
목록 조회나 파일 저장 실패를 화면에 표시하고 입력값을 보존한다. 모델 목록만 조회해서
기본값을 자동 변경하거나 실행 중인 세션을 재시작하지 않는다. 실제 계정의 접근 권한과
Claude 모델별 effort 지원은 CLI가 실행 시 확인한다.

검증: 최종 전체 188개 파일·1,357개 검사, TypeScript/Vite 빌드, Electron 설정창의 저장·복원,
모델별 effort 전환·Codex/Claude 분리·저장/조회 실패·늦은 조회 응답 무시를 통과했다.
설정 검색 123개 항목과 800/1202/1920px 배치도 확인했다. 검증은 격리된 프로필과
fixture 계정을 사용하며 실제 로그인 계정에 모델 요청을 보내지 않는다. 실제 앱의 기본
설정 IPC와 Remote의 1024/390px 모델 선택창도 확인했다. 출력 연결 종료에 대한
[Electron EPIPE 검증](development-and-build.md#closed-console-output)도 통과했다.

### 세션별 마지막 실행 설정

2026-10-10 소스 변경부터 로컬 세션의 마지막 모델·effort와 확인된 Codex Fast
상태를 앱 프로필의 `session-model-memory.json`에 저장한다. CLI 기본 설정 파일을
수정하지 않고 다음 실행에 해당 모델·추론 강도·서비스 티어 인수를 전달한다.
수동 종료·휴면·재시작·정상 종료·앱 종료 전에 값을 보존하며 앱을 다시 열어도 복원한다.
자동 복원은 같은 세션 ID·도구·계정·작업 폴더에 적용한다. SSH와 일반 Shell은 제외한다.

Codex 분산 세션은 기본 대화의 `thread/settings/updated` 알림과 실제 입력창 아래의
모델·effort 상태줄로 다음 메시지 전의 변경까지 관찰한다. 작업자 대화의 설정은
제외한다. 일반 Codex도 같은 상태줄을 읽으며, Codex·Claude는 최근 대화 기록으로
확인 가능한 값을 보완한다.
Claude가 모델 별칭을 전체 ID로 기록하며 effort를 생략해도 마지막 확인한 effort는
유지한다. native 설정에서 추론 강도가 기본값으로 돌아온 경우에는 이전 명시값을 복원하지 않는다.
Fast 표시가 없거나 대화 기록에 서비스 티어가 없으면 Off로 추정하지 않고 마지막
확인값을 유지한다. Claude Fast는 이 구현 범위에 포함하지 않는다.

[1.8.1.78](release-1-8-1-78.md)에서 effort 바로 뒤의 `xhigh fast`·`max ultrafast` 형식도
읽도록 보완했다. 이전 감지기는 괄호 또는 별도 상태 항목의 Fast만 인식해 변경값을
놓칠 수 있었다. 분산 대화의 오래된 native 모델 정보보다 새로 바뀐 상태줄을 우선하고,
그 값을 유지해 모델 선택창 등으로 상태줄이 가려져도 이전 모델로 돌아가지 않는다.
새 설정 알림 직후 남아 있는 이전 화면은 알림 시점의 상태줄과 비교해 제외한다.
native `priority`가 화면에서 `fast`로 표시되면 확인된 서비스 티어 값을 유지한다.

[1.8.1.81 소스](release-1-8-1-81.md)는 알림 직후 이전 화면을 제외하는 대기 시간을
2초로 제한한다. 현재 상태줄이 먼저 바뀐 뒤 오래된 대화 설정이 도착하면 같은 상태줄의
추가 변화를 무한히 기다리지 않고 모델·effort·Fast를 다시 맞춘다. 같은 설정 알림은
대기 시간을 연장하지 않는다. 상태줄이 가려진 동안에는 확인된 native 설정을 유지하며,
다음 시작용으로 명시적으로 저장한 설정은 별도로 보존한다. 데스크톱·Remote·Dashboard가
같은 호스트 모델 조회 서비스를 사용한다. 이 소스 수정은 아직 공개 EXE에 포함되지 않았다.

새로 선택한 모델·effort는 이전 프로세스의 종료 기록보다 우선한다. 작업 중 **저장
(다음 시작)**한 설정과 명시적인 모델 초기화도 보존하며, 초기화한 세션은 Acedia 기본
모델을 사용한다. 같은 세션 ID와 계정의
명시적 선택은 휴면 자식 세션의 폴더 상속에도 적용한다. 다른 계정에는 적용하지 않는다.
채팅에서 모델·effort만 바꿀 때 확인된 Fast 값을 유지하고 선택창에 함께 표시한다.
선택창을 열어 둔 사이 CLI에서 Fast를 바꿔도 최신 확인값을 사용한다. 목록 조회 중
도구·계정·작업 폴더·명시적 모델 설정이 바뀌면 오래된 선택을 적용하지 않고 다시 확인한다.
고급 실행에서 모델·서비스 티어를 직접 지정하면 자동 복원 값과의 충돌을 피한다.

검증 명령 `npm run codex:session-settings-smoke`는 `ACEDIA_CODEX_BINARY`로 지정한
설치된 Codex를 격리된 프로필·loopback 모델 응답으로 실행한다. 실제 대화 ID를 유지한
휴면·프로필 재로드·재개, 전역 기본값 변경 이후 모델·effort 복원, 새 선택 우선 적용과
Fast/Off 인수의 native config 해석을 확인한다. 실제 로그인 계정의 Fast 지원·과금은
검증하지 않는다. 전체 182개 파일·1,287개 검사, 최종 관련 회귀 검사, 프로덕션 빌드와
설치된 Codex 0.162.0의 재개·설정 인수 검증을 통과했다. 2026-10-10 화면 검증을
다시 실행해 `electron:chat-model-smoke`의 940·390·300px와 App 렌더러 검사를 통과했다.
별도 프로필의 실제 개발 앱(Vite `4420` + Electron main + 설치된 Codex)에서도
`/model`로 모델·effort를 바꾼 직후, 다음 메시지를 보내기 전에 현재값을 감지하고
채팅 선택창에 같은 값이 표시되는 것을 확인했다. UI에서 세션을 비활성화한 뒤 다시
열었을 때 저장된 모델·effort와 원래 대화 ID를 유지했고, 실제 CLI 요청의 모델·effort도
확인했다. 종료 후 검사용 CLI의 전역 기본값을 다른 모델·effort로 바꾸어도 세션의
저장값으로 복원했다. 이 개발 앱 검사도 격리된 CLI 홈과 loopback 모델 응답을 사용한다.
이 변경은 [EXE 1.8.1.74](release-1-8-1-74.md)에 포함되어 공개 배포·다운로드 검증을 마쳤다.

Fast 상태줄 회귀 검증은 `npm run codex:session-settings-smoke -- --inline-fast`다.
Codex **0.162.1**에서 **Luna / max / Fast → `/model`로 Sol / xhigh / Fast 선택 →
추가 메시지 없이 바로 휴면 → 저장 파일 재로드 → 같은 대화 재개**를 확인했다.
재개한 실제 상태줄과 로컬 서버로 전달된 요청의 모델·effort·티어도 확인했다.
격리된 프로필, 합성 인증 정보와 loopback 응답만 사용한다. 관련 **4개 파일·109개 검사**도
통과했다. 기존 일반 모델·effort 복원과 명시적 선택·Fast/Off 인수의 native 검증도
재실행해 통과했다 (`output/model-settings-native-regression.log`). 증빙은 `output/model-inline-fast-regression.log`,
`output/model-inline-fast-native.log`, `output/session-settings-cli/profile-o9xZfV/passed.json`이다.

검증 명령은 `app/`에서 `npm run electron:session-model-smoke`다. 실제 Remote 화면의
1024px·390px 메뉴, 모델별 effort 변경, 우클릭 대상, 작업 중 저장과 재시작 제한을 확인한다.
데스크톱은 `npm run electron:chat-model-smoke`로 별도 검증한다. 940·390·300px,
다크·라이트, Codex·Claude 옵션, 적용 실패, 입력 보존과 전송 차단을 확인하며 실제 App
렌더러의 저장·상속 해제·동일 대화 실행 인자까지 검사한다. IPC·CLI·클립보드는 검사용으로
대체하므로 사용자 세션을 실행하거나 실제 계정으로 모델 요청을 보내지 않는다.

추가 환경변수는 세션별 환경 복사본에 반영한다. Windows에서는 같은 이름의 기존 키를
대소문자 구분 없이 교체하며 부모 앱이나 다른 세션의 환경은 변경하지 않는다.
계정 홈·인증 변수, TERM/COLORTERM/NO_COLOR/FORCE_COLOR, 앱 연결용 MULTIAGENT_
변수 등은 편집을 차단한다. 보호 규칙은 화면과 Electron 실행 경계에서 함께 검사한다.
대화 복원·권한 생략·Alt-screen·인증 저장소를 충돌시키는 추가 인수도 차단한다.

경로는 실행 전에 실제 파일인지 확인한다. Windows 고급 실행은 PowerShell에서
자식 프로세스의 인수를 구성하며 .exe/.com, .cmd/.bat, .ps1 경로를 지원한다.
자동 감지는 해당 세션의 PATH에서 실행 파일을 찾는다. 기본 대화 복원과 작업자 설정
인수를 유지한 뒤 추가 인수를 전달한다. .cmd의 이중 해석과 Windows 명령 길이 제한을
별도로 처리하며, 길이 초과는 잘라서 실행하지 않고 오류로 반환한다.
인수·환경변수는 각각 최대 64개, 각 목록의 문자열 합계는 최대 24,000자다.

## 검증

* 단위 테스트: 도구별 저장·초기화·생성 시 복사·복원·기존 세션 보존, SSH 제외,
  환경 격리·대소문자 처리·보호 변수, 입력 오류, 구형 실행 프로세스 감지.
* Windows PowerShell 5/7의 실제 자식 프로세스: 공백·한글·따옴표·괄호·앰퍼샌드·
  퍼센트·백슬래시를 포함한 경로/인수, 기본 대화 복원 및 설정 인수 보존.
  실행 파일과 .cmd 전달 경로를 모두 확인한다.
* 숨김 Electron: 파일 선택/취소, 행 추가·삭제, 값 표시, 저장 실패, 입력 오류,
  도구 전환, 새 세션 상속, 기존 세션의 명시적 변경, 창 간 동기화와 reload 후 복원.
* 실제 ConPTY: 실행 파일 직접 지정과 PATH에서 찾은 .cmd에 인수·환경변수를 전달하고
  표준 입력/출력 왕복을 확인한다. 인증이나 모델 요청은 발생시키지 않는다.

검증 명령은 `app/`에서 `npm test`, `npm run build`,
`npm run electron:advanced-launch-smoke`이다. 실제 SSH 서버, POSIX 셸 실기,
설치본 배포와 .ps1 내부의 추가 전달 로직은 이번 실동작 검증 범위에 포함하지 않는다.
개발 중 실행 프로세스가 오래된 상태라면 앱을 다시 시작해야 고급 설정을 사용할 수 있다.
