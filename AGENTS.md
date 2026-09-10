# MultiAgent 프로젝트 지침

## 배포 채널 분리

- Standard는 공개 EXE 채널이며 GitHub Release에서 네 자리 버전으로 업데이트한다. EXE와 Store는 설치 ID·데이터·업데이트 경로를 분리한다. 이전 Standard 로컬 개발자 전용/Store 단독 공개 배포 지침보다 이 규칙을 우선한다.
- EXE 배포 시 `docs/exe-release-workflow.md`를 따른다. 설치 파일과 같은 빌드의 `latest-exe.json`을 함께 게시한다. EXE 요청만으로 Store를 재제출하지 않는다.

- 사용자가 **“라이브 배포”** 또는 이에 준하는 표현을 사용하면 Git 저장소와 GitHub Release 채널만 배포한다.
- 라이브 배포만 요청된 경우 Microsoft Store용 MSIX 빌드, 검증, Partner Center 업로드 및 제출을 실행하지 않는다.
- Microsoft Store 배포는 사용자가 **“Microsoft Store 배포”**를 별도로 명시한 경우에만 진행한다.
- 제품 버전은 네 부분 `X.Y.Z.R`을 사용한다. Microsoft Store 배포 시에는 별도 채널의 버전 검증 규칙도 확인한다.
- 두 채널을 모두 배포해야 할 때도 GitHub와 Microsoft Store 절차를 각각 독립적으로 검증하고 실행한다.

## 작은 변경의 버전 증가

- 작은 수정·개선은 Git 커밋을 기준으로 네 번째 자리 `R`만 1 올린다. 예: `1.7.3.0` → `1.7.3.1` → `1.7.3.2`.
- 같은 커밋을 재빌드하거나 재검증할 때는 버전을 추가로 올리지 않는다. 변경과 버전 갱신을 같은 커밋에 포함한다.
- npm 호환 버전은 앞의 세 자리 `X.Y.Z`를 유지하고, 제품 버전·설치 파일명·Android versionName은 `X.Y.Z.R`로 맞춘다. APK를 갱신할 때는 Android versionCode도 증가시킨다.
- 네 번째 자리 증가만으로 Company의 세 자리 GitHub 업데이터나 Store 배포를 자동 수행하지 않는다. 해당 채널 배포는 별도 요청과 검증을 따른다.

## Store 자동 배포 요청

- **“스토어 빌드해줘”, “스토어 배포해줘”, “Microsoft Store 배포”**는 소스 고정, Store 버전 결정, 테스트, MSIX 빌드, verifier/packaged smoke/WACK, 업로드, 인증 제출과 통과 후 즉시 게시까지 승인한 요청이다. 정상 검증을 통과하면 제출 직전에 같은 승인을 다시 묻지 않는다.
- **“스토어 빌드만”**은 로컬 생성·검증, **“스토어 초안까지만”**은 업로드까지만이다. **“라이브 배포”**의 기존 GitHub 전용 범위는 유지한다.
- 시작할 때 `node app/scripts/release-store.mjs doctor --online`으로 인증·도구·현재 제출을 확인하고 `docs/store-release-automation.md`를 따른다. 한국어·영어 릴리스 노트를 변경 내용에 맞게 작성한 뒤 `npm run release:store -- deploy --notes <JSON> --background`를 `app/`에서 실행한다.
- 기존 작업 트리를 보존하고 실행기가 만든 별도 소스 커밋에서 빌드한다. Store 버전은 `X.Y.Z.0`으로 승격하며 기존 Store 버전보다 커야 한다. 재개는 같은 run ID와 산출물을 사용한다. Store 요청으로 APK·GitHub 릴리스를 생성하지 않는다.
- 인증 중인 제출은 취소하거나 덮어쓰지 않는다. 기존 제출 상태를 보고하고 완료 후 새 요청으로 진행한다. 요청하지 않은 제출 초안을 자동 삭제하지 않는다.
- `deploy` 요청 자체가 최종 제출 승인이다. 과거 인계 문서의 매번 최종 확인 지침보다 이 규칙을 우선한다. 인증 설정 부재, 검증 실패, 불확실한 제출 결과는 상태와 원인을 기록하고 해결 전 제출하지 않는다.
- 접수/인증 중/게시 완료/설치 검증 완료를 구분한다. API의 `Published`만으로 설치·업데이트 테스트가 통과했다고 보고하지 않는다.
