---
type: Integration
title: Acedia 내장 스킬과 연결 진단
status: source-verified
last_updated: 2026-11-14
sources:
  - resource: ../app/electron/services/acedia-skills.mjs
  - resource: ../app/electron/services/acedia-capabilities.mjs
  - resource: ../app/electron/services/hook-service.mjs
  - resource: ../app/electron/services/browser-mcp-server.mjs
  - resource: ../app/electron/services/acedia-connection.test.mjs
  - resource: ../app/electron/services/acedia-skills.test.mjs
  - resource: ../app/scripts/acedia-skills-cli-smoke.mjs
  - resource: ../app/scripts/fixtures/acedia-connection-workspace.mjs
---

# 내장 스킬과 연결 진단

Acedia 설치·실행을 전제로 기존 MCP 자동 연결을 유지한다. 별도 플러그인 등록,
마켓플레이스 설치나 전역 AGENTS.md/CLAUDE.md 추가는 하지 않는다. 실제 동작·권한은
기존 MCP/API가 담당하고 스킬은 필요한 작업 절차를 설명한다.

이 문서의 추가 기능은 **2026-11-14 소스 검증 상태**다. 실행 중인 설치본에 반영되려면
해당 소스의 앱 업데이트가 필요하며, 이미 실행된 CLI는 MCP·스킬 목록을 갱신해야 한다.

## 자동 설치 범위

로컬 세션을 시작할 때, 선택한 계정의 설정 홈에 다음 스킬을 설치·갱신한 뒤 CLI를 실행한다.

| 스킬 | 사용 목적 |
| --- | --- |
| `acedia-browser` | 기존 내장 브라우저 연결·명시적 화면 표시 |
| `acedia-connection` | 호스트 연결·버전·지원 기능·스킬 상태 진단 |
| `acedia-workspace` | 세션 관리·UTF-8 메시지·요청된 작업 분담·Codex 계정 전환 |
| `acedia-page-capture` | 렌더링된 페이지의 본문·원본 이미지 수집과 누락 확인 |

Codex는 선택 계정의 `CODEX_HOME/skills/`, Claude는 `CLAUDE_CONFIG_DIR/skills/`를
사용한다. 해당 환경변수가 없으면 제공자의 기본 설정 홈을 사용한다. 별도 계정 홈도
동일하게 처리하며 SSH 호스트나 다른 제공자에 이 로컬 스킬을 배포하지 않는다.
MCP 연결과 hook 설정의 기존 프로젝트 병합 경로는 그대로 유지한다.

`acedia-workspace`는 공통 주의점과 필요한 reference 선택만 안내한다. 세션·메시지·
위임·라우팅의 상세 절차는 요청에 해당하는 파일만 읽는다. 스킬은 새 기능을 실행 가능하게
만들거나 계정·권한·Dangerous 설정을 변경하지 않는다. 사용자 질문·승인도 대신 답하지 않는다.

## 기존 파일과 업데이트

스킬 루트의 `.acedia-managed-skills.json`은 bundle 버전과 앱이 관리한 파일별 해시를
기록한다. 같은 번들의 재설치는 파일을 다시 쓰지 않는다. 이전 관리 해시와 현재 내용이
일치한 파일만 새 내용으로 갱신하며, 삭제된 관리 파일은 복구한다.

기존 이름의 사용자 파일이나 앱 설치 후 직접 수정한 파일은 보존한다. 배포 원본과 이미
동일한 기존 파일은 관리 대상으로 인수할 수 있다. 관련 없는 스킬·제공자 설정은 변경하지
않는다. 스킬 내부의 링크·정션을 따라 쓰지 않으며 손상된 관리 manifest도 덮어쓰지 않는다.

수정 충돌은 `modified`, 누락은 `missing`, 읽기·쓰기 문제는 `error`로 진단한다. 스킬
설치 실패 자체가 CLI 실행을 중단시키지는 않는다. 진단으로 원인을 확인하고 사용자가
수정한 파일을 자동 덮어써 해결하지 않는다. API 연결 설정 실패와 스킬 설치 실패는 별개다.

## 연결 진단 MCP/API

- MCP: 인수 없는 읽기 전용 `acedia_connection`.
- HTTP: 인증된 `GET /integration/v1/workspace/capabilities`.
- HTTP 인증은 기존 Bearer와 `x-acedia-agent-id`를 사용한다. 브라우저 Origin은 거부한다.
- 비활성·미등록 호출자도 인증 후 해당 연결 상태와 호스트 기능을 조회할 수 있다.
  이 예외는 다른 생성·시작·메시지 쓰기 API의 활성 호출자 조건을 완화하지 않는다.

응답은 다음을 구분한다.

| 필드 | 의미 |
| --- | --- |
| `host` | 실제 호스트 제품 버전·API 버전·PID |
| `caller` | 호출 ID의 등록 여부·실행 여부·제공자 |
| `features.*.supported` | 호스트에 구현·연결된 API 그룹 |
| `features.*.available` | 해당 그룹을 현재 호출 연결에서 사용할 수 있는지 |
| `tools` | 호스트가 지원하는 MCP 도구 이름 목록 |
| `skills` | 해당 호출자 계정 홈의 bundle 버전·스킬 파일 상태 |
| `bridge` | MCP 호출일 때 현재 bridge 버전·호스트와 도구 목록 차이 |

반환에는 인증값, 계정 이메일, 로그인 URL, 대화 내용이나 전체 세션 목록을 넣지 않는다.
`supported`/`available`은 대상 세션의 준비 상태나 작업 승인·성공을 의미하지 않는다.
대상은 `acedia_session_status`, 라우팅 계정은 `acedia_session_routing`, 전달 결과는
해당 메시지/전달 receipt로 따로 확인한다.

bridge에 없는 호스트 도구는 `hostOnlyTools`, 호스트가 지원하지 않는 bridge 도구는
`bridgeOnlyTools`로 표시한다. 전자는 MCP/CLI 갱신을 권장하고 후자는 호스트의 버전과
서비스 상태를 확인한다. bridge가 일치해도 모델 클라이언트의 별도 도구 캐시는 오래됐을
수 있다. 현재 도구 목록에 없다는 이유만으로 제품에 기능이 없다고 단정하지 않는다.

## 오래된 도구 목록의 진단

`acedia_connection` 도구 자체가 보이지 않으면 `acedia-connection` 스킬에 포함된
`scripts/check.mjs`를 기존 MCP와 같은 Node 런타임으로 실행한다. 추가 플러그인이나
Python 설치는 필요하지 않다.

```text
node <acedia-connection 스킬 폴더>/scripts/check.mjs
```

스크립트는 현재 세션이 상속받은 연결 정보만 사용해 loopback GET 한 번을 보낸다.
Proxy·리다이렉트를 사용하지 않고 사용자 인수를 받지 않는다. 환경 누락, 호스트 연결
실패, 인증 실패, 구형 호스트의 404와 응답 스키마 불일치를 구분한다. 오류 본문과 인증값을
출력하지 않는다. 프로필의 다른 세션 인증값 탐색이나 자동 세션 재시작은 하지 않는다.

## 검증

`app/`에서 다음 검사를 실행했다.

- 연결·스킬 설치·HTTP/stdio MCP·hook 병합·CLI 시작·라우팅·IPC의 **8개 파일, 139개 검사 통과**.
- TypeScript/Vite 빌드 통과.
- 추가한 세 스킬은 공식 `skill-creator`의 `quick_validate.py` 통과.
- `npm run codex:skills-smoke`: 격리 홈의 실제 설치 Codex `skills/list`가 네 스킬을 발견했다.
  thread/turn, 로그인이나 모델 요청은 시작하지 않았다.
- `npm run electron:connection-smoke`: 격리된 실제 main/coordinator/HTTP/ConPTY에서
  현재 버전·지원 도구·Codex 스킬 상태와 Claude 계정 홈 자동 설치를 확인했다. 진단에 의한
  CLI 재시작·세션 선택·창 활성화는 없었다.

Electron의 CLI는 모의 실행기이며 Claude의 실제 모델 응답·스킬 선택은 이 검사 범위에
포함하지 않는다. 실제 사용자 프로필·세션을 변경하거나 앱 배포를 수행한 검사가 아니다.
