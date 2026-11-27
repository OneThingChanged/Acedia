---
type: Release
title: Acedia 1.8.2.45
status: published
last_updated: 2026-11-27
---

# Acedia 1.8.2.45

- 데스크톱 프로젝트 트리와 최근 대화의 세션 행 높이와 들여쓰기를 맞췄습니다. 세션 이름 아래에 모델을 표시하고, Fast가 확인된 경우 모델 옆에 번개를 표시합니다. 폴더 경로와 세부 정보는 행에 마우스를 올리면 확인할 수 있습니다.
- 최근 대화 오른쪽의 아이콘으로 Sleeping과 Idle을 각각 숨기거나 표시할 수 있습니다. 선택은 앱을 다시 열어도 유지되며, 표시되는 자식의 부모 행은 계층에 남습니다.
- Windows Standard 설치 파일에는 서명을 검증한 Android APK 1.8.2.42가 포함됩니다.

## English

- Project and Recent conversations use the same compact row spacing and hierarchy indentation. Each row shows the session name and model, with a lightning icon when Fast mode is known. Paths and session details appear on hover.
- Separate icons next to Recent conversations show or hide Sleeping and Idle sessions. The choices persist between launches, and visible children retain their parent rows.
- The Windows Standard installer bundles the signature-verified Android APK 1.8.2.42.

## 검증

- 제품 커밋 `9aa84ffc66bbddb42eec98b9c96f15e498932739`의 Windows Standard EXE를 게시했습니다. [GitHub 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.45)
- 테스트 2,400개와 TypeScript·Vite 빌드, 패키지 브리지·수명주기 검사, 설치본의 사이드바 필터와 모델 표시 검사를 통과했습니다.
- 1.8.2.44에서 업데이트를 감지했으며 공개 자산 3개의 크기와 SHA-256이 빌드 결과와 일치했습니다. 공개 설치 파일의 자체 CRC, 내부 압축 데이터, Windows 시작 검사를 통과했습니다. EXE의 Authenticode 상태는 `NotSigned`입니다.
