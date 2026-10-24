---
type: Release
title: Acedia 1.8.1.94
status: draft
last_updated: 2026-10-24
---

# Acedia 1.8.1.94

- Codex 라우팅 연결 준비 중 받은 요청을 전송 후에도 보관하던 문제를 수정했다. 전송 완료·연결 종료·연결 실패 시 초기 대기열을 정리한다.
- 이미지·도구 결과가 포함된 큰 메시지를 중계할 때 원래 UTF-8 데이터를 전달해 불필요한 JSON 재생성과 복사를 줄였다.
- 여러 세션의 HTTP 요청 본문 버퍼에 공통 **256 MiB** 한도를 적용했다. 병합·압축 해제 공간도 예약하며, 공간이 부족하면 일시적인 HTTP 503으로 안내한다. 계정 배정이나 로그인 상태는 유지한다.
- 인증 재시도가 끝나 응답 헤더를 받으면 요청 본문 참조를 해제해, 긴 응답을 받는 동안 큰 이미지 맥락을 계속 보관하지 않게 했다. 실패·취소 시에도 버퍼 예약을 반환한다.

이번 수정은 라우팅의 메모리 보관과 중계 부하를 줄인다. 간헐적 PC 프리징의 직접 원인이나 Windows 메모리 손상 문제가 해결됐다는 판정은 아니다. 256 MiB는 요청 본문 버퍼 한도이며 프로그램 전체 메모리 제한은 아니다.

Standard EXE 업데이트다. 번들 Android APK는 기존 서명 검증본 **1.8.1.39/code 21**을 재사용한다.

## English

- Release startup relay requests immediately after forwarding, and clear pending payloads when a connection closes or fails.
- Forward original UTF-8 messages where no mutation is required, avoiding repeated JSON serialization and copies of large image or tool payloads.
- Share a **256 MiB** HTTP request-body buffer budget across routed sessions, including concatenation and decompression reservations. Return a temporary HTTP 503 when space is unavailable while preserving account ownership and login state.
- Release request-body references after authentication retry and response headers, rather than retaining image-rich history throughout a streamed response. Return reservations on failure and cancellation too.

These changes reduce relay memory retention and copying. They do not establish that the intermittent PC freezes or Windows memory-corruption failures have been resolved. The buffer budget does not cap total application or child-process memory. This Standard EXE reuses the existing signed Android **1.8.1.39/code 21** artifact.

## 검증

- 라우팅·본문 압축 해제·WebSocket 관련 **129개 검사** 통과.
- 128 MiB JS 힙 제한의 격리 Node 검사에서 연결 12개를 열어 둔 채 초기 요청을 회수했다. 수정 전에는 파싱 객체 12개가 남았고, 수정 후 입력 버퍼와 파싱 객체가 모두 회수됐다.
- 설치된 Codex CLI와 로컬 모의 서버에서 HTTP 스트림·캐시 식별자·계정 제외 후 대화 재개를 검증했다.
- 격리된 native 세션의 **43 MiB 이미지 맥락** 조회·resume·compaction·후속 턴 검증을 통과했다. 사용자 계정과 실행 중인 앱의 라우팅 설정은 변경하지 않았다.
- PC 전체 **206개 파일·1,579개 검사** 통과. 단일 worker와 60초 검사 제한으로 실행했으며 `output/exe-94-tests.log`에 결과를 남겼다.
- PC 의존성 보안 검사에서 취약점 **0개**를 확인했다.
- 실제 Electron의 세션·프로젝트 생성 상호작용과 **18개 화면 조합**, 조직·폴더 이동·재개·동기화, 세션 사용량, 터미널 링크·native PTY 검사를 통과했다. `output/exe-94-electron-*.log`.
- `npm run account-pool:memory-smoke` 재검증 통과. `output/exe-94-account-pool-memory-smoke.log`.
- native PTY 성공 표식과 종료 코드 0을 확인했다. 종료 시 기존 `AttachConsole failed` 진단 출력이 남았으며, 실행·입출력 검증의 실패와 구분했다.
- 패키지·공개 다운로드 검증 결과는 완료 후 기록한다.

## 배포 기록

고정 소스 푸시와 EXE 빌드·검증·공개 게시를 진행한다. 설치 프로그램 실행과 사용 중인 앱의 교체는 별도다.
