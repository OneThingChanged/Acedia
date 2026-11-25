---
type: Release
title: Acedia 1.8.2.41
status: published
last_updated: 2026-11-25
---

# Acedia 1.8.2.41

- Remote 웹과 웹앱에서 알림 버튼을 다시 누르면 해당 브라우저의 웹 푸시 구독을 해제합니다. 새로고침 이후에도 끈 상태를 기억합니다.
- 세션 현황의 **내 확인**은 최신순으로 표시하며 각 항목에 날짜와 시간을 표시합니다. 결과 기록이 저장 한도에 닿으면 오래된 결과부터 정리해 새 결과를 계속 저장합니다.
- Codex 세션 간 전달은 터미널 상태와 별도로 API 수신함에서 원문을 읽을 수 있습니다. 자동 알림은 메시지 전체가 입력창에 표시된 이후 제출합니다.
- 이번 Windows 설치 파일은 검증된 Android APK 1.8.1.39를 포함합니다. `/acedia/` 주소를 쓰는 Android 앱은 기존 릴리스 서명키로 새 APK를 빌드해야 합니다.

## English

- Click the notification button again in Remote to unsubscribe the current browser from web push. Remote remembers this setting after reload.
- The session overview shows attention items newest first with full timestamps. Old results roll off at the storage limit so the board can keep recording new results.
- The Codex session inbox returns the original message independently of terminal state. Automatic notifications submit after the full message appears in the composer.
- The Windows installer includes the verified Android APK 1.8.1.39. Android connections to a mounted path such as `/acedia/` require a new APK signed with the original release key.

## 검증

- 2026-11-25에 `de72661ca83c350441691232d89e97be31dc7216`에서 빌드한 Windows Standard EXE를 게시했습니다. [GitHub 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.41)
- 소스 테스트 2,384개와 패키징된 앱의 Dashboard 및 수명주기 검사를 통과했습니다.
- 1.8.2.36, 1.8.2.39, 1.8.2.40에서 업데이트를 감지했습니다. 공개 다운로드로 받은 세 자산의 SHA-256과 설치 파일의 NSIS CRC, 압축 데이터, Windows 시작 검사를 확인했습니다. 설치 파일의 Authenticode 상태는 `NotSigned`입니다.
