---
type: Release
title: Acedia 1.8.2.34
status: published
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

## 배포 및 검증

- 2026-11-23 09:52:58 KST에 `ec05eef075ef6d70907d9889ea8986d2ea468357`에서 빌드한 Windows Standard EXE를 게시했습니다. [GitHub 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.34)
- 테스트 2,345개를 통과했습니다. 격리된 실제 Codex CLI에서 `/fast`를 켜거나 끈 뒤 같은 대화를 재시작해 다음 요청의 속도를 확인했습니다. 설치 패키지에서는 한도에서 결과 1,260건 확인, 이후 결과와 질문 유지, 토큰 배지와 보드 조회, Dashboard와 앱 수명주기를 검증했습니다.
- 세션 104개와 결과 1,500건을 사용한 개발 환경의 처리 시간 중앙값은 보드 갱신 87.49ms → 15.48ms, 사이드바 하달 대기 조회 83.82ms → 4.23ms였습니다.
- 1.8.2.32와 1.8.2.33에서 업데이트를 감지했습니다. 09:53:44 KST에 공개 자산의 SHA-256, NSIS CRC `97465efc`, 압축 데이터와 설치 프로그램 시작을 확인했습니다. 설치 파일의 Authenticode 상태는 `NotSigned`입니다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.34-x64.exe` | 156429994 | `9ffb989b8056fc8cca9d245bda25e3a2cc587798c5239b9d11b65c37fd6f7c17` |
| `Acedia-Setup-1.8.2.34-x64.exe.blockmap` | 163477 | `27fa8b671767ed4ffda6920c3cd02ee13235e990fe2caa953a7eab4bd60c1acd` |
| `latest-exe.json` | 256 | `1aa2385a4a3ef1df76beac375f0b8ac839fb82751d52b8770a7846ff072cf03c` |
