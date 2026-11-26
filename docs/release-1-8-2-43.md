---
type: Release
title: Acedia 1.8.2.43
status: source
---

# Acedia 1.8.2.43

- Chat과 Remote에서 긴 텍스트를 붙여넣으면 원문을 UTF-8 TXT로 저장하고 세션에 파일 경로를 전달합니다. 짧은 붙여넣기는 입력창에 그대로 들어갑니다.
- Remote에서 기존 TXT 파일도 파일 선택, 붙여넣기 및 드래그 앤 드롭으로 첨부할 수 있습니다. 전송 실패 시 TXT 첨부를 다시 시도할 수 있습니다. TXT 한도는 8MB입니다.
- Windows Standard 설치 파일에는 서명을 검증한 Android APK 1.8.2.42가 포함됩니다. 새 서명 인증서로 인해 이전 APK 위에 설치할 때 Android가 업데이트를 거부할 수 있습니다.

## English

- Chat and Remote save long clipboard text as a UTF-8 TXT attachment and pass the file path to the session. Short pastes stay in the composer.
- Remote accepts TXT files through the file picker, paste, and drag and drop. Failed TXT uploads can be retried before sending. The TXT size limit is 8 MB.
- The Windows Standard installer bundles the signature-verified Android APK 1.8.2.42. Android may reject an in-place update from an APK signed with the earlier certificate.
