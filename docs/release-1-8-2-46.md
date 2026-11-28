---
type: Release
title: Acedia 1.8.2.46
status: published
last_updated: 2026-11-28
---

# Acedia 1.8.2.46

- 프로젝트 보드의 제목과 보기 탭을 전용 상단 줄에 배치했습니다. 업무 보드, 세션, 업무 전달, Pixel Office, 계층을 전환해도 탭 위치가 유지됩니다.
- Windows 입력기가 Claude 터미널의 Esc나 Tab을 조합 키로 보고해도 실제 문자를 조합 중인 경우를 제외하고 터미널로 전달합니다.
- Codex 받은편지함 알림을 한 번의 붙여넣기로 전달합니다. 예상한 알림 전체가 입력란에서 확인된 뒤에만 Enter를 한 번 보냅니다. 원문 저장과 읽음 확인은 독립적으로 유지됩니다.
- Windows Standard 설치 파일에는 서명을 검증한 Android APK 1.8.2.42가 포함됩니다.

## English

- The Project board title and view tabs stay in place when switching views.
- Escape and Tab reach the terminal when a Windows input method reports a composition key outside an active composition.
- Codex inbox notifications use a single bracketed paste. Acedia submits the notification once after verifying the complete terminal draft. Inbox storage and read receipts remain independent.
- The Windows Standard installer bundles the signature-verified Android APK 1.8.2.42.

## 검증

- 제품 커밋 `69a0675fd1801cf3a98bd67999cccba03c3cb4fc`의 Windows Standard EXE를 게시했습니다. [GitHub 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.46)
- 테스트 2,409개와 TypeScript·Vite 빌드, 패키지 브리지·대시보드·수명주기 검사를 통과했습니다. 브리지 검사는 고부하 환경에서 외부 실행 제한 시간을 60초로 조정해 같은 패키지로 재검증했습니다.
- 격리한 실제 Codex에서 한글 발신자 알림 제출, 원문 읽기, 중복 실행 방지를 확인했습니다. 격리한 실제 Claude에서도 Usage 화면을 Esc로 닫았습니다. Codex 재개 직후의 별도 검사는 1.8.2.45와 1.8.2.46 모두 알림 제출 전의 준비 확인에서 시간 초과가 발생했습니다.
- 1.8.2.45에서 업데이트를 감지했습니다. 공개 자산 3개의 크기와 SHA-256을 빌드 결과와 대조했고, 공개 EXE의 자체 CRC, 내부 압축 데이터, Windows 시작 검사를 통과했습니다. EXE의 Authenticode 상태는 `NotSigned`입니다.
