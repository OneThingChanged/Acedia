---
type: Release
title: Acedia 1.8.2.42
status: published
last_updated: 2026-11-25
---

# Acedia 1.8.2.42

- Claude를 같은 대화로 재시작할 때 이전 실행의 미완료 기록으로 인해 세션 간 전달이 `turn-working`에 멈추는 문제를 수정했습니다. 입력 준비가 확인되면 대기 중인 메시지를 기존 ID로 전달합니다.
- 현재 실행의 완료 훅과 빈 입력창이 확인되면 대화 기록 갱신을 기다리는 동안에도 전달을 재개합니다. 작업 중인 세션, 백그라운드 작업, 질문, 승인, 입력 초안은 계속 보호합니다.
- Windows Standard EXE에는 기존 서명 검증을 거친 Android APK 1.8.1.39가 포함됩니다.

## English

- Fixed a handoff stall where an unfinished turn from a previous Claude process could keep a resumed conversation in `turn-working`. Pending handoffs keep their original message IDs and resume when the conversation can accept input.
- Delivery can resume when a current completion hook and an empty composer confirm readiness while the transcript catches up. Active work, background work, questions, approvals, and drafts still block automatic delivery.
- The Windows Standard installer includes the existing, signature-verified Android APK 1.8.1.39.

## 검증

- 2026-11-25에 `23ef4e46708212fd400c795da470de69447eb871`에서 빌드한 Windows Standard EXE를 게시했습니다. [GitHub 릴리스](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.42)
- 소스 테스트 2,385개, TypeScript·Vite 빌드, 패키지의 Dashboard·수명주기 검사와 Claude 수정 코드 포함 여부를 확인했습니다. 내장 MinGit은 Windows ZIP 압축 해제 호환성 수정 후 원본 해시와 실행을 검증했습니다.
- 1.8.2.40과 1.8.2.41에서 업데이트를 감지했습니다. 공개 자산 세 개의 SHA-256, 설치 파일의 NSIS CRC·압축 데이터·Windows 실행을 검증했습니다. 설치 파일의 Authenticode 상태는 `NotSigned`입니다.
