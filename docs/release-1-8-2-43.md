---
type: Release
title: Acedia 1.8.2.43
status: published
last_updated: 2026-11-26
---

# Acedia 1.8.2.43

- Chat과 Remote에서 긴 텍스트를 붙여넣으면 원문을 UTF-8 TXT로 저장하고 세션에 파일 경로를 전달합니다. 짧은 붙여넣기는 입력창에 그대로 들어갑니다.
- Remote에서 기존 TXT 파일도 파일 선택, 붙여넣기 및 드래그 앤 드롭으로 첨부할 수 있습니다. 전송 실패 시 TXT 첨부를 다시 시도할 수 있습니다. TXT 한도는 8MB입니다.
- Windows Standard 설치 파일에는 서명을 검증한 Android APK 1.8.2.42가 포함됩니다. 새 서명 인증서로 인해 이전 APK 위에 설치할 때 Android가 업데이트를 거부할 수 있습니다.

## English

- Chat and Remote save long clipboard text as a UTF-8 TXT attachment and pass the file path to the session. Short pastes stay in the composer.
- Remote accepts TXT files through the file picker, paste, and drag and drop. Failed TXT uploads can be retried before sending. The TXT size limit is 8 MB.
- The Windows Standard installer bundles the signature-verified Android APK 1.8.2.42. Android may reject an in-place update from an APK signed with the earlier certificate.

## 검증

- GitHub에 제품 커밋 `6072ed132cae20c46c2ec1f458b2f6504cd7edd8`의 Windows Standard EXE를 게시했습니다. [GitHub 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.43)
- 전체 테스트 2,391개, TypeScript와 Vite 빌드, 패키지 브리지 및 수명주기 검사를 통과했습니다. 패키지의 Remote 서버에서 `/acedia` 하위 경로의 TXT 업로드 원본과 서명 검증한 APK의 다운로드 SHA-256이 일치했습니다.
- 1.8.2.42에서 업데이트 감지와 공개 EXE 다운로드를 검증했습니다. 릴리스 자산 3개의 해시와 공개 설치 파일의 NSIS CRC·압축 데이터·Windows 시작 검사가 통과했습니다. EXE의 Authenticode 상태는 `NotSigned`입니다.
