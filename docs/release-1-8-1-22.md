---
type: Release
title: Acedia 1.8.1.22 EXE release
description: Dashboard account registration and native account routing, Remote Hosting and video playback.
status: stable
sources:
  - resource: account-pool.md
  - resource: remote-service.md
  - resource: ../app/electron/services/account-pool.mjs
  - resource: ../app/scripts/electron-packaged-smoke.mjs
  - resource: ../app/scripts/build-electron-standard.mjs
---

# Acedia 1.8.1.22

- 기존 Dashboard의 **Usage → 계정 관리·분산**에서 계정 추가, 기기 코드 로그인,
  재인증, 이름 변경, 분산 참여와 사용량·한도 확인을 제공한다.
- Acedia 자체 요청 처리로 새 로컬 Codex 세션을 활성 계정들에 배분한다.
  같은 세션은 같은 계정을 유지하고 인증 정보는 운영체제 암호화로 보관한다.
- 원격 관리 화면의 계정 설정은 소유자만 사용할 수 있다. 기존 외부 연결 설정을
  자체 기능으로 대체하며 기존 설정을 자동 가져오지 않는다.
- 이전 미게시 소스의 Hosting 페이지와 MP4/WebM 재생·Documents 영상 목록도 포함한다.

이 릴리스는 EXE 채널이다. 기존 서명 검증된 Android APK 1.8.1.19를 포함하며
새 APK나 Microsoft Store 제출은 생성하지 않는다. 모바일에서 사용하는 웹 화면은
업데이트된 데스크톱 서버에서 제공된다.

분산 기능은 설치된 Codex CLI와 모의 계정 응답으로 검증했다. 실제 사용자 계정의
로그인·상용 요청·실제 한도 소진은 별도 검증 대상이다. 이번 EXE 빌드는 별도의
깨끗한 소스 체크아웃을 사용하며 작업 중이던 hook 변경 2개는 포함하지 않는다.
GitHub 게시와 사용 중인 PC의 업데이트 설치는 별도 상태다.

GitHub EXE 채널 게시 완료: https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.22
공개 업데이트 감지와 설치 파일 다운로드·SHA-256 검증을 통과했다. 로컬 설치는 별도다.
