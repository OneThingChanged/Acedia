---
type: Release
title: Acedia 1.8.2.44
status: published
last_updated: 2026-11-27
---

# Acedia 1.8.2.44

- Remote 채팅에서 번호 목록이 모두 `1.`로 표시되는 문제를 수정했습니다. 빈 줄과 들여쓴 설명으로 나뉜 항목의 번호가 이어지고, 새 목록은 원문의 시작 번호를 유지합니다.
- Windows Standard 설치 파일에는 서명을 검증한 Android APK 1.8.2.42가 포함됩니다.

## English

- Fixed ordered lists in Remote chat. Numbering continues across blank lines and indented explanations, and each separate list honors its starting number.
- The Windows Standard installer bundles the signature-verified Android APK 1.8.2.42.

## 검증

- 제품 커밋 `0ee1bdfb24dfff6f0d38abd896112a579704c958`의 Windows Standard EXE를 게시했습니다. [GitHub 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.44)
- 테스트 2,393개와 TypeScript·Vite 빌드, 패키지 브리지·수명주기 검사, 패키지에 포함된 Remote 목록 번호와 캐시 검사를 통과했습니다.
- 1.8.2.43에서 업데이트를 감지했으며 공개 자산 3개의 크기와 SHA-256이 빌드 결과와 일치했습니다. 공개 설치 파일의 자체 CRC, 내부 압축 데이터, Windows 시작 검사를 통과했습니다. EXE의 Authenticode 상태는 `NotSigned`입니다.
