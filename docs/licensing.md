# Acedia 사용 조건 — 1.8.2.10부터

2026-11-12 요청에 따라 새 버전의 Acedia 고유 부분에는
[Acedia Personal Use and Organization Permission License 1.0](../LICENSE)을 적용한다.
이는 개인용 무료 사용을 허용하는 독점 라이선스이며 오픈소스 라이선스가 아니다.

| 사용·행위 | 새 버전 조건 |
| --- | --- |
| 개인의 비상업적 개인 용도 | 수정하지 않은 공식 배포본 무료 사용 |
| 기업·기관·학교·단체 업무, 개인의 사업·상업적 이용 | OneThingChanged의 사전 서면 허가 필요; 개인 계정·개인 PC도 예외 아님 |
| 설치·실행에 필요한 복사와 개인 백업 1개 | 허용 |
| 타인에게 복사·배포, 미러링·재판매·대여·서비스 제공 | 별도 서면 허가 없이 금지 |
| 소스 복제·추출·재사용, 기능·코드 수정, 파생 앱·비공식 빌드 제작 | 별도 서면 허가 없이 금지; 아래 독립 권리 예외 적용 |
| 정상 설정 변경, 문서화된 API·통합 사용 | 허용된 이용 범위에서 가능 |
| Acedia로 작업한 사용자의 프로젝트·대화·산출물 | 이 라이선스로 소유권·사용 조건을 바꾸지 않음 |

권한 요청 창구는 [OneThingChanged의 GitHub 프로필](https://github.com/OneThingChanged)에
표시된 비공개 연락 경로다. 허가를 요청했다는 사실만으로 사용이 허용되지는 않는다.
연락처·이메일·사업자 정보는 확인 없이 새로 만들지 않는다.

## 이전 MIT와 제3자 라이선스

- **1.8.2.09까지 이미 MIT로 제공된 부분의 권한은 소급 회수하지 않는다.**
  [이전 MIT 원문](../licenses/ACEDIA-LEGACY-MIT.txt)을 보존한다. 새 조건이 이전 사본의
  복제·수정 권한까지 차단한다고 표시하지 않는다.
- Pixel Agents·LobeHub·Expo·Electron·Git·의존성은 각자의 라이선스를 유지한다.
  [제3자 고지 색인](../THIRD-PARTY-NOTICES.md)을 참고한다. `mobile/LICENSE`의 Expo 고지와
  별도 `MultiagentSite/LICENSE`를 Acedia 자체 라이선스인 것처럼 덮어쓰지 않는다.
- GitHub 공개 저장소의 열람·포크 권한과 강행법상 권한을 계약 문구로 없애지 않는다.
  현재 저장소 공개 범위나 과거 이력은 변경하지 않는다. 소스 비공개·별도 공개 배포 저장소
  분리는 업데이터 URL과 배포 경로에도 영향을 주는 별도 운영 작업이다.
- Git 작성자에는 OneThingChanged/Jintaenate의 동일 계정과 Codex 기록이 있다.
  작성자 표시는 모든 권리 귀속의 법적 증명이 아니다. 별도 권리자의 자료가 있다면 그 부분은
  해당 허가 범위에서만 취급하며, 이 문서가 그 권리를 새로 취득했다고 주장하지 않는다.

## 배포 적용

Standard EXE 설치 화면에 같은 본문을 표시하고, 설치 파일에 `ACEDIA-LICENSE.txt`,
이전 MIT 고지와 제3자 고지 색인을 포함한다. README의 MIT 배지를 새 조건으로 바꾸며,
private npm 패키지의 메타데이터는 `UNLICENSED`로 표시한다. 이는 의존성 라이선스 변경이 아니다.
설치 화면용 RTF는 정본 `LICENSE`에서 생성하며 설치용 문구가 따로 달라지지 않게 검사한다.

이번 변경은 사용 조건과 고지의 적용이다. 기업 여부 탐지, 라이선스 키 검증, 복사 방지나
원격 차단 기능을 도입한 것은 아니다. 이미 배포된 APK·EXE의 파일이나 약관을 소급 수정하지 않는다.
설치 화면용 생성 문구와 포함 고지, 공개 EXE의 배포·검증 기록은
[1.8.2.10 배포 기록](release-1-8-2-10.md)에 남겼다.

정본은 영문 `LICENSE`이며 이 문서는 한국어 설명이다. 계약의 국가별 집행 가능성·기존 권리
문제에 대한 법률 검토를 대체하지 않는다.

참고: [GitHub 저장소 라이선스](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository),
[GitHub의 라이선스 변경 안내](https://opensource.guide/legal/),
[OSI 오픈소스 정의](https://opensource.org/osd).
