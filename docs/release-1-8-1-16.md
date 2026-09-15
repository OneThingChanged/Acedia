---
type: Release
title: Acedia 1.8.1.16 source changes
description: Browser extensions and right-side browser skill, deletion focus and Antigravity startup fixes. EXE publication pending.
status: draft
sources:
  - resource: browser-preferences.md
  - resource: embedded-browser-mcp.md
  - resource: workspace-interactions.md
  - resource: gemini-cli.md
  - resource: ../app/electron/services/acedia-browser-skill/SKILL.md
---

# Acedia 1.8.1.16

소스 커밋 버전입니다. EXE 빌드·GitHub Release 게시·설치 검증은 아직 수행하지 않았습니다.
현재 공개 설치본은 1.8.1.15이며, 아래 기능은 새 EXE 업데이트가 필요합니다.

## 변경 사항

- 설정 → 브라우저에서 압축 해제된 확장 폴더를 프로필별로 추가하고 켜기·끄기·제거합니다. 해당 프로필을 다시 열면 자동 로드하며 실패 원인과 재시도를 제공합니다. 웹스토어 직접 설치, CRX와 확장 버튼·팝업은 미지원입니다.
- “우측에 브라우저 띄워줘” 요청을 위한 `acedia-browser` 스킬을 제공합니다. `browser_open`의 배치 옵션과 `browser_show`로 대화 옆에 표시하고 기존 탭을 재사용합니다. 별도 패널에 배치한 기존 탭은 사용자 배치를 유지합니다.
- 로컬 Codex 실행 시 선택한 계정 홈에 스킬을 설치합니다. MCP 미발견 시 사용하는 Python 보조 스크립트도 포함합니다. 로컬 스킬만 설치해도 이전 EXE에 새 표시 기능이 생기는 것은 아닙니다.
- Antigravity 시작 시 `Invalid account provider`를 발생시키던 IPC 검증 누락을 수정합니다.
- 프로젝트·폴더 삭제와 삭제 불가 안내에 남아 있던 네이티브 대화상자를 교체하고, 삭제 후 터미널이 입력 포커스를 가져가거나 새 메뉴를 닫던 처리를 수정합니다.

## 검증과 남은 범위

TypeScript 검사와 프런트엔드 프로덕션 빌드를 통과했습니다. Electron 확장 검증은 콘텐츠 스크립트 실행, 프로필 격리, 켜기·끄기 및 설정 화면의 추가·전환·제거를 확인했습니다. 브라우저 표시 검증은 실제 앱 이벤트 전달과 별도 레이아웃 회귀 테스트를 포함합니다. 삭제 확인·취소 후 실제 마우스 입력과 드롭다운 검증도 통과했습니다.

스킬 형식, 계정별 설치, 보조 스크립트의 로컬 HTTP 요청과 브라우저 MCP 도구 목록을 확인했습니다. 최종 전체 회귀 검사는 **123개 파일, 737개 테스트 모두 통과**했습니다. 앞선 실행에서 `electron/usage-collector/distribution.test.mjs`가 합계 140 대신 0을 반환했으나 최종 실행에서는 통과했습니다. 이전 실패의 원인은 아직 확정하지 않았으며, 이 커밋이 해당 수집기 문제를 수정했다고 주장하지 않습니다.

이 커밋에서 EXE·APK·Store 산출물을 만들거나 게시하지 않습니다. 모바일 소스의 제품 버전 표기만 맞추며 기존 배포 APK는 유지합니다.
