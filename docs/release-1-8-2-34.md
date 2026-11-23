---
type: Release
title: Acedia 1.8.2.34
status: draft
last_updated: 2026-11-23
---

# Acedia 1.8.2.34

- 세션 현황의 **내 확인 → 결과**에서 현재 프로젝트와 검색에 맞는 결과를 일괄 확인할 수 있습니다. 저장 한도 경고 중에도 동작하며, 질문·오류와 이후 도착한 결과는 목록에 남습니다.
- 보드 갱신에서 결과를 한 번에 모아 처리합니다. 사이드바에서 하달 대기 상태를 조회할 때 처리할 보드 데이터와 실행 모델 조회를 줄였습니다.
- Codex 상태줄에 속도가 표시되지 않아도 `/fast`로 선택한 속도가 같은 대화를 재시작할 때 복원됩니다.
- 실행 중인 로컬 Codex 세션의 최근 요청이 입력 20만 토큰 이상이면 사이드바에 배지를 표시합니다. 배지에 마우스를 올리면 캐시를 포함한 정확한 입력 토큰 수가 표시됩니다.
- Windows Standard EXE에는 기존에 서명한 Android APK 1.8.1.39를 포함합니다.

## English

- Use **Your attention → Results** to mark all results matching the current project and search as reviewed. The action works at the result storage limit and preserves questions, errors and later arrivals.
- Process result candidates together on board refresh. Sidebar delegation status checks use less board data and skip live model lookups.
- Restore the selected Codex `/fast` speed when restarting the same conversation, including when the status line omits speed.
- Show a sidebar badge when an active local Codex session's latest request reaches 200,000 input tokens. Hover for the exact input count, including cached tokens.
- The Windows Standard EXE bundles the existing signed Android APK 1.8.1.39.
