---
type: Release
title: Acedia 1.8.2.18
status: published
last_updated: 2026-11-15
---

# Acedia 1.8.2.18

- 프로젝트 보드의 기본 화면을 프로젝트별 세션 표로 바꾸고, 업무 전달 표와 기존 보드를 전환할 수 있게 했다. 현재 상태와 최근 수신 지시를 구분하며, 조직상의 부모를 실제 발신자로 추정하지 않는다.
- 전달의 저장·알림 전달·수신·원문 읽음·응답 시작을 각각 실제 시각으로 표시한다. 선택한 전달은 새 기록이 도착해도 유지되며 원문 상세 열람은 받는 세션의 읽음 상태를 바꾸지 않는다.
- `acedia_board`와 인증된 로컬 HTTP API로 같은 현황과 선택한 전달 원문을 조회한다. CLI 내부 에이전트를 Acedia 자식 세션으로 표시하지 않는다.
- 세션 메시지의 한 줄 개행을 데스크톱·Remote·Dashboard 채팅에서 보존한다. 기존 Markdown 표·코드·링크와 일반 대화의 문단 규칙, 원문 저장·복사 내용은 유지한다.
- 내장 세션 스킬과 메시지 전송 도구에 읽기 쉬운 인계 작성 지침을 추가했다. 중간 보고와 최종 인계를 구분하고 결론·완료한 일·남은 일·문제·근거를 나누도록 안내한다. 기존 원문을 자동으로 다시 작성하지 않는다.
- Codex의 native `priority`와 Fast 해제의 `null`을 상속할 때 하위 세션 생성이 차단되던 검증을 수정했다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 재사용한다.

## English

- Add a default project-grouped session table, handoff history and a switch to the existing board. Keep current execution, historical incoming requests and organizational parents distinct.
- Show separately observed delivery stages and load exact original requests on demand without changing recipient read receipts. Preserve the selected request during updates.
- Expose the same overview through the read-only `acedia_board` MCP tool and authenticated local HTTP API.
- Preserve original handoff line breaks in desktop, Remote and Dashboard Chat while retaining Markdown tables, code, links and exact copied text.
- Guide future handoffs toward readable interim/final reports with conclusions, completed and remaining work, issues and evidence links.
- Accept native Codex `priority` and explicit Fast-off `null` settings during child-session launch.
- Reuse the existing signed 1.8.1.39 Android APK for this Standard EXE release.

## 검증

- 전체 Vitest 259개 파일·2,086개 테스트가 실패·대기 없이 통과했다. 내장 세션 스킬 검증도 통과했다.
- 고정 소스의 TypeScript/Vite 프로덕션 빌드·EXE 패키지·공개 다운로드 검증도 통과했다.
- 운영 세션의 입력·중단·재시작과 GUI 자동화는 수행하지 않았다. 공개 게시와 사용자 PC의 설치·업데이트 확인은 구분한다.

## 패키지 검증

- 제품 소스 `a517c9669f46d1d643fe7cb736bcac8aaeacd65a`를 별도 작업 폴더에 고정하고 독립 복사한 의존성으로 빌드했다. ASAR 런타임·렌더러 424개 파일, Pixel Office 자산·라이선스 20개, 정본 라이선스·제3자 고지를 원본과 대조했다.
- 패키지의 Electron Node 런타임·인증된 HTTP·native PTY로 24개 항목을 확인했다. 세션 표 API의 revision 폴링·선택 원문 조회·읽음 영수증 보존·보기 저장, 비인증·다른 Origin·비활성 호출자 거부가 통과했다.
- Remote·Dashboard에서 단일 개행 보존, 일반 대화·코드 블록 유지와 실제 메시지 렌더러 연결을 확인했다. 원문 UTF-8 보존과 채팅 조회 시 읽음·재전송이 발생하지 않는 점도 검증했다.
- Codex 자식 실행의 `priority`와 `null`을 상속·명시하는 네 경우, Codex·Claude 양쪽 제공자 조합, 첫 지시 중복 생성·전송 방지, 내장 스킬 설치·사용자 수정본 보존을 확인했다.
- 기존 보드 창의 종료·재열기 어댑터, 결과별 확인, 부모·자식 상태, 첨부·입력 큐·계정 라우팅과 깊은 경로 검사도 통과했다. 패키지 검증용 비활성 호출자 fixture의 활성 판정을 바로잡고 다시 실행했으며 제품 소스는 변경하지 않았다.
- 로컬·공개 EXE의 NSIS CRC `a2ee7ee5`, 내부 압축 데이터 전체와 설치 전 검증 모드가 통과했다. Authenticode 상태는 `NotSigned`다. 실제 설치나 사용 중인 앱 종료는 수행하지 않았다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.18](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.18).
- 게시: **2026-11-15 20:53:39 KST**. 공개 전체 다운로드 검증: **2026-11-15 20:54:31 KST**.
- **`1.8.2.17` / `1.8.2.16` → 1.8.2.18** 감지를 실제 업데이터로 확인했다. 태그·manifest·EXE·blockmap의 버전·크기·SHA-256이 빌드 원본과 일치한다.
- 기존 설치본은 앱 업데이트를 적용해야 한다. CLI를 다시 시작하면 새 MCP 도구·스킬을 검색한다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포는 수행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.18-x64.exe` | 156362660 | `1c040b62f4efda35b5296c1988d2f424bffb73f4d1c3764d09f5bf7a24cf65db` |
| `Acedia-Setup-1.8.2.18-x64.exe.blockmap` | 163478 | `ed1f35da9d3f2e535d8f8adbbb08969123248ecfb32b873f0ca2efe798a8c05a` |
| `latest-exe.json` | 256 | `045aa0fd62d836c4f95ac6c6d57734c5f8d2324abc5d37691108efe978971d98` |
