---
type: Feature
title: 에이전트 고급 실행 설정
description: 로컬 세션의 CLI 실행 파일, 추가 인수, 환경변수와 기본값 적용 범위.
tags: [settings, agents, sessions]
status: stable
last_updated: 2026-10-08
sources:
  - resource: ../app/src/components/AdvancedLaunchOptions.tsx
  - resource: ../app/src/components/AgentsSettings.tsx
  - resource: ../app/src/components/SessionPropertiesModal.tsx
  - resource: ../app/src/lib/agentDefaults.ts
  - resource: ../app/src/lib/spawn.ts
  - resource: ../app/electron/shared/launch-options.mjs
  - resource: ../app/electron/services/agent-launch.mjs
  - resource: ../app/scripts/electron-advanced-launch-smoke.mjs
  - resource: ../app/src/components/ChatModelPicker.tsx
  - resource: ../app/src/lib/chatSessionModel.ts
  - resource: ../app/electron/services/session-model-service.mjs
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
* 새 로컬 프로젝트의 첫 세션과 새 세션은 생성 시 기본값을 복사한다. 생성 창에서
  고급 설정을 변경하거나 초기화하면 해당 세션에만 적용한다.
* 기존 세션은 세션 속성 → 실행 옵션에서 직접 편집한다. **현재 기본값 불러오기**는
  현재 도구 기본값을 세션 편집 초안에 복사한다. **변경 저장** 후 그 세션에 적용하며
  이후 기본값을 바꿔도 기존 세션은 변하지 않는다. 탭 이동·취소·충돌 처리는
  [세션 속성](properties-and-usage.md)을 따른다.
* 변경은 다음 실행부터 반영된다. 실행 중이면 비활성화한 뒤 다시 열어 적용한다.
  설정 변경만으로 프로세스를 종료하거나 대기 세션을 시작하지 않는다.
* 설정이 없던 기존 세션은 기존 실행 방식을 유지한다. 앱 재시작과 창 이동 시 세션에
  저장된 설정을 복원한다.
* SSH에는 로컬 고급 기본값을 복사하거나 전달하지 않는다. SSH의 추가 옵션은 SSH 연결
  인수이며 이 기능과 별개다. 원격 CLI 경로·인수·환경변수 편집은 후속 범위다.

환경변수 값은 다른 실행 설정과 함께 로컬 프로필에 저장된다. 화면의 값 가리기는
표시 기능이며 별도의 자격 증명 저장소가 아니다. 계정 로그인 정보는
[Codex 계정](codex-accounts.md)과 [Claude 계정](claude-accounts.md) 기능에서 관리한다.

## 실행 규칙

데스크톱 채팅 입력창 아래의 **모델** 또는 **effort** 버튼에서 세션 설정을 변경한다.
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
기존 대화 ID와 계정을 확인한 뒤 같은 대화를 복원한다. 새 CLI의 시작 hook을 확인해야
재시작 성공을 표시한다. 대화 파일·계정·hook 확인에 실패하면 오류를 표시하며 저장된 설정은
유지한다. SSH와 다른 도구는 현재 지원하지 않는다. 기본 CLI 설정 파일은 변경하지 않는다.

Codex는 해당 세션의 실제 로그인 또는 분산 계정에서 `model/list`를 조회하고, 모델별로
지원하는 effort만 제공한다. Claude는 설치된 `claude --help`에서 모델 별칭과 effort 옵션을
읽는다. 이 목록은 계정 권한 목록이 아니며 실제 접근 권한과 모델별 effort 지원은 Claude가
실행 시 검증한다. 기존 Claude 대화에서 사용한 전체 모델 ID도 선택할 수 있다.
고급 실행의 `--model`·`--effort` 또는 Codex `model`·`model_reasoning_effort` 설정과 충돌하면
적용하지 않고 해당 옵션을 제거하도록 안내한다.

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
