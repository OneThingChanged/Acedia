---
type: Release
title: Acedia 1.8.2.21
status: published
last_updated: 2026-11-16
---

# Acedia 1.8.2.21

- 세션 메시지가 1,000건 쌓이면 새 보고를 저장하지 못하던 문제를 개선한다. 읽음·전달 완료가 확인된 오래된 메시지를 색인이 있는 별도 보관소로 옮겨 활성 저장 공간을 확보한다.
- 보관 후에도 메시지 ID로 원문을 읽고, 과거 수신함·발신함을 조회하거나 원래 메시지에 답장할 수 있다. 과거 Chat 카드도 원문을 표시하며 같은 요청 키의 중복 실행을 방지한다.
- 미확인·전달 대기·결과 불명 메시지는 보존한다. 관리자가 작업 중이면 새 보고를 먼저 저장하고 기존 대기열에서 입력 준비 후 알림을 전달한다. 보관소 누락·손상이나 저장 실패 시에는 전송을 차단한다.
- 업데이트 적용 후 자동 보관을 사용할 수 있다. 이전에 저장 한도로 거부된 보고는 발신자가 기존 요청 키와 같은 본문으로 다시 보내야 한다. 저장되지 않은 보고를 자동 생성하거나 재전송하지 않는다.
- Standard EXE 채널이며 기존 서명 APK 1.8.1.39를 재사용한다.

## English

- Automatically archive older durably read terminal messages when the active mailbox reaches its 1,000-record or 16-MiB limit, allowing new reports to be saved.
- Preserve original-text lookup, inbox/outbox history, replies, past Chat cards and per-request deduplication across archival and restarts.
- Retain unread, pending and uncertain messages. Save a new report while its recipient is busy and use the existing readiness queue for its notification. Block delivery if persistence or archive integrity cannot be verified.
- Apply the desktop update to enable archival. Reports rejected before they were saved require an explicit retry with the original request key and unchanged content; they are not reconstructed or resent automatically.
- Standard EXE release reusing the signed Android APK 1.8.1.39.

## 검증

- 버전 갱신 후 전체 Vitest 265개 파일·2,141개 테스트, 고정 소스의 TypeScript/Vite 프로덕션 빌드와 모바일 26개 테스트·타입 검사가 통과했다.
- 운영과 같은 1,000건·읽음 820건 조건에서 새 보고 저장·작업 중 대기·준비 후 한 번의 알림을 확인했다. 보관 전후 페이지 경계·원문·해시·답장·권한·동일 키 거부, 용량 한도, 저장 중 종료 복구와 보관소 누락·손상도 검사했다.
- 운영 메시지의 삭제·수동 보관·재전송, 사용자 세션의 중단·재시작·실제 설치와 GUI 자동화는 수행하지 않았다.

## 패키지 검증

- 제품 소스 `724e1298a52860cfd3599c7db15df70df301fc1b`를 별도 작업 폴더에 고정하고 독립 복사한 의존성으로 빌드했다. ASAR 런타임·렌더러 434개 파일, Pixel Office 자산·라이선스 20개와 정본 라이선스·제3자 고지를 원본과 대조했다.
- 패키지의 Electron Node 런타임·인증된 HTTP·native PTY 검사 30개가 통과했다. 1,000건·읽음 820건의 기존 JSON에서 자동 보관 후 활성 800건·미확인 181건 유지, 작업 중 새 보고 저장, 재시작 후 원문·요청 키 중복 방지와 준비 후 한 번의 알림을 확인했다. 다른 수신자의 원문 조회는 거부했다.
- 기존 Remote 하위 경로·세션·보드·전달·라우팅·내장 스킬 검사도 통과했다. 최근 전달 근거가 보관돼도 보드 목록과 원문 조회를 유지한다.
- 로컬·공개 EXE의 NSIS CRC `1f0328d5`, 내부 압축 데이터 전체와 설치 전 검증 모드가 통과했다. Authenticode 상태는 `NotSigned`다. 설치 검증 모드는 설치·레지스트리 변경·기존 앱 종료 전에 종료한다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.21](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.21).
- 게시: **2026-11-16 04:06:31 KST**. 공개 전체 다운로드 검증: **2026-11-16 04:07:31 KST**.
- **`1.8.2.20` / `1.8.2.19` → 1.8.2.21** 감지를 실제 업데이터로 확인했다. 태그·manifest·EXE·blockmap의 버전·크기·SHA-256이 빌드 원본과 일치한다.
- 기존 설치본은 앱 업데이트를 적용해야 한다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포는 수행하지 않았다. 운영 메시지 수동 정리·다른 세션으로 보고 재전송·사용자 PC 설치는 수행하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.21-x64.exe` | 156375860 | `6c02bacaa349cf2afa5d5e3acbc9ac4f5b2646f5704239f19d0ba1d4bd7887e7` |
| `Acedia-Setup-1.8.2.21-x64.exe.blockmap` | 163403 | `0fe86a6f6450ed103c4da69ff340ca33142478a0b1f89444a730383caf99e3f4` |
| `latest-exe.json` | 256 | `827e22522f44cad0c8fac814f7169f2ba0f5f30a837671725fcf79daa9d2d8e2` |
