---
type: Release
title: Acedia 1.8.2.02
status: preparing
last_updated: 2026-11-02
---

# Acedia 1.8.2.02

- 1.8.2.01 설치 파일의 NSIS 무결성 오류를 수정한 EXE를 제공한다. 1.8.2.01의 Remote 대화 로딩·파일 접근·부모 자식 목록·세로 영상 개선을 포함한다.
- 빌드와 게시 전에 설치 파일 자체 CRC 및 압축된 모든 파일을 검사한다. 내려받은 파일이 manifest와 같더라도 원본이 이미 손상된 경우 배포를 차단한다.
- Windows에서는 실제 NSIS 시작까지 검사한다. 전용 검증 옵션은 설치, 기존 앱 종료 및 레지스트리 변경 전에 종료하며 기존 세션·사용자 데이터를 건드리지 않는다. 무결성 검사를 우회하지 않는다.
- 기존 서명 APK 1.8.1.39를 재사용한다. 새 APK·Store·Company 배포는 포함하지 않는다.

## English

- Replace the 1.8.2.01 installer whose embedded NSIS CRC and compressed executable were invalid.
- Require NSIS CRC, full compressed payload testing and safe native installer startup before publication. Retain all Remote improvements from 1.8.2.01.

## 검증

- 이전 설치본 1.8.1.96은 NSIS CRC와 내부 파일 검사를 통과했다. 1.8.2.01의 로컬 빌드 원본·공개 다운로드·앱 다운로드 캐시는 동일한 SHA-256이지만 CRC는 예상 `994795d7`, 실제 `60c75834`로 불일치했다. 7-Zip도 내부 `Acedia.exe`의 데이터 오류를 검출했다.
- 손상 발생 시점은 이전 설치 파일 생성 과정으로 좁혀졌으며 구체적인 하드웨어·압축기 원인은 확정하지 않았다.
- 전체 219개 파일·1,758개 테스트와 TypeScript/Vite 빌드를 통과했다.
- 새 EXE의 내부 CRC `9c2ebaf4`, 압축 파일 전체 검사, 실제 Windows NSIS 시작 검증을 통과했다. 검증 모드는 코드 73으로 종료했고 기존 Acedia 프로세스 6개는 유지됐다. 기존 설치본의 제거 프로그램 CRC도 정상이다.
- 공개 다운로드 검증 결과는 게시 후 기록한다.
