---
type: Guide
title: Pixel Office — 프로젝트 보드와 우측 사무실 보기
description: Pixel Agents의 공개 픽셀 자산에 Acedia의 세션 상태와 부모·자식 관계를 연결한다.
status: stable
last_updated: 2026-10-29
sources:
  - resource: ../app/src/components/PixelOffice.tsx
  - resource: ../app/src/components/PixelOffice.css
  - resource: ../app/src/lib/pixelOffice.ts
  - resource: ../app/src/lib/pixelOfficeRenderer.ts
  - resource: ../app/src/components/SessionOrganization.tsx
  - resource: ../app/src/components/FileTreePanel.tsx
  - resource: ../app/scripts/electron-pixel-office-smoke.mjs
  - resource: ../app/public/pixel-agents/NOTICE.txt
---

# Pixel Office

Standard EXE 1.8.1.97의 공유 사무실 변경이다. 검증·공개 배포 상태는 [릴리스 기록](release-1-8-1-97.md)을 따른다. 최초 Pixel Office는 1.8.1.96에 포함됐다.

## 하나의 공유 사무실 (1.8.1.97)

1.8.1.97에서는 프로젝트별 세로 방 카드 대신 **하나의 연속된 2D 사무실**을
그린다. 프로젝트 폴더 팀은 이름·은은한 바닥색으로 구분하는 부서이며 같은 바닥과
열린 통로를 공유한다. 벽은 사무실 외곽에 한 번만 표시한다. 기존 카드 grid의 자동
행 높이가 큰 방보다 작아 다음 방의 벽이 앞 방 직원을 덮던 문제를 없앴다.

**전체 보기**는 모든 부서·직원을 화면에 맞추고, 부서 이름을 누르면 그 부서로 이동한다.
휠·+/−·100%로 확대하고 바닥 드래그·가운데 버튼·화살표로 이동한다. 사무실 영역에서
`0`을 누르면 전체 보기로 돌아간다. Tab으로 화면 밖 직원을 선택하면 해당 자리로
이동한다. 캔버스와 키보드 선택 버튼은 같은 좌표·변환을 사용하며 viewport의 native
스크롤은 막아 좌표 어긋남을 방지한다. 작은 화면의 전체 보기는 조직 개요용이며 이름과
상태는 부서 이동·100% 확대·선택 정보에서 확인한다.

페이지 제한 없이 필터에 맞는 모든 직원을 접근 가능한 버튼으로 유지한다. 캔버스와
고정 배경은 화면 크기로 제한하고 화면 밖 가구·캐릭터는 그리지 않는다. 이미지 공유 캐시,
4fps, 숨김 시 중단, reduced motion의 정지 포즈와 1초 상태 갱신은 유지한다.

아래 열기·관계 설명은 1.8.1.97 소스를 기준으로 한다. 문서 뒤의 이전 검증 기록은 당시 공개 버전의 기록이며, 이번 배포 검증과 구분한다.

개발 검증은 관련 **7개 파일·79개 검사**, TypeScript, Vite production build와
실제 App을 띄운 숨김 Electron smoke를 통과했다. 합성 16부서·117직원으로
1600/1280px 보드, 320px 우측과 짧은 680px 창을 확인했다. 화면 좌표에서 직원
선택 영역의 겹침·이탈, 캔버스 크기·변환, 포인터 기준 확대·드래그·키보드 이동,
화면 밖 직원 focus 후 native scroll 0, 실제 포인터 선택을 검사했다. 숨김 창에는
OS focus가 없어 해당 focusin만 주입하며 창을 표시하거나 실제 사용자 세션을 쓰지 않는다.
상태·직급·필터·메모·명시적 대화 열기·이미지 캐시·4fps·reduced motion·숨김 중단·
닫기 정리도 검사했다. 로그와 화면은 무시되는 `output/pixel-office-shared-floor/`의
`tests.log`, `typecheck.log`, `build.log`, `electron.log`, `board-1600.png`,
`board-1280.png`, `board-readable.png`, `sidebar-follow.png`, `sidebar-all.png`,
`sidebar-readable.png`, `sidebar-short-height.png`에 보관한다. 전체 보기 화면의 작은
이름은 확대해서 확인하며 `sidebar-readable.png`는 100%로 선택한 직원의 모습이다.

독립 검증에서도 보드·우측 각각 100%에서 native Tab 20회·Shift+Tab 1회와 Enter
선택을 통과했다. 이 검사는 숨김 창의 실제 OS focus 대신 CDP focus emulation을
사용하며 포커스 이벤트를 직접 주입하지 않는다. 직원 영역·캔버스 변환·hit target·
native scroll 0과 선택만으로 PTY·대화 경로가 바뀌지 않는 것을 확인했다.
기록은 `output/pixel-office-shared-floor-review/electron-review.log`다.

## 열기와 배치

- **Project Board → Pixel Office**에서 공유 사무실을 크게 본다.
- 우측 파일·Source Control 탭 옆 **Pixel Office 아이콘**으로 작은 사무실을 연다.
- 큰 화면의 **우측에 고정**은 작업 화면으로 돌아가며 우측 Office를 연다.
- 우측의 **크게 보기**는 같은 세션 선택을 가지고 Project Board의 Office로 이동한다.
- 오른쪽 패널의 마지막 Files/Source Control/Office 선택을 로컬에 저장한다.

사무실을 표시하기 위해 CLI를 시작하거나 재시작하지 않는다. 캐릭터를 누르면 정보만
선택하며 화면 그룹·대화 선택·입력 초안은 바뀌지 않는다. **대화 열기**만 기존 세션
선택 경로를 호출한다. **메모**는 기존 사람이 쓰는 개인 메모 창을 연다. 정보 패널은
접을 수 있고 캐릭터를 다시 선택하면 펼친다.

우측은 현재 프로젝트를 따라가며 전체 또는 특정 프로젝트로 전환할 수 있다.
프로젝트·세션 이름과 경로를 검색하며 대화 기록이나 이미지를 조회하지 않는다.

## 실제 상태와 조직 관계

**등록된 프로젝트의 루트 폴더가 팀**이다. Windows의 대소문자·슬래시·끝 구분자를
정규화해 같은 폴더의 중복 등록을 한 팀으로 표시한다. 이름이 같아도 폴더가 다르면
다른 팀이며 `G:/AI`와 그 안의 프로젝트처럼 상하위 경로를 임의로 합치지 않는다.
SSH는 호스트별로 구분한다. 자식의 실제 작업 폴더가 하위 폴더로 바뀌어도 등록된
프로젝트 팀을 유지한다. 중복 등록과 세션 소속을 실제로 합치거나 저장하지는 않는다.

팀은 공유 사무실의 부서, 세션은 책상과 캐릭터다. 현재 `parentId`로 부모와 자식을 정렬하고
연결선·상위 이름을 표시한다. 생성한 주체가 다른 프로젝트여도 현재 관계를 따른다.
캐릭터는 세션 ID, 책상 순서는 생성 시각과 계층으로 결정하므로 작업 상태가 바뀌거나
최근 대화를 열었다고 자리가 뒤섞이지 않는다. 저장된 이름·위치·부모·모델은 수정하지 않는다.

직급은 검색·활성 필터 적용 **전의 전체 팀 관계**로 계산한다.

| 관계 | 직급과 배치 |
|---|---|
| 부모 없음·직속 자식 있음 | 팀장, 금색 표시와 상단 자리 |
| 부모와 직속 자식 모두 있음 | 중간 관리자, 보라색 표시와 부하 위 자리 |
| 부모 있음·자식 없음 | 부하 직원, 상위 세션 이름과 연결선 |
| 부모·자식 모두 없음 | 일반 직원, 이름이나 프로젝트 이름으로 승격하지 않음 |

한 팀에 실제 상위 세션이 여러 개 있으면 팀장도 여러 명이다. Sleeping·정지·검색으로
부하가 화면에서 사라져도 팀장을 일반 직원으로 바꾸지 않는다. 같은 이름의 세션은
화면에서만 `#1`, `#2`로 구별하며 저장된 이름은 유지한다. 직급은 시각화 정보이며
세션 지시권·실행 권한·Dangerous 설정이나 작업 소유권을 변경하지 않는다.

**활성 팀**은 실제 활성 부모의 정지·Sleeping·미시작 자식과 손자를 포함한다.
활성 자식을 보여주려고 문맥으로 넣은 비활성 부모의 무관한 비활성 형제는 제외한다.
보관한 세션·다른 프로젝트로 잘못 연결된 자식은 확장하지 않는다. 활성 수는 실제
실행 상태만 집계하며, 전체 보기에서는 정지된 세션도 자리를 유지한다.

| 호스트 상태 | 사무실 표현 |
|---|---|
| 실행 중인 PTY만 있고 작업 증거 없음 | 대기 중, 작업 애니메이션과 구분 |
| 최근 working 훅 | 작업 중, 두 프레임 타이핑 |
| 현재 read/search 도구 시작 | 읽는 중, 두 프레임 읽기 |
| 질문·승인 대기 | 응답 대기 말풍선 |
| blocked | 확인 필요 표시 |
| done | **현재 응답 완료**, 작업 결과 검토 완료와 구분 |
| Sleeping·정지·연결 끊김 | 꺼진 모니터·흐린 캐릭터, 상태 이름 유지 |

명령 종료 후 남아 있는 이전 도구 이름만으로 읽는 중으로 표시하지 않는다. 오래된
작업 이벤트와 취소도 작업 중으로 계속 표시하지 않는다. 실행 상태가 종료됐으면
마지막 working/done 이벤트보다 우선한다. 장식용 걷기와 모니터 애니메이션은 호스트
상태를 바꾸거나 모델·터미널에 입력하지 않는다.

## 자원 사용

- 실제 Pixel Agents PNG **18개, 약 36KB**와 원문 라이선스·출처를 앱에 포함한다.
- 렌더러 전체에서 이미지 로딩 Promise를 공유한다. 매 프레임·상태 변경·보드/우측
  전환 때 이미지를 다시 만들지 않는다. 실행 중 외부 CDN이나 별도 서버가 필요 없다.
- 배경·고정 가구는 캐시한 Canvas에서 재사용하며 캐릭터는 초당 4회 그린다.
- 화면 밖 사무실 viewport와 숨겨진 문서는 그리기 타이머를 중단한다. 탭 변경·닫기 시
  타이머와 관찰자를 해제한다. reduced motion에서는 걷기와 프레임 변화를 멈춘다.
- 모든 직원의 선택 버튼을 유지하며 화면 안 캐릭터만 그린다. 좁은 우측에서도
  Canvas는 viewport 크기(DPR 최대 2배)를 넘지 않는다. 실제 세션은 제거·변경하지 않는다.
- 별도 AI 호출, 전체 대화 파싱, 신규 파일 감시기, 에이전트 실행 서비스는 추가하지 않는다.

## 외부 자산

[Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)의
`b1bafd02896d90d83457266575a1e8e5011ce997`에서 선택한 자산을 변경 없이 포함했다.
원문 MIT 라이선스와 Copyright (c) 2026 Pablo De Lucca를
`app/public/pixel-agents/LICENSE.txt`에 보존한다. 캐릭터의 기반인
[JIK-A-4 MetroCity](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack)는 CC0다.
가구는 [공개 자산 전환 PR #117](https://github.com/pixel-agents-hq/pixel-agents/pull/117)
이후의 번들만 사용한다. 자세한 출처는 `NOTICE.txt`에 기록했다.

Acedia가 상태 어댑터·배치·Canvas 렌더러를 제공한다. Pixel Agents의 전체 VS Code
확장, CLI, 서버나 훅 설치기를 실행·번들하지 않는다. 기존 Codex/Claude 설정에도
별도 훅을 설치하지 않는다. 이번 구현 대상은 데스크톱 App이며 Remote PWA/APK에는
이 화면을 추가하지 않았다. 자유 배치·가구 편집기는 이번 범위에 포함하지 않는다.

## 검증

관련 45개 검사와 실제 App의 격리 Electron 검사로 다음을 확인했다.

- 실제 등록 정보로 두 프로젝트의 방·세션·부모 관계 표시, 빈 목록에 가짜 세션 없음.
- 캐릭터 선택만으로 CLI 시작·대화 이동 없음, 명시적 대화 열기 경로와 구분.
- 호스트 PTY/훅 증거에 따른 읽기·응답 대기 표시, 정지·Sleeping 상태 보존.
- 18개 이미지의 최초 로드 후 애니메이션·연속 훅·보드→우측 전환 시 재로드 없음.
- 좁은 우측의 책상 경계, 프로젝트 따라가기, Git 탭 복귀와 큰 보기 전환.
- 숨김 시 그리기 중단, 재표시 후 재개, Office를 닫은 뒤 타이머 해제.

명령: `npm run electron:pixel-office-smoke` (`app/`).
로그: `output/pixel-office-tests.log`, `output/pixel-office-electron.log`.
화면: `output/pixel-office/board.png`, `output/pixel-office/sidebar.png`.

최초 전체 검사에서는 **1,601개 통과·1개 실패**였다. 기존 native routing의
43MiB zstd 이미지 전달 바이트 비교가 실패했으며 해당 파일 22개를 단독 재검사한
결과는 통과했다. 이 작업에서 라우팅 코드를 변경하지 않았다. 기록은
`output/pixel-office-full-tests.log`, `output/pixel-office-native-recheck.log`다.
첫 빌드 프로세스의 비정상 종료도 기록했으며, 이후 검증에서 새 테스트 데이터의
필수 Agent 필드를 보완했다. 최종 빌드·전체 재검사 결과는 아래에 기록한다.

최종 결과는 **209개 파일·1,602개 검사 전체 통과**다.
`output/pixel-office-full-tests-final.log`와 `output/pixel-office-build-final.log`에 기록했다.
기존 Project Board의 드래그·팬·확대·관계 편집·되돌리기, 활성 필터·계층 정렬,
부모 이동·설정 상속·대화 재개, 1600/1280/800px 검사를 모두 통과했다
(`output/pixel-office-organization-regression.log`). 새 Office의 최종 App 검사도
`output/pixel-office-electron-final.log`에서 통과했다. 이미지·LICENSE·NOTICE 20개가
production `dist/pixel-agents/`에 원본과 같은 해시로 포함된 것도 확인했다.

최초 빌드 종료 코드는 `0xC0000005`였으며 다음 실행들에서는 재현되지 않았다.
초기 zstd 비교 실패와 이 종료의 원인을 이번 UI 변경으로 단정하거나, 라우팅·PC
메모리 문제가 해결됐다고 판단하지 않는다. 이 작업에서 해당 동작을 바꾸지는 않았다.

## 현재 등록 정보에 적용한 모습 (2026-10-27)

설치 앱의 읽기 전용 프로젝트·세션 API와 공통 프로필의 등록 메타데이터를 결합해
실제 등록 항목의 미리보기를 확인했다. 대화·명령·메모 본문은 읽거나 전달하지 않았다.
같은 폴더의 중복 등록은 한 팀으로 표시하고 세션이 없는 등록은 빈 사무실로 만들지
않는다. 실제 부모가 여러 개 있는 팀은 팀장 여러 명을 표시하며, 관계가 없는 세션은
프로젝트와 이름이 같아도 일반 직원으로 표시했다. 개인별 명단·직급 합계와 관계는
소스 문서에 복사하지 않고 아래 로컬 결과에만 기록했다.

상태는 조회 시점의 API 스냅샷이며 동작 중인 제품 UI는 기존 호스트 이벤트로 계속 갱신한다.
기존 설치 앱은 교체하지 않았고 실제 세션을 시작하거나 관계·이름·설정을 저장하지 않았다.
미리보기는 격리 프로필의 동일 Office 컴포넌트에서 그렸으며 쓰기 동작은 0회다.

결과는 `output/pixel-office/current-acedia-team.png`, `current-rndhub-team.png`,
`current-projects-merged.png`와 `current-teams.json`이다. 개인 등록 정보이므로 저장소에
추가하지 않고 무시되는 로컬 output에만 보관했다.

폴더·직급 보완의 관련 **5개 파일·51개 검사**, TypeScript/Vite production build와
실제 App의 부모 상단 배치·직급 표시·활성 필터 후 직급 유지 검사를 통과했다.
`output/pixel-office-roles-tests-final.log`, `output/pixel-office-roles-build.log`,
`output/pixel-office-roles-electron-final.log`에 기록했다. 실제 등록 정보의 읽기 전용
렌더링은 `output/pixel-office-current-preview.log`에서 쓰기 0회로 검증했다.
