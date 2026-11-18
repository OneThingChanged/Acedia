# Acedia 사용 조건 — 라이선스 1.1

Standard EXE 1.8.2.26부터 적용하는 [Acedia Personal Use and Organization Permission License 1.1](../LICENSE)은
Acedia 고유 부분의 개인 비상업적 사용과 본인용 수정을 허용하는 독점 라이선스다.

| 사용·행위 | 새 버전 조건 |
| --- | --- |
| 개인의 비상업적 용도 | 무료 사용. 제공된 소스를 본인용으로 수정하고 직접 빌드·테스트·실행 가능 |
| 기업·기관·학교·비영리단체 업무, 개인의 사업·상업적 이용 | 설치·사용 전 OneThingChanged의 서면 허가 필요. 무료 평가, 사내 테스트, 개인 계정·개인 PC에서의 업무도 포함 |
| 허용된 개인 사용과 수정에 필요한 복사, 개인 백업 1개 | 저작권·라이선스 고지를 유지하면 허용 |
| 원본 또는 수정본의 재배포, 비공개 공유, 미러링·판매·대여·서비스 제공 | 유·무료에 관계없이 별도 사전 서면 허가 필요 |
| Acedia 코드나 자산을 별도 제품에 재사용 | 별도 허가 필요. 기존 MIT·제3자 권리는 아래 참조 |
| 정상 설정 변경, 문서화된 API·통합 사용 | 허용된 이용 범위에서 가능 |
| Acedia로 작업한 사용자의 프로젝트·대화·산출물 | 이 라이선스로 소유권·사용 조건을 바꾸지 않음 |

권한 요청 창구는 [OneThingChanged의 GitHub 프로필](https://github.com/OneThingChanged)에
표시된 비공개 연락 경로다. 허가를 요청했다는 사실만으로 사용이 허용되지는 않는다.
연락처·이메일·사업자 정보는 확인 없이 새로 만들지 않는다.

## 이전 배포와 제3자 라이선스

- **1.8.2.09까지 MIT로 제공된 부분**은 저작권·라이선스 고지를 유지하면 회사 사용,
  수정, 재배포가 가능하다. 그 권한은 이후 약관으로 소급 회수할 수 없다.
  [이전 MIT 원문](../licenses/ACEDIA-LEGACY-MIT.txt)을 보존한다.
- **1.8.2.10부터 1.8.2.25까지**의 배포에는 개인 비상업적 사용을 허용하는
  [당시 라이선스 1.0](https://github.com/OneThingChanged/Acedia/blob/v1.8.2.25/LICENSE)이 적용됐다.
  1.1의 개인 수정 허용은 1.1 조건으로 제공되는 배포에 적용한다.
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
이전 MIT 고지와 제3자 고지 색인을 포함한다. private npm 패키지의 메타데이터는
`UNLICENSED`로 표시한다.
설치 화면용 RTF는 정본 `LICENSE`에서 생성하며 설치용 문구가 따로 달라지지 않게 검사한다.

1.1은 약관과 고지로 사용 조건을 명시한다. 1.0의 최초 적용과 공개 EXE 확인 기록은
[1.8.2.10 배포 기록](release-1-8-2-10.md)을 따른다.

정본은 영문 `LICENSE`이며 이 문서는 한국어 설명이다. 계약의 국가별 집행 가능성·기존 권리
문제에 대한 법률 검토를 대체하지 않는다.

참고: [GitHub 저장소 라이선스](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository),
[GitHub의 라이선스 변경 안내](https://opensource.guide/legal/),
[OSI 오픈소스 정의](https://opensource.org/osd).
